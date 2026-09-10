import type { AiContinuationLength } from "./ai-continuation";

export type ContinuationStrategyId = "quick" | "deep" | "guided";

export type ContinuationStrategy = {
  id: ContinuationStrategyId;
  variant: "A" | "B" | "C";
  label: string;
  tooltip: string;
  usesRetrieval: boolean;
  usesConstraints: boolean;
  inputTokenEstimate: number;
  waitOverheadSeconds: number;
};

const strategies: Record<ContinuationStrategyId, ContinuationStrategy> = {
  quick: { id: "quick", variant: "A", label: "快速续写", tooltip: "仅对前文进行简单分析，快速续写", usesRetrieval: false, usesConstraints: false, inputTokenEstimate: 1200, waitOverheadSeconds: 12 },
  deep: { id: "deep", variant: "B", label: "深度续写", tooltip: "根据深度解析的内容进行分析续写，需要一定时间", usesRetrieval: true, usesConstraints: false, inputTokenEstimate: 2400, waitOverheadSeconds: 22 },
  guided: { id: "guided", variant: "C", label: "指令续写", tooltip: "在深度续写基础上，由作者进行硬约束", usesRetrieval: true, usesConstraints: true, inputTokenEstimate: 3200, waitOverheadSeconds: 28 },
};

export const continuationStrategies = Object.values(strategies);

export function getContinuationStrategy(strategy: ContinuationStrategyId) {
  return strategies[strategy];
}

export function parseContinuationStrategy(value: unknown): ContinuationStrategyId {
  if (value === undefined || value === null || value === "") return "deep";
  if (value === "quick" || value === "deep" || value === "guided") return value;
  throw new Error("续写方式无效。");
}

export function estimateContinuationStrategy(strategyId: ContinuationStrategyId, targetLength: AiContinuationLength) {
  const strategy = getContinuationStrategy(strategyId);
  const outputTokens = Math.ceil(targetLength * 0.8);
  const costCny = Number(((strategy.inputTokenEstimate * 4 + outputTokens * 12) / 1_000_000).toFixed(3));
  const waitSeconds = Math.round(strategy.waitOverheadSeconds + targetLength / 45);
  return { costCny, waitSeconds };
}
