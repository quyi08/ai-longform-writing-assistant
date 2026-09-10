import type {
  AiSuggestion,
  AiSuggestionImportanceLevel,
  CharacterAuditItem,
  CharacterAuditRiskFlag,
  Project,
} from "./knowledge";
import type { AiProviderConfig } from "./ai-config";
import { completeOpenAiCompatibleChat } from "./openai-compatible";

export const characterAuditRulesVersion = "character-audit-v1";

export type CharacterAuditCandidate = {
  suggestionId: string;
  name: string;
  evidence: string[];
  sourceChapterCount: number;
  hardRiskFlags: CharacterAuditRiskFlag[];
};

type AuditResponseItem = {
  suggestionId?: unknown;
  recommendedLevel?: unknown;
  mainScore?: unknown;
  evidenceSufficiency?: unknown;
  reasons?: unknown;
  counterEvidence?: unknown;
  riskFlags?: unknown;
  needsHumanReview?: unknown;
};

const auditLevels = new Set<AiSuggestionImportanceLevel>(["main", "important", "minor"]);
const auditRiskFlags = new Set<CharacterAuditRiskFlag>([
  "genericName",
  "aliasAmbiguous",
  "evidenceMissing",
  "constraintConflict",
  "mentionedOnly",
]);

const genericNamePattern = /^(?:路人|行人|男子|女子|老人|老头|小孩|孩子|某人|不明(?:人物|人)?|未知(?:人物|人)?|尸体|人群|伙计)$/u;
const mentionOnlyPattern = /(?:仅仅?|只是|被|遭|有人)?(?:提及|提到|听说|传闻|名字出现|口中说起)/u;
const actionPattern = /(?:决定|选择|进入|离开|寻找|追查|合作|对抗|救|杀|发现|破解|带领|阻止|要求|答应|拒绝|揭露|行动)/u;

const clampScore = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));

const getSuggestionName = (suggestion: AiSuggestion): string =>
  (suggestion.targetName ?? suggestion.title.replace(/^人物[：:]/u, "")).trim();

const unique = <T>(values: T[]): T[] => [...new Set(values)];

const evidenceFor = (suggestion: AiSuggestion): string[] =>
  unique([
    ...(suggestion.sources ?? []).map((source) => source.detail.trim()).filter(Boolean),
    suggestion.detail.trim(),
  ].filter(Boolean)).slice(0, 3);

const auditRiskFlagsFor = (suggestion: AiSuggestion): CharacterAuditRiskFlag[] => {
  const name = getSuggestionName(suggestion);
  const evidence = evidenceFor(suggestion);
  const evidenceText = evidence.join("\n");
  const flags: CharacterAuditRiskFlag[] = [];

  if (!name || genericNamePattern.test(name)) flags.push("genericName");
  if (!evidence.length) flags.push("evidenceMissing");
  if (suggestion.identityStatus === "ambiguous") flags.push("aliasAmbiguous");
  if (evidenceText && mentionOnlyPattern.test(evidenceText) && !actionPattern.test(evidenceText)) {
    flags.push("mentionedOnly");
  }

  return flags;
};

export function buildCharacterAuditCandidates(project: Project): CharacterAuditCandidate[] {
  return (project.aiSuggestionPool ?? [])
    .filter(
      (suggestion) =>
        suggestion.status === "pending" &&
        (suggestion.type === "newCharacter" || suggestion.type === "characterUpdate") &&
        (suggestion.importanceLevel === "main" || suggestion.importanceLevel === "important"),
    )
    .map((suggestion) => {
      const sources = suggestion.sources ?? [];
      return {
        suggestionId: suggestion.id,
        name: getSuggestionName(suggestion),
        evidence: evidenceFor(suggestion),
        sourceChapterCount: unique(sources.map((source) => source.chapterId)).length,
        hardRiskFlags: auditRiskFlagsFor(suggestion),
      };
    });
}

const hardMainBlockers = new Set<CharacterAuditRiskFlag>([
  "genericName",
  "evidenceMissing",
  "aliasAmbiguous",
  "mentionedOnly",
  "constraintConflict",
]);

const resolveAuditLevel = (
  suggestion: AiSuggestion,
  item: CharacterAuditItem,
  hardRiskFlags: CharacterAuditRiskFlag[],
): AiSuggestionImportanceLevel => {
  if (suggestion.importanceOverride) return suggestion.importanceOverride;

  const allRiskFlags = unique([...hardRiskFlags, ...item.riskFlags]);
  const hardBlocked = allRiskFlags.some((flag) => hardMainBlockers.has(flag));
  if (hardRiskFlags.includes("genericName") || hardRiskFlags.includes("evidenceMissing")) return "minor";
  if (hardBlocked || item.mainScore < 75) return "minor";
  if (item.mainScore < 85 || item.recommendedLevel !== "main") return "important";
  return "main";
};

export function applyCharacterAudit(project: Project, items: CharacterAuditItem[]): Project {
  const auditBySuggestionId = new Map(items.map((item) => [item.suggestionId, item]));

  return {
    ...project,
    aiSuggestionPool: (project.aiSuggestionPool ?? []).map((suggestion) => {
      const item = auditBySuggestionId.get(suggestion.id);
      if (!item) return suggestion;

      const hardRiskFlags = auditRiskFlagsFor(suggestion);
      const riskFlags = unique([...hardRiskFlags, ...item.riskFlags]);
      return {
        ...suggestion,
        importanceLevel: resolveAuditLevel(suggestion, item, hardRiskFlags),
        auditScore: clampScore(item.mainScore),
        auditEvidenceSufficiency: clampScore(item.evidenceSufficiency),
        auditReasons: item.reasons.slice(0, 3),
        auditCounterEvidence: item.counterEvidence.slice(0, 2),
        auditRiskFlags: riskFlags,
        auditNeedsHumanReview:
          item.needsHumanReview ||
          (item.mainScore >= 75 && item.mainScore < 85) ||
          riskFlags.length > 0,
      };
    }),
  };
}

const stableHash = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

export function createCharacterAuditFingerprint(project: Project): string {
  const candidates = buildCharacterAuditCandidates(project).map((candidate) => ({
    ...candidate,
    evidence: candidate.evidence,
  }));
  const lockedConstraints = [
    ...(project.records ?? [])
      .filter((record) => record.status === "locked")
      .map((record) => `${record.type}:${record.name}:${record.summary}`),
    ...(project.characters ?? []).flatMap((character) =>
      character.attributes
        .filter((attribute) => attribute.locked)
        .map((attribute) => `${character.name}:${attribute.title}:${attribute.value}`),
    ),
  ].sort();

  return `${characterAuditRulesVersion}-${stableHash(JSON.stringify({ candidates, lockedConstraints }))}`;
}

const asStringList = (value: unknown, maximum: number): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()).slice(0, maximum)
    : [];

const extractJsonObject = (content: string): string => {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  return start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
};

export function parseCharacterAuditResponse(
  content: string,
  allowedSuggestionIds: Set<string>,
): CharacterAuditItem[] {
  let parsed: { items?: unknown };
  try {
    parsed = JSON.parse(extractJsonObject(content)) as { items?: unknown };
  } catch {
    throw new Error("Character auditor returned invalid JSON");
  }
  if (!Array.isArray(parsed.items)) throw new Error("Character auditor returned invalid JSON");

  const seen = new Set<string>();
  const items: CharacterAuditItem[] = [];
  for (const raw of parsed.items as AuditResponseItem[]) {
    const suggestionId = typeof raw.suggestionId === "string" ? raw.suggestionId : "";
    if (!allowedSuggestionIds.has(suggestionId) || seen.has(suggestionId)) continue;
    if (!auditLevels.has(raw.recommendedLevel as AiSuggestionImportanceLevel)) continue;
    if (typeof raw.mainScore !== "number" || typeof raw.evidenceSufficiency !== "number") continue;
    seen.add(suggestionId);
    items.push({
      suggestionId,
      recommendedLevel: raw.recommendedLevel as AiSuggestionImportanceLevel,
      mainScore: clampScore(raw.mainScore),
      evidenceSufficiency: clampScore(raw.evidenceSufficiency),
      reasons: asStringList(raw.reasons, 3),
      counterEvidence: asStringList(raw.counterEvidence, 2),
      riskFlags: asStringList(raw.riskFlags, 5).filter((flag): flag is CharacterAuditRiskFlag => auditRiskFlags.has(flag as CharacterAuditRiskFlag)),
      needsHumanReview: raw.needsHumanReview === true,
    });
  }
  return items;
}

const auditSystemPrompt = `你是小说人物重要度的独立审稿人。目标是严格避免把路人、泛称、仅被提及者误判成主要角色。你看不到前一模型的等级判断；只能根据每个人的正文证据决定。只输出 JSON，不输出 Markdown。`;

export async function auditCharacterCandidates(
  config: AiProviderConfig,
  candidates: CharacterAuditCandidate[],
  complete: typeof completeOpenAiCompatibleChat = completeOpenAiCompatibleChat,
): Promise<CharacterAuditItem[]> {
  if (!candidates.length) return [];
  const payload = candidates.slice(0, 60).map((candidate) => ({
    suggestionId: candidate.suggestionId,
    name: candidate.name,
    evidence: candidate.evidence.map((item) => item.slice(0, 180)),
    sourceChapterCount: candidate.sourceChapterCount,
    hardRiskFlags: candidate.hardRiskFlags,
  }));
  const response = await complete(config, [
    { role: "system", content: auditSystemPrompt },
    {
      role: "user",
      content: `${JSON.stringify({
        task: "逐项评估人物是否可作为主要、重要或非重要角色。",
        outputSchema: {
          items: [{ suggestionId: "string", recommendedLevel: "main|important|minor", mainScore: "0-100", evidenceSufficiency: "0-100", reasons: ["最多3条"], counterEvidence: ["最多2条"], riskFlags: ["genericName|aliasAmbiguous|evidenceMissing|constraintConflict|mentionedOnly"], needsHumanReview: "boolean" }],
        },
        candidates: payload,
      })}`,
    },
  ]);
  const allowedSuggestionIds = new Set(payload.map((candidate) => candidate.suggestionId));
  const firstPass = parseCharacterAuditResponse(response, allowedSuggestionIds);
  const edgeCase = firstPass.find((item) => item.needsHumanReview || (item.mainScore >= 75 && item.mainScore < 85));
  if (!edgeCase) return firstPass;

  const candidate = payload.find((item) => item.suggestionId === edgeCase.suggestionId);
  if (!candidate) return firstPass;
  const reviewResponse = await complete(config, [
    { role: "system", content: `${auditSystemPrompt} 这是唯一一次边界复核；请特别保守，证据不足时不得推荐主要角色。` },
    {
      role: "user",
      content: JSON.stringify({
        task: "只复核这一位边界人物，并按相同 schema 返回一个 items 数组。",
        priorIndependentAssessment: edgeCase,
        candidate,
      }),
    },
  ]);
  const reviewed = parseCharacterAuditResponse(reviewResponse, new Set([candidate.suggestionId]));
  if (!reviewed.length) return firstPass;
  return firstPass.map((item) => item.suggestionId === candidate.suggestionId ? reviewed[0] : item);
}
