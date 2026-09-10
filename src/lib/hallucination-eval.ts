import { buildAiContinuationContext } from "./ai-continuation";
import { runRuleBasedContinuationCheck, type ContinuationRiskCategory } from "./continuation-consistency";
import type { Project } from "./knowledge";

type EvaluationExpectation = "high" | "medium" | "low" | "none";

export type HallucinationEvaluationCase = {
  id: string;
  category: ContinuationRiskCategory | "safe";
  text: string;
  expected: EvaluationExpectation;
};

function makeProject(id: string): Project {
  return {
    id,
    title: "评测用雾港",
    genre: "悬疑",
    synopsis: "完全虚构的规则评测项目。",
    targetWordCount: 1000,
    updateFrequency: "测试",
    records: [{
      id: `${id}-rule`, type: "worldRule", name: "夜潮边界", summary: "夜潮期间不得离开港口。",
      status: "locked", tags: [], relations: [], updatedAt: "2026-09-01",
    }],
    characters: [{
      id: `${id}-character`, name: "沈砚", gender: "男", catchphrase: "", updatedAt: "2026-09-01",
      attributes: [{ id: `${id}-status`, kind: "custom", title: "人物当前状态", value: "已死亡", locked: true }],
    }],
    manuscript: { parseStatus: "parsed", chapters: [{ id: `${id}-chapter`, title: "第一章", content: "雨落港口。", uploadedAt: "2026-09-01" }] },
    aiSuggestionPool: [{
      id: `${id}-pending`, type: "worldRule", status: "pending", title: "暗门传闻", detail: "港口地下有暗门。", source: "测试", createdAt: "2026-09-01",
    }],
  };
}

const deathCases = Array.from({ length: 6 }, (_, index) => ({
  id: `death-${index + 1}`, category: "status" as const,
  text: `第${index + 1}次夜潮里，沈砚推门而入。`, expected: "high" as const,
}));
const ruleCases = Array.from({ length: 6 }, (_, index) => ({
  id: `rule-${index + 1}`, category: "worldRule" as const,
  text: `第${index + 1}次夜潮里，众人离开港口。`, expected: "high" as const,
}));
const pendingCases = Array.from({ length: 6 }, (_, index) => ({
  id: `pending-${index + 1}`, category: "pendingFact" as const,
  text: `调查第${index + 1}轮后，传闻已被证实，港口地下有暗门。`, expected: "medium" as const,
}));
const limitedCases = Array.from({ length: 6 }, (_, index) => ({
  id: `limited-${index + 1}`, category: "unsupportedClaim" as const,
  text: `第${index + 1}页记录确认：陌生人确实存在。`, expected: "low" as const,
}));
const identitySafeCases = Array.from({ length: 6 }, (_, index) => ({
  id: `identity-safe-${index + 1}`, category: "safe" as const,
  text: `第${index + 1}次对话中，调查员没有确认来信者的身份。`, expected: "none" as const,
}));
const relationshipSafeCases = Array.from({ length: 6 }, (_, index) => ({
  id: `relationship-safe-${index + 1}`, category: "safe" as const,
  text: `第${index + 1}个清晨，码头恢复安静，众人继续等待消息。`, expected: "none" as const,
}));

/** Synthetic cases only; no user manuscript or published novel text is included. */
export const hallucinationEvaluationCases: HallucinationEvaluationCase[] = [
  ...deathCases,
  ...ruleCases,
  ...pendingCases,
  ...limitedCases,
  ...identitySafeCases,
  ...relationshipSafeCases,
];

const round = (value: number) => Math.round(value * 100) / 100;

export function runHallucinationEvaluation(cases = hallucinationEvaluationCases) {
  let highRiskTotal = 0;
  let highRiskDetected = 0;
  let safeTotal = 0;
  let safeFlagged = 0;
  let limitedModeCases = 0;
  let limitedModeDetected = 0;

  for (const testCase of cases) {
    const project = makeProject(`eval-${testCase.id}`);
    const context = buildAiContinuationContext(project, { targetLength: 1000, userInstruction: "" });
    const report = runRuleBasedContinuationCheck(project, context, testCase.text);
    const hasExpectedCategory = testCase.category === "safe"
      ? report.findings.length > 0
      : report.findings.some((finding) => finding.category === testCase.category);
    if (testCase.expected === "high") {
      highRiskTotal += 1;
      if (report.findings.some((finding) => finding.severity === "high" && finding.category === testCase.category)) highRiskDetected += 1;
    }
    if (testCase.expected === "none") {
      safeTotal += 1;
      if (hasExpectedCategory) safeFlagged += 1;
    }
    if (testCase.category === "unsupportedClaim") {
      limitedModeCases += 1;
      if (context.grounding.mode === "limited" && hasExpectedCategory) limitedModeDetected += 1;
    }
  }

  return {
    total: cases.length,
    highRiskTotal,
    highRiskDetected,
    highRiskRecall: highRiskTotal ? round(highRiskDetected / highRiskTotal) : 1,
    safeTotal,
    safeFlagged,
    safeFalsePositiveRate: safeTotal ? round(safeFlagged / safeTotal) : 0,
    limitedModeCases,
    limitedModeDetected,
  };
}
