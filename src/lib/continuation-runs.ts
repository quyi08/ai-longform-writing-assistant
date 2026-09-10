import type { AiContinuationContext, AiContinuationReport } from "./ai-continuation";
import type { ContinuationFeedbackDecision, ContinuationFeedbackReason, Project } from "./knowledge";

type CreateContinuationRunInput = {
  context: AiContinuationContext;
  report: AiContinuationReport;
  text: string;
  writerModel: string;
};

type RiskSummary = { high: number; medium: number; low: number; status: string };

const maxRuns = 100;

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

export function createContinuationRun(project: Project, input: CreateContinuationRunInput): Project {
  const createdAt = new Date().toISOString();
  const run = {
    id: `continuation-run-${Date.now().toString(36)}`,
    createdAt,
    writerModel: input.writerModel,
    targetLength: input.context.projectProfile.includes("约3000字") ? 3000 : input.context.projectProfile.includes("约10000字") ? 10000 : 1000,
    groundingMode: input.report.grounding.mode,
    groundingScore: input.report.grounding.score,
    authorInstruction: input.context.userInstruction.slice(0, 300),
    sourceRefs: input.report.sourcePreview.map((source) => ({ kind: source.kind, sourceId: source.sourceId, label: source.label })),
    riskSummary: { high: 0, medium: 0, low: 0, status: "pending" },
    outputHash: hash(input.text),
    outputPreview: input.text.trim().slice(0, 160),
  };
  return { ...project, continuationRuns: [run, ...(project.continuationRuns ?? [])].slice(0, maxRuns) };
}

export function updateContinuationRunRiskSummary(project: Project, runId: string, riskSummary: RiskSummary): Project {
  return { ...project, continuationRuns: (project.continuationRuns ?? []).map((run) => run.id === runId ? { ...run, riskSummary } : run) };
}

export function recordContinuationFeedback(
  project: Project,
  runId: string,
  feedback: { decision: ContinuationFeedbackDecision; reason?: ContinuationFeedbackReason },
): Project {
  return {
    ...project,
    continuationRuns: (project.continuationRuns ?? []).map((run) => run.id === runId ? {
      ...run,
      feedback: { ...feedback, updatedAt: new Date().toISOString() },
    } : run),
  };
}

export function getProjectReliabilityMetrics(project: Project, limit = 30) {
  const runs = (project.continuationRuns ?? []).slice(0, limit);
  const countBy = (decision: ContinuationFeedbackDecision) => runs.filter((run) => run.feedback?.decision === decision).length;
  return {
    runCount: runs.length,
    averageGroundingScore: runs.length ? Math.round(runs.reduce((sum, run) => sum + run.groundingScore, 0) / runs.length) : 0,
    limitedRate: runs.length ? Math.round((runs.filter((run) => run.groundingMode === "limited").length / runs.length) * 100) : 0,
    highRiskCount: runs.reduce((sum, run) => sum + run.riskSummary.high, 0),
    mediumRiskCount: runs.reduce((sum, run) => sum + run.riskSummary.medium, 0),
    lowRiskCount: runs.reduce((sum, run) => sum + run.riskSummary.low, 0),
    adoptedCount: countBy("adopted"),
    editedCount: countBy("edited"),
    rejectedCount: countBy("rejected"),
  };
}
