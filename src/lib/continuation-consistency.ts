import type { AiContinuationContext } from "./ai-continuation";
import type { Project } from "./knowledge";

export type ContinuationRiskSeverity = "high" | "medium" | "low";
export type ContinuationRiskCategory =
  | "identity"
  | "relationship"
  | "status"
  | "worldRule"
  | "pendingFact"
  | "unsupportedClaim";

export type ContinuationConsistencyFinding = {
  id: string;
  severity: ContinuationRiskSeverity;
  category: ContinuationRiskCategory;
  message: string;
  textQuote: string;
  evidence: string;
  recommendation: string;
  source: "rule" | "model";
};

export type ContinuationConsistencyReport = {
  fingerprint: string;
  status: "checked" | "partial" | "unavailable";
  findings: ContinuationConsistencyFinding[];
  checkedAt: string;
};

type ModelFindingInput = Partial<Omit<ContinuationConsistencyFinding, "id" | "source">>;

const categorySet = new Set<ContinuationRiskCategory>([
  "identity",
  "relationship",
  "status",
  "worldRule",
  "pendingFact",
  "unsupportedClaim",
]);
const severitySet = new Set<ContinuationRiskSeverity>(["high", "medium", "low"]);

function normalize(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function shortQuote(text: string, needle: string) {
  const index = text.indexOf(needle);
  if (index < 0) return normalize(text).slice(0, 140);
  return normalize(text.slice(Math.max(0, index - 36), index + needle.length + 72));
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function getContinuationCheckFingerprint(
  project: Project,
  context: AiContinuationContext,
  text: string,
) {
  return stableHash([
    project.id,
    text,
    context.grounding.mode,
    ...context.factConstraintNotes,
    ...context.ragReferences,
  ].join("\n"));
}

function finding(
  partial: Omit<ContinuationConsistencyFinding, "id" | "source">,
  index: number,
): ContinuationConsistencyFinding {
  return { ...partial, id: `rule-${index + 1}`, source: "rule" };
}

export function runRuleBasedContinuationCheck(
  project: Project,
  context: AiContinuationContext,
  text: string,
): ContinuationConsistencyReport {
  const normalizedText = normalize(text);
  const findings: ContinuationConsistencyFinding[] = [];

  for (const character of project.characters ?? []) {
    const state = character.attributes.find((attribute) => attribute.locked && /状态/.test(attribute.title));
    if (!state || !/已死亡|死亡/.test(state.value) || !normalizedText.includes(character.name)) continue;
    if (!/出现|推门|走进|走来|开口|说道|点头/.test(normalizedText)) continue;
    findings.push(finding({
      severity: "high",
      category: "status",
      message: `${character.name} 的锁定状态为“${state.value}”，正文却描述其正常登场。`,
      textQuote: shortQuote(normalizedText, character.name),
      evidence: `${character.name}：${state.title}：${state.value}`,
      recommendation: "确认是否为回忆、幻象或时间线切换；否则删除该登场描述。",
    }, findings.length));
  }

  for (const suggestion of project.aiSuggestionPool ?? []) {
    if (suggestion.status !== "pending") continue;
    const candidateText = `${suggestion.title} ${suggestion.detail}`;
    const hasCandidateDetail = candidateText.split(/[。；，、\s]/).filter((part) => part.length >= 4).some((part) => normalizedText.includes(part));
    if (!hasCandidateDetail || !/已被证实|已确认|真相是|确实存在/.test(normalizedText)) continue;
    findings.push(finding({
      severity: "medium",
      category: "pendingFact",
      message: `“${suggestion.title}”仍是 AI 待确认资料，正文将其写成了确定事实。`,
      textQuote: shortQuote(normalizedText, suggestion.title),
      evidence: `待确认建议：${suggestion.title}；${suggestion.detail}`,
      recommendation: "改为人物猜测或传闻，或先在 AI 建议待确认中人工确认。",
    }, findings.length));
  }

  for (const rule of project.records.filter((record) => record.type === "worldRule" && record.status === "locked")) {
    const prohibition = rule.summary.match(/(?:不得|不可|不能)\s*([^。；，]+)/)?.[1]?.trim();
    if (!prohibition || !normalizedText.includes(prohibition)) continue;
    findings.push(finding({
      severity: "high",
      category: "worldRule",
      message: `正文触及锁定世界规则“${rule.name}”禁止的行为。`,
      textQuote: shortQuote(normalizedText, prohibition),
      evidence: `${rule.name}：${rule.summary}`,
      recommendation: "调整行为，或明确写出规则允许的例外及其来源。",
    }, findings.length));
  }

  if (context.grounding.mode === "limited" && /已被证实|确定是|原来是|确实存在/.test(normalizedText)) {
    findings.push(finding({
      severity: "low",
      category: "unsupportedClaim",
      message: "当前为长期资料不足的保守续写，正文出现了确定性断言。",
      textQuote: shortQuote(normalizedText, "已"),
      evidence: context.grounding.gaps.join("；") || "长期检索证据不足。",
      recommendation: "改为推测、传闻或补充可检索的原文证据。",
    }, findings.length));
  }

  return {
    fingerprint: getContinuationCheckFingerprint(project, context, text),
    status: "checked",
    findings,
    checkedAt: new Date().toISOString(),
  };
}

export function validateModelConsistencyFindings(
  raw: unknown,
  sourceEvidence: string[],
): ContinuationConsistencyFinding[] {
  if (!Array.isArray(raw)) return [];
  const knownEvidence = sourceEvidence.join("\n");
  return raw.slice(0, 12).flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as ModelFindingInput;
    const category = typeof candidate.category === "string" && categorySet.has(candidate.category as ContinuationRiskCategory)
      ? candidate.category as ContinuationRiskCategory
      : null;
    const severity = typeof candidate.severity === "string" && severitySet.has(candidate.severity as ContinuationRiskSeverity)
      ? candidate.severity as ContinuationRiskSeverity
      : null;
    const message = normalize(typeof candidate.message === "string" ? candidate.message : "");
    const textQuote = normalize(typeof candidate.textQuote === "string" ? candidate.textQuote : "");
    const evidence = normalize(typeof candidate.evidence === "string" ? candidate.evidence : "");
    const recommendation = normalize(typeof candidate.recommendation === "string" ? candidate.recommendation : "");
    if (!category || !severity || !message || !textQuote || !recommendation) return [];
    const evidenceMatchesInput = Boolean(evidence) && knownEvidence.includes(evidence);
    return [{
      id: `model-${index + 1}`,
      severity: severity === "high" && !evidenceMatchesInput ? "medium" : severity,
      category,
      message,
      textQuote,
      evidence: evidence || "模型未提供可核对来源。",
      recommendation,
      source: "model" as const,
    }];
  });
}
