export type EvaluationJudgeMetrics = {
  status?: string;
  factFollowing?: number;
  characterConsistency?: number;
  plotContinuity?: number;
  cutoffContinuity?: number;
  narrativeAdvancement?: number;
  styleFit?: number;
  coreEvidenceUse?: number;
  constraintCompliance?: number;
  creativePlausibility?: number;
  sceneDramaticTension?: number;
  characterAgency?: number;
  creativeControl?: number;
  evidenceTransformation?: number;
  baselineQualityScore?: number;
  creativeGainScore?: number;
  positiveQualityScore?: number;
  netQualityScore?: number;
  scoringFocus?: "rag" | "constraint" | "creative";
  focusQualityScore?: number;
  riskPenalty?: number;
  taskSuccess?: boolean;
  unsupportedClaim?: boolean;
  unsupportedFindings?: string[];
  needsHumanReview?: boolean;
  reviewReasons?: string[];
  severeConflict?: boolean;
};

export type EvaluationMetricVariant = {
  variant: "A" | "B" | "C" | "retrieval";
  caseType?: "retrieval" | "continuation" | "adversarial" | "unanswerable";
  evaluationFocus?: "rag" | "constraint" | "creative";
  status: string;
  payload?: {
    elapsedMs?: number;
    estimatedCostCny?: number;
    futureEvidenceSentCount?: number;
    futureEvidenceBlockedCount?: number;
    judgeResult?: EvaluationJudgeMetrics | null;
  };
};

export type MetricCell = { value: number | null; sampleSize: number };

export type MetricDistribution = MetricCell & { standardDeviation: number | null };

export type EvaluationRunGroupVariantSummary = {
  totalCount: number;
  completedCount: number;
  failedCount: number;
  successRate: MetricCell;
  failureRate: MetricCell;
  positiveQualityScore: MetricDistribution;
  netQualityScore: MetricDistribution;
};

export type EvaluationComparisonColumn = {
  cutoffContinuity: MetricCell;
  factFollowing: MetricCell;
  characterConsistency: MetricCell;
  plotContinuity: MetricCell;
  narrativeAdvancement: MetricCell;
  styleFit: MetricCell;
  severeConflictRate: MetricCell;
  unsupportedClaimRate: MetricCell;
  humanReviewRate: MetricCell;
  futureInformationLeakage: MetricCell;
  averageElapsedMs: MetricCell;
  averageEstimatedCostCny: MetricCell;
  positiveQualityScore: MetricCell;
  netQualityScore: MetricCell;
  riskPenalty: MetricCell;
  baselineQualityScore: MetricCell;
  creativeGainScore: MetricCell;
  ragQualityScore: MetricCell;
  constraintQualityScore: MetricCell;
  creativeQualityScore: MetricCell;
  coreEvidenceUse: MetricCell;
  constraintCompliance: MetricCell;
  creativePlausibility: MetricCell;
  sceneDramaticTension: MetricCell;
  characterAgency: MetricCell;
  creativeControl: MetricCell;
  evidenceTransformation: MetricCell;
  safetyTaskSuccessRate: MetricCell;
  futureEvidenceBlockedCount: number;
};

export function filterEvidenceAtKnowledgeCutoff<T extends { chapterIndex: number }>(evidence: T[], knowledgeCutoffChapterIndex: number) {
  const kept = evidence.filter((item) => item.chapterIndex <= knowledgeCutoffChapterIndex);
  return { evidence: kept, futureEvidenceBlockedCount: evidence.length - kept.length };
}

function average(values: number[]): MetricCell {
  return values.length
    ? { value: values.reduce((sum, value) => sum + value, 0) / values.length, sampleSize: values.length }
    : { value: null, sampleSize: 0 };
}

function distribution(values: number[]): MetricDistribution {
  const mean = average(values);
  if (!values.length) return { ...mean, standardDeviation: null };
  const variance = values.reduce((sum, value) => sum + (value - mean.value!) ** 2, 0) / values.length;
  return { ...mean, standardDeviation: Math.sqrt(variance) };
}

function validScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 5;
}

function numericScore(value: unknown, max = 100): number[] {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max ? [value] : [];
}

function column(variants: EvaluationMetricVariant[]): EvaluationComparisonColumn {
  const completed = variants.filter((item) => item.status === "completed");
  const judged = completed.filter((item) => item.payload?.judgeResult?.status === "scored");
  const continuationJudged = judged.filter((item) => item.caseType !== "adversarial" && item.caseType !== "unanswerable");
  const safetyJudged = judged.filter((item) => item.caseType === "adversarial" || item.caseType === "unanswerable");
  const continuationScoreValues = (key: "cutoffContinuity" | "factFollowing" | "characterConsistency" | "plotContinuity" | "narrativeAdvancement" | "styleFit" | "coreEvidenceUse" | "constraintCompliance" | "creativePlausibility" | "sceneDramaticTension" | "characterAgency" | "creativeControl" | "evidenceTransformation") => continuationJudged.flatMap((item) => {
    const value = item.payload?.judgeResult?.[key];
    return validScore(value) ? [value] : [];
  });
  const focusQuality = (focus: "rag" | "constraint" | "creative") => average(continuationJudged
    .filter((item) => item.evaluationFocus === focus)
    .flatMap((item) => numericScore(item.payload?.judgeResult?.focusQualityScore)));
  const severeConflicts = judged.map((item) => Boolean(item.payload?.judgeResult?.severeConflict ?? item.payload?.judgeResult?.unsupportedClaim));
  const unsupportedClaims = judged.map((item) => Boolean(item.payload?.judgeResult?.unsupportedClaim));
  const humanReviews = judged.map((item) => Boolean(item.payload?.judgeResult?.needsHumanReview));
  const futureEvidence = completed.filter((item) => typeof item.payload?.futureEvidenceSentCount === "number");
  const sentFuture = futureEvidence.map((item) => Number(item.payload?.futureEvidenceSentCount ?? 0) > 0 ? 1 : 0);
  return {
    cutoffContinuity: average(continuationScoreValues("cutoffContinuity")),
    factFollowing: average(continuationScoreValues("factFollowing")),
    characterConsistency: average(continuationScoreValues("characterConsistency")),
    plotContinuity: average(continuationScoreValues("plotContinuity")),
    narrativeAdvancement: average(continuationScoreValues("narrativeAdvancement")),
    styleFit: average(continuationScoreValues("styleFit")),
    severeConflictRate: severeConflicts.length ? { value: severeConflicts.filter(Boolean).length / severeConflicts.length * 100, sampleSize: severeConflicts.length } : { value: null, sampleSize: 0 },
    unsupportedClaimRate: unsupportedClaims.length ? { value: unsupportedClaims.filter(Boolean).length / unsupportedClaims.length * 100, sampleSize: unsupportedClaims.length } : { value: null, sampleSize: 0 },
    humanReviewRate: humanReviews.length ? { value: humanReviews.filter(Boolean).length / humanReviews.length * 100, sampleSize: humanReviews.length } : { value: null, sampleSize: 0 },
    futureInformationLeakage: sentFuture.length ? { value: sentFuture.reduce((sum, value) => sum + value, 0) / sentFuture.length * 100, sampleSize: sentFuture.length } : { value: null, sampleSize: 0 },
    averageElapsedMs: average(completed.flatMap((item) => typeof item.payload?.elapsedMs === "number" ? [item.payload.elapsedMs] : [])),
    averageEstimatedCostCny: average(completed.flatMap((item) => typeof item.payload?.estimatedCostCny === "number" ? [item.payload.estimatedCostCny] : [])),
    positiveQualityScore: average(continuationJudged.flatMap((item) => numericScore(item.payload?.judgeResult?.positiveQualityScore))),
    netQualityScore: average(continuationJudged.flatMap((item) => numericScore(item.payload?.judgeResult?.netQualityScore ?? item.payload?.judgeResult?.positiveQualityScore))),
    riskPenalty: average(continuationJudged.flatMap((item) => {
      const value = item.payload?.judgeResult?.riskPenalty;
      return typeof value === "number" && Number.isFinite(value) && value >= 0 ? [value] : [];
    })),
    baselineQualityScore: average(continuationJudged.flatMap((item) => numericScore(item.payload?.judgeResult?.baselineQualityScore, 60))),
    creativeGainScore: average(continuationJudged.flatMap((item) => numericScore(item.payload?.judgeResult?.creativeGainScore, 40))),
    ragQualityScore: focusQuality("rag"),
    constraintQualityScore: focusQuality("constraint"),
    creativeQualityScore: focusQuality("creative"),
    coreEvidenceUse: average(continuationScoreValues("coreEvidenceUse")),
    constraintCompliance: average(continuationScoreValues("constraintCompliance")),
    creativePlausibility: average(continuationScoreValues("creativePlausibility")),
    sceneDramaticTension: average(continuationScoreValues("sceneDramaticTension")),
    characterAgency: average(continuationScoreValues("characterAgency")),
    creativeControl: average(continuationScoreValues("creativeControl")),
    evidenceTransformation: average(continuationScoreValues("evidenceTransformation")),
    safetyTaskSuccessRate: safetyJudged.length
      ? { value: safetyJudged.filter((item) => item.payload?.judgeResult?.taskSuccess === true).length / safetyJudged.length * 100, sampleSize: safetyJudged.length }
      : { value: null, sampleSize: 0 },
    futureEvidenceBlockedCount: completed.reduce((sum, item) => sum + Number(item.payload?.futureEvidenceBlockedCount ?? 0), 0),
  };
}

export function summarizeEvaluationComparison(variants: EvaluationMetricVariant[]): Record<"A" | "B" | "C", EvaluationComparisonColumn> {
  return {
    A: column(variants.filter((item) => item.variant === "A")),
    B: column(variants.filter((item) => item.variant === "B")),
    C: column(variants.filter((item) => item.variant === "C")),
  };
}

export function summarizeEvaluationRunGroup(variants: EvaluationMetricVariant[]): Record<"A" | "B" | "C", EvaluationRunGroupVariantSummary> {
  const summarize = (variant: "A" | "B" | "C"): EvaluationRunGroupVariantSummary => {
    const items = variants.filter((item) => item.variant === variant);
    const completedCount = items.filter((item) => item.status === "completed").length;
    const failedCount = items.filter((item) => item.status === "failed").length;
    const normalContinuation = items.filter((item) => item.status === "completed" && item.caseType === "continuation");
    const quality = normalContinuation.flatMap((item) => numericScore(item.payload?.judgeResult?.positiveQualityScore));
    const netQuality = normalContinuation.flatMap((item) => numericScore(item.payload?.judgeResult?.netQualityScore ?? item.payload?.judgeResult?.positiveQualityScore));
    return {
      totalCount: items.length,
      completedCount,
      failedCount,
      successRate: items.length ? { value: completedCount / items.length * 100, sampleSize: items.length } : { value: null, sampleSize: 0 },
      failureRate: items.length ? { value: failedCount / items.length * 100, sampleSize: items.length } : { value: null, sampleSize: 0 },
      positiveQualityScore: distribution(quality),
      netQualityScore: distribution(netQuality),
    };
  };
  return { A: summarize("A"), B: summarize("B"), C: summarize("C") };
}
