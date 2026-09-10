export type EvaluationCaseType = "retrieval" | "continuation" | "adversarial" | "unanswerable";
export type EvaluationFocus = "rag" | "constraint" | "creative";
export type EvaluationRiskLevel = "normal" | "high";
export type EvaluationScope = "smoke" | "full";
export type EvaluationVariant = "A" | "B" | "C" | "retrieval";
export type EvaluationRunStatus = "draft" | "ready" | "running" | "budget_paused" | "completed" | "failed" | "cancelled";

/** Preferred visible length for a complete continuation scene. */
export const EVALUATION_CONTINUATION_TARGET_MIN_CHARACTERS = 1_700;
export const EVALUATION_CONTINUATION_TARGET_MAX_CHARACTERS = 1_900;
/** Hard ceiling leaves room for a natural ending beyond the preferred target. */
export const DEFAULT_EVALUATION_CONTINUATION_CHARACTER_LIMIT = 2_400;

export type EvaluationCase = {
  id: string;
  projectId: string;
  suiteId: string;
  title: string;
  type: EvaluationCaseType;
  /** Continuation scoring route; omitted cases retain the historical rubric. */
  evaluationFocus?: EvaluationFocus;
  riskLevel: EvaluationRiskLevel;
  chapterId: string;
  /** Chapter index whose end is the maximum knowledge available to this case. */
  knowledgeCutoffChapterIndex?: number;
  authorInstruction: string;
  requiredFacts: string[];
  forbiddenFacts: string[];
  expectedEvidenceChapterIds: string[];
  expectedBehavior: "retrieve_evidence" | "continue_story" | "limited" | "block_conflict";
  confirmedAt?: string;
  enabled: boolean;
};

export type EvaluationRunPlan = {
  scope: EvaluationScope;
  outputCharacterLimit: number;
  retrievalTopK: number;
  samplingSeed: string;
  variants: Array<{ caseId: string; variant: EvaluationVariant; judgeRequired: boolean }>;
};

export type EvaluationModelRates = {
  writerInputPerMillionCny: number;
  writerOutputPerMillionCny: number;
  judgeInputPerMillionCny: number;
  judgeOutputPerMillionCny: number;
};

export function createEvaluationRunPlan(
  cases: EvaluationCase[],
  options: Omit<EvaluationRunPlan, "variants">,
): EvaluationRunPlan {
  const eligibleCases = cases.filter((item) => item.enabled && Boolean(item.confirmedAt));
  const variants = eligibleCases.flatMap((item) => {
    if (item.type === "retrieval") {
      return [{ caseId: item.id, variant: "retrieval" as const, judgeRequired: false }];
    }

    return (["A", "B", "C"] as const).map((variant) => ({
      caseId: item.id,
      variant,
      judgeRequired: true,
    }));
  });

  return { ...options, variants };
}

export function estimateEvaluationCost(plan: EvaluationRunPlan, rates: EvaluationModelRates) {
  const generationVariants = plan.variants.filter((item) => item.variant !== "retrieval");
  const judgeVariants = generationVariants.filter((item) => item.judgeRequired);
  const outputTokensPerVariant = Math.ceil(plan.outputCharacterLimit * 1.5);
  const writerInputTokens = generationVariants.reduce(
    (sum, item) => sum + (item.variant === "A" ? 1_200 : item.variant === "B" ? 2_400 : 3_200),
    0,
  );
  const writerOutputTokens = generationVariants.length * outputTokensPerVariant;
  const judgeInputTokens = judgeVariants.length * (1_500 + outputTokensPerVariant);
  const judgeOutputTokens = judgeVariants.length * 500;
  const estimatedCny =
    (writerInputTokens / 1_000_000) * rates.writerInputPerMillionCny +
    (writerOutputTokens / 1_000_000) * rates.writerOutputPerMillionCny +
    (judgeInputTokens / 1_000_000) * rates.judgeInputPerMillionCny +
    (judgeOutputTokens / 1_000_000) * rates.judgeOutputPerMillionCny;

  return {
    estimatedCny,
    writerInputTokens,
    writerOutputTokens,
    judgeInputTokens,
    judgeOutputTokens,
    requiresSoftBudgetConfirmation: estimatedCny > 30,
    withinHardCap: estimatedCny <= 50,
  };
}

function estimateTokensFromText(text: string) {
  return Math.ceil(text.length * 1.5);
}

export function estimateEvaluationVariantCost(
  text: { writerInput: string; writerOutput: string; judgeInput?: string; judgeOutput?: string },
  rates: EvaluationModelRates,
) {
  return (
    (estimateTokensFromText(text.writerInput) / 1_000_000) * rates.writerInputPerMillionCny +
    (estimateTokensFromText(text.writerOutput) / 1_000_000) * rates.writerOutputPerMillionCny +
    (estimateTokensFromText(text.judgeInput ?? "") / 1_000_000) * rates.judgeInputPerMillionCny +
    (estimateTokensFromText(text.judgeOutput ?? "") / 1_000_000) * rates.judgeOutputPerMillionCny
  );
}
