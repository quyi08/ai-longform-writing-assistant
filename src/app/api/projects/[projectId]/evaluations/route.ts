import { randomUUID } from "node:crypto";
import { getAiProviderConfig } from "@/lib/ai-config";
import { getEmbeddingConfig } from "@/lib/embedding-config";
import { createEvaluationRunPlan, DEFAULT_EVALUATION_CONTINUATION_CHARACTER_LIMIT, estimateEvaluationCost, estimateEvaluationVariantCost, type EvaluationCase, type EvaluationModelRates } from "@/lib/evaluation";
import { filterEvidenceAtKnowledgeCutoff } from "@/lib/evaluation-metrics";
import { selectConstraintsForContinuation } from "@/lib/constraint-selection";
import { governProjectConstraintMetadata } from "@/lib/constraint-governance";
import { completeOpenAiCompatibleChat, createOpenAiCompatibleEmbeddings } from "@/lib/openai-compatible";
import { withDatabaseClient } from "@/lib/server/db";
import { createCutoffCenteredEvaluationSeed } from "@/lib/evaluation-seed";
import { listProjects, saveProjectSnapshot } from "@/lib/server/project-repository";
import { retrieveProjectEvidence } from "@/lib/server/retrieval-service";
import { executeEvaluationVariant } from "@/lib/server/evaluation-runner";
import { claimNextEvaluationVariant, confirmEvaluationCase, confirmEvaluationSuiteCases, createEvaluationCase, createEvaluationRun, deleteEvaluationCase, loadEvaluationVariant, migrateEvaluationCaseFocuses, rerunEvaluationCaseVariants, rerunEvaluationVariant, retryFailedEvaluationVariants, saveEvaluationSeed, saveEvaluationVariantResult, unconfirmEvaluationCase } from "@/lib/server/evaluation-repository";
import { getSnapshotAnalysisProgress, type SnapshotAnalysisProgress } from "@/lib/snapshot-analysis";

type EvaluationData = { suites: Array<Record<string, unknown>>; cases: Array<Record<string, unknown>>; runs: Array<Record<string, unknown>>; variants?: Array<Record<string, unknown>>; memberships?: Array<Record<string, unknown>>; chapters?: Array<Record<string, unknown>>; evaluationSnapshot?: Awaited<ReturnType<typeof listProjects>>[number]["evaluationSnapshot"]; snapshotAnalysisProgress?: SnapshotAnalysisProgress };
type EvaluationCasePayload = EvaluationCase & { confirmedAt?: string };
type EvaluationRunConfig = { plan?: ReturnType<typeof createEvaluationRunPlan>; estimate?: ReturnType<typeof estimateEvaluationCost>; protocol?: "v2-cutoff-aware" };

const defaultEvaluationRates: EvaluationModelRates = {
  writerInputPerMillionCny: 4,
  writerOutputPerMillionCny: 12,
  judgeInputPerMillionCny: 4,
  judgeOutputPerMillionCny: 12,
};
type Deps = {
  load?: () => Promise<EvaluationData>;
  createRun?: () => Promise<unknown>;
  createMultiRun?: (input: { roundCount: number; softBudgetConfirmed: boolean }) => Promise<unknown>;
  createSelectiveMultiRun?: (input: { caseRunCounts: Record<string, number>; softBudgetConfirmed: boolean }) => Promise<unknown>;
  executeNextVariant?: (input: { runId: string }) => Promise<unknown>;
  retryFailedVariants?: (input: { runId: string }) => Promise<unknown>;
  rerunCase?: (input: { runId: string; caseId: string }) => Promise<unknown>;
  rerunVariant?: (input: { runId: string; variantId: string }) => Promise<unknown>;
  seed?: () => Promise<unknown>;
  confirmCase?: (input: { caseId: string; requiredFacts: string[]; forbiddenFacts: string[] }) => Promise<unknown>;
  unconfirmCase?: (input: { caseId: string }) => Promise<unknown>;
  confirmSuiteCases?: (input: { suiteId: string }) => Promise<unknown>;
  createCase?: (input: CreateCaseInput) => Promise<unknown>;
  deleteCase?: (input: { caseId: string }) => Promise<unknown>;
  migrateFocuses?: () => Promise<unknown>;
};

type CreateCaseInput = {
  title: string;
  authorInstruction?: string;
  type: "retrieval" | "continuation" | "adversarial" | "unanswerable";
  riskLevel: "normal" | "high";
  chapterId: string;
  requiredFacts: string[];
  forbiddenFacts: string[];
  includeInSmoke: boolean;
};

export function resolveEvaluationVariant(variant: "A" | "B" | "C" | "retrieval", selectedConstraintCount: number) {
  return variant === "C" && selectedConstraintCount === 0 ? "B" : variant;
}

async function loadProjectEvaluations(projectId: string): Promise<EvaluationData> {
  return withDatabaseClient(async (client) => {
    const [suites, cases, runs, variants, memberships, chapters, projects] = await Promise.all([
      client.query("SELECT * FROM evaluation_suites WHERE project_id = $1 ORDER BY created_at DESC", [projectId]),
      client.query("SELECT * FROM evaluation_cases WHERE project_id = $1 ORDER BY updated_at DESC", [projectId]),
      client.query("SELECT * FROM evaluation_runs WHERE project_id = $1 ORDER BY created_at DESC", [projectId]),
      client.query(
        `SELECT result.*, item.payload AS case_payload
         FROM evaluation_variant_results AS result
         JOIN evaluation_runs AS run ON run.id = result.run_id
         JOIN evaluation_cases AS item ON item.id = result.case_id
         WHERE run.project_id = $1
         ORDER BY result.created_at`,
        [projectId],
      ),
      client.query(
        `SELECT membership.suite_id, membership.case_id
         FROM evaluation_suite_cases membership
         JOIN evaluation_suites suite ON suite.id = membership.suite_id
         WHERE suite.project_id = $1`,
        [projectId],
      ),
      client.query("SELECT id, chapter_index, title FROM chapters WHERE project_id = $1 ORDER BY chapter_index", [projectId]),
      listProjects(client),
    ]);
    const project = projects.find((item) => item.id === projectId);
    const evaluationSnapshot = project?.evaluationSnapshot;
    const snapshotAnalysisProgress = evaluationSnapshot
      ? getSnapshotAnalysisProgress(project?.manuscript?.chapters ?? [], evaluationSnapshot.analysis.completedBatchIds, evaluationSnapshot.analysis.recoveryBatches ?? [])
      : undefined;
    return { suites: suites.rows, cases: cases.rows, runs: runs.rows, variants: variants.rows, memberships: memberships.rows, chapters: chapters.rows, evaluationSnapshot, snapshotAnalysisProgress };
  });
}

async function governAllProjectConstraints() {
  return withDatabaseClient(async (client) => {
    const projects = await listProjects(client);
    const changed = projects.map(governProjectConstraintMetadata).filter((result) => result.changed);
    for (const result of changed) await saveProjectSnapshot(client, result.project);
    return { scannedCount: projects.length, governedCount: changed.length };
  });
}

export function parseEvaluationCase(row: Record<string, unknown>): EvaluationCasePayload | null {
  const payload = row.payload;
  if (!payload || typeof payload !== "object") return null;
  const candidate = payload as Partial<EvaluationCasePayload>;
  if (!candidate.id || !candidate.chapterId || !candidate.type || !candidate.authorInstruction) return null;
  return {
    ...candidate,
    id: String(candidate.id),
    projectId: String(candidate.projectId ?? ""),
    suiteId: String(candidate.suiteId ?? ""),
    title: String(candidate.title ?? "未命名题目"),
    type: candidate.type,
    riskLevel: candidate.riskLevel ?? "normal",
    chapterId: String(candidate.chapterId),
    authorInstruction: String(candidate.authorInstruction),
    requiredFacts: Array.isArray(candidate.requiredFacts) ? candidate.requiredFacts.map(String) : [],
    forbiddenFacts: Array.isArray(candidate.forbiddenFacts) ? candidate.forbiddenFacts.map(String) : [],
    expectedEvidenceChapterIds: Array.isArray(candidate.expectedEvidenceChapterIds) ? candidate.expectedEvidenceChapterIds.map(String) : [],
    expectedBehavior: candidate.expectedBehavior ?? "continue_story",
    confirmedAt: row.confirmed_at instanceof Date
      ? row.confirmed_at.toISOString()
      : typeof row.confirmed_at === "string"
        ? row.confirmed_at
        : undefined,
    enabled: row.enabled === true,
  };
}

async function createProjectEvaluationRuns(projectId: string, softBudgetConfirmed: boolean, roundCount = 1) {
  if (!Number.isInteger(roundCount) || roundCount < 1 || roundCount > 20) {
    throw new Error("多轮测试次数必须是 1–20 的整数。");
  }
  const data = await loadProjectEvaluations(projectId);
  const smokeSuite = data.suites.find((suite) => suite.scope === "smoke");
  if (!smokeSuite?.id) throw new Error("当前作品尚未建立冒烟集。");
  const caseById = new Map(data.cases.map((item) => [String(item.id), parseEvaluationCase(item)]));
  const smokeCaseIds = new Set((data.memberships ?? []).filter((item) => item.suite_id === smokeSuite.id).map((item) => String(item.case_id)));
  const cases = [...smokeCaseIds]
    .map((id) => caseById.get(id))
    .filter((item): item is EvaluationCasePayload => Boolean(item && item.enabled && item.confirmedAt));
  const previewPlan = createEvaluationRunPlan(cases, {
    scope: "smoke",
    outputCharacterLimit: DEFAULT_EVALUATION_CONTINUATION_CHARACTER_LIMIT,
    retrievalTopK: 5,
    samplingSeed: randomUUID(),
  });
  const estimatePerRound = estimateEvaluationCost(previewPlan, defaultEvaluationRates);
  const estimatedCny = estimatePerRound.estimatedCny * roundCount;
  if (!previewPlan.variants.length) throw new Error("当前冒烟集没有已确认并启用的题目。");
  if (estimatedCny > 50) throw new Error("预估成本超过 50 元硬上限。");
  if (estimatedCny > 30 && !softBudgetConfirmed) {
    throw new Error("预估成本超过 30 元，请确认后继续。");
  }
  const groupId = roundCount > 1 ? `evaluation-group-${randomUUID()}` : undefined;
  const runs = await withDatabaseClient(async (client) => {
    const created = [];
    for (let roundIndex = 1; roundIndex <= roundCount; roundIndex += 1) {
      const plan = createEvaluationRunPlan(cases, {
        scope: "smoke",
        outputCharacterLimit: DEFAULT_EVALUATION_CONTINUATION_CHARACTER_LIMIT,
        retrievalTopK: 5,
        samplingSeed: randomUUID(),
      });
      const runId = `evaluation-run-${randomUUID()}`;
      const result = await createEvaluationRun(client, {
        id: runId,
        projectId,
        suiteId: String(smokeSuite.id),
        config: {
          plan,
          estimate: estimatePerRound,
          protocol: "v2-cutoff-aware",
          ...(groupId ? { multiRun: { groupId, roundIndex, roundCount } } : {}),
        },
        estimatedCostCny: estimatePerRound.estimatedCny,
        protocol: "v2-cutoff-aware",
        comparability: "comparable",
        variants: plan.variants.map((item) => ({
          id: `evaluation-variant-${randomUUID()}`,
          caseId: item.caseId,
          variant: item.variant,
        })),
      });
      created.push({ ...result, id: runId, roundIndex });
    }
    return created;
  });
  return { id: runs[0]?.id, groupId, roundCount, runs, estimatedCny, requiresSoftBudgetConfirmation: estimatedCny > 30 };
}

async function createProjectEvaluationRun(projectId: string, softBudgetConfirmed: boolean) {
  return createProjectEvaluationRuns(projectId, softBudgetConfirmed, 1);
}

async function createSelectiveProjectEvaluationRuns(projectId: string, caseRunCounts: Record<string, number>, softBudgetConfirmed: boolean) {
  const data = await loadProjectEvaluations(projectId);
  const smokeSuite = data.suites.find((suite) => suite.scope === "smoke");
  if (!smokeSuite?.id) throw new Error("当前作品尚未建立冒烟集。");
  const caseById = new Map(data.cases.map((item) => [String(item.id), parseEvaluationCase(item)]));
  const smokeCaseIds = new Set((data.memberships ?? []).filter((item) => item.suite_id === smokeSuite.id).map((item) => String(item.case_id)));
  const cases = [...smokeCaseIds].map((id) => caseById.get(id)).filter((item): item is EvaluationCasePayload => Boolean(item && item.enabled && item.confirmedAt));
  if (!cases.length) throw new Error("当前冒烟集没有已确认并启用的题目。");
  const validIds = new Set(cases.map((item) => item.id));
  if (Object.keys(caseRunCounts).some((caseId) => !validIds.has(caseId))) throw new Error("测试次数包含不属于当前冒烟集的题目。");
  const normalizedCounts = Object.fromEntries(cases.map((item) => [item.id, Number(caseRunCounts[item.id] ?? 1)]));
  if (Object.values(normalizedCounts).some((count) => !Number.isInteger(count) || count < 1 || count > 20)) throw new Error("每题测试次数必须是 1–20 的整数。");
  const roundCount = Math.max(...Object.values(normalizedCounts));
  const plans = Array.from({ length: roundCount }, (_, index) => {
    const roundIndex = index + 1;
    const selectedCases = cases.filter((item) => normalizedCounts[item.id] >= roundIndex);
    const plan = createEvaluationRunPlan(selectedCases, { scope: "smoke", outputCharacterLimit: DEFAULT_EVALUATION_CONTINUATION_CHARACTER_LIMIT, retrievalTopK: 5, samplingSeed: randomUUID() });
    return { roundIndex, selectedCases, plan, estimate: estimateEvaluationCost(plan, defaultEvaluationRates) };
  });
  const estimatedCny = plans.reduce((sum, item) => sum + item.estimate.estimatedCny, 0);
  if (estimatedCny > 50) throw new Error("预估成本超过 50 元硬上限。");
  if (estimatedCny > 30 && !softBudgetConfirmed) throw new Error("预估成本超过 30 元，请确认后继续。");
  const groupId = `evaluation-group-${randomUUID()}`;
  const runs = await withDatabaseClient(async (client) => Promise.all(plans.map(async ({ roundIndex, plan, estimate }) => {
    const runId = `evaluation-run-${randomUUID()}`;
    const result = await createEvaluationRun(client, {
      id: runId,
      projectId,
      suiteId: String(smokeSuite.id),
      config: { plan, estimate, protocol: "v2-cutoff-aware", multiRun: { groupId, roundIndex, roundCount, caseRunCounts: normalizedCounts } },
      estimatedCostCny: estimate.estimatedCny,
      protocol: "v2-cutoff-aware",
      comparability: "comparable",
      variants: plan.variants.map((item) => ({ id: `evaluation-variant-${randomUUID()}`, caseId: item.caseId, variant: item.variant })),
    });
    return { ...result, id: runId, roundIndex };
  })));
  return { id: runs[0]?.id, groupId, roundCount, runs, caseRunCounts: normalizedCounts, estimatedCny, requiresSoftBudgetConfirmation: estimatedCny > 30 };
}

async function updateRunProgress(projectId: string, runId: string) {
  return withDatabaseClient(async (client) => {
    await client.query(
      `UPDATE evaluation_runs AS run
       SET status = CASE
         WHEN NOT EXISTS (
           SELECT 1 FROM evaluation_variant_results WHERE run_id = run.id AND status IN ('pending', 'running')
         ) THEN 'completed'
         ELSE 'running'
       END,
       comparability = CASE
         WHEN run.evaluation_protocol = 'v2-cutoff-aware'
           AND NOT EXISTS (
             SELECT 1 FROM evaluation_variant_results WHERE run_id = run.id AND status IN ('pending', 'running')
           )
           AND EXISTS (
             SELECT 1 FROM evaluation_variant_results
             WHERE run_id = run.id
               AND (variant <> 'retrieval')
               AND (status <> 'completed' OR COALESCE(payload #>> '{judgeResult,status}', '') <> 'scored')
           ) THEN 'incomplete'
         WHEN run.evaluation_protocol = 'v2-cutoff-aware'
           AND NOT EXISTS (
             SELECT 1 FROM evaluation_variant_results WHERE run_id = run.id AND status IN ('pending', 'running')
           ) THEN 'comparable'
         ELSE run.comparability
       END,
       consumed_cost_cny = (
         SELECT COALESCE(SUM(COALESCE((payload ->> 'estimatedCostCny')::numeric, 0)), 0)
         FROM evaluation_variant_results WHERE run_id = run.id AND status = 'completed'
       ),
       updated_at = now()
       WHERE run.id = $1 AND run.project_id = $2`,
      [runId, projectId],
    );
  });
}

async function executeProjectEvaluationVariant(projectId: string, runId: string) {
  const claimed = await withDatabaseClient((client) => claimNextEvaluationVariant(client, { projectId, runId }));
  if (!claimed) {
    await updateRunProgress(projectId, runId);
    return { runId, done: true };
  }

  const variantId = String(claimed.id);
  try {
    const variantRow = await withDatabaseClient((client) => loadEvaluationVariant(client, { projectId, variantId }));
    if (!variantRow) throw new Error("评测变体不存在或不属于当前作品。");
    const payload = variantRow.case_payload;
    if (!payload || typeof payload !== "object") throw new Error("评测题目数据无效。");
    const evaluationCase = parseEvaluationCase({ payload, confirmed_at: new Date().toISOString(), enabled: true });
    if (!evaluationCase) throw new Error("评测题目数据无效。");
    const projects = await withDatabaseClient(listProjects);
    const project = projects.find((item) => item.id === projectId);
    if (!project) throw new Error("当前作品不存在。");

    const variant = String(variantRow.variant) as "A" | "B" | "C" | "retrieval";
    const chapterIndex = Math.max(1, (project.manuscript?.chapters ?? []).findIndex((chapter) => chapter.id === evaluationCase.chapterId) + 1);
    const knowledgeCutoffChapterIndex = Number.isInteger(evaluationCase.knowledgeCutoffChapterIndex) && evaluationCase.knowledgeCutoffChapterIndex! > 0
      ? evaluationCase.knowledgeCutoffChapterIndex!
      : chapterIndex;
    const needsRetrieval = variant !== "A";
    const retrievedEvidence = needsRetrieval
      ? await withDatabaseClient((client) => {
          const config = getEmbeddingConfig(process.env);
          return retrieveProjectEvidence(
            projectId,
            `${evaluationCase.title}\n${evaluationCase.authorInstruction}`,
            client,
            (texts) => createOpenAiCompatibleEmbeddings(config, texts),
            { maxChapterIndex: knowledgeCutoffChapterIndex },
          );
        })
      : [];
    const cutoffEvidence = filterEvidenceAtKnowledgeCutoff(retrievedEvidence, knowledgeCutoffChapterIndex);
    const evidence = cutoffEvidence.evidence;
    const retrievalEvidence = evidence.map((item) => `第 ${item.chapterIndex} 章《${item.chapterTitle}》：${item.content}`);
    const startedAt = Date.now();

    const constraintSelection = selectConstraintsForContinuation(project, {
      chapterIndex: knowledgeCutoffChapterIndex,
      userInstruction: evaluationCase.authorInstruction,
      recentManuscriptText: (project.manuscript?.chapters ?? []).slice(Math.max(0, knowledgeCutoffChapterIndex - 3), knowledgeCutoffChapterIndex).map((chapter) => chapter.content).join("\n"),
      retrievalEvidence,
    });
    const effectiveVariant = resolveEvaluationVariant(variant, constraintSelection.selected.length);
    const result = variant === "retrieval"
      ? { text: "", judgeResult: null, judgeOutput: "", judgeRetryCount: 0, continuationRetryCount: 0, completionAttemptTexts: [], completionAttemptMessages: [], ruleResult: { mode: evidence.length ? "normal" : "limited" }, messages: [], judgeMessages: [] }
      : await executeEvaluationVariant({
          project,
          variant: effectiveVariant,
          chapterId: evaluationCase.chapterId,
          authorInstruction: evaluationCase.authorInstruction,
          retrievalEvidence,
          requiredFacts: evaluationCase.requiredFacts,
          forbiddenFacts: evaluationCase.forbiddenFacts,
          expectedBehavior: evaluationCase.expectedBehavior,
          evaluationFocus: evaluationCase.evaluationFocus,
          lockedRules: constraintSelection.selected.map((item) => item.text),
          outputCharacterLimit: DEFAULT_EVALUATION_CONTINUATION_CHARACTER_LIMIT,
        }, {
          completeChat: (config, messages) => completeOpenAiCompatibleChat(getAiProviderConfig(process.env, "writer"), messages, config),
          judgeChat: (config, messages) => completeOpenAiCompatibleChat(getAiProviderConfig(process.env, "evaluationJudge"), messages, config),
        });

    const estimatedCostCny = variant === "retrieval" ? 0 : estimateEvaluationVariantCost({
      writerInput: result.completionAttemptMessages.flat().map((item) => item.content).join("\n"),
      writerOutput: result.completionAttemptTexts.join("\n"),
      judgeInput: result.judgeMessages.map((item) => item.content).join("\n"),
      judgeOutput: result.judgeOutput,
    }, defaultEvaluationRates);
    await withDatabaseClient((client) => saveEvaluationVariantResult(client, {
      id: variantId,
      status: "completed",
      payload: {
        text: result.text,
        judgeResult: result.judgeResult,
        judgeRetryCount: result.judgeRetryCount,
        continuationRetryCount: result.continuationRetryCount,
        judgeDiagnostic: result.judgeResult?.status === "invalid" ? {
          reason: result.judgeResult.reason,
          initialOutputPreview: result.initialJudgeOutput.slice(0, 1_200),
          repairedOutputPreview: result.judgeRetryCount ? result.judgeOutput.slice(0, 1_200) : undefined,
        } : undefined,
        ruleResult: result.ruleResult,
        retrievalEvidence: evidence.map((item) => ({ chapterId: item.chapterId, chapterIndex: item.chapterIndex, chapterTitle: item.chapterTitle, score: item.score, preview: item.content.slice(0, 300) })),
        knowledgeCutoffChapterIndex,
        futureEvidenceSentCount: 0,
        futureEvidenceBlockedCount: cutoffEvidence.futureEvidenceBlockedCount,
        futureConstraintBlockedCount: constraintSelection.futureEvidenceBlockedCount,
        elapsedMs: Date.now() - startedAt,
        estimatedCostCny,
        hardConstraintCount: constraintSelection.selected.length,
        hardConstraintFallbackToRag: variant === "C" && effectiveVariant === "B",
        selectedConstraints: constraintSelection.selected,
        filteredConstraintCount: constraintSelection.filteredCount,
      },
    }));
    await updateRunProgress(projectId, runId);
    return { runId, variantId, status: "completed", done: false };
  } catch (error) {
    await withDatabaseClient((client) => saveEvaluationVariantResult(client, {
      id: variantId,
      status: "failed",
      payload: { error: error instanceof Error ? error.message : "评测执行失败。" },
    }));
    await updateRunProgress(projectId, runId);
    return { runId, variantId, status: "failed", done: false };
  }
}

async function retryProjectEvaluationVariants(projectId: string, runId: string) {
  return withDatabaseClient((client) => retryFailedEvaluationVariants(client, { projectId, runId }));
}

async function rerunProjectEvaluationCase(projectId: string, input: { runId: string; caseId: string }) {
  return withDatabaseClient((client) => rerunEvaluationCaseVariants(client, { projectId, ...input }));
}

async function rerunProjectEvaluationVariant(projectId: string, input: { runId: string; variantId: string }) {
  return withDatabaseClient((client) => rerunEvaluationVariant(client, { projectId, ...input }));
}

async function seedProjectEvaluations(projectId: string) {
  return withDatabaseClient(async (client) => {
    const project = await client.query("SELECT title FROM projects WHERE id = $1", [projectId]);
    const title = project.rows[0]?.title;
    if (typeof title !== "string") throw new Error("作品不存在。");
    const chapters = await client.query(
      "SELECT id, chapter_index, title, content FROM chapters WHERE project_id = $1 ORDER BY chapter_index",
      [projectId],
    );
    const seed = createCutoffCenteredEvaluationSeed({
      projectId,
      projectTitle: title,
      chapters: chapters.rows.map((chapter) => ({
        id: String(chapter.id),
        chapterIndex: Number(chapter.chapter_index),
        title: String(chapter.title),
        content: String(chapter.content ?? ""),
      })),
    });
    await saveEvaluationSeed(client, seed);
    return { fullCases: seed.fullCases.length, smokeCases: seed.smokeCaseIds.length };
  });
}

async function confirmProjectEvaluationCase(
  projectId: string,
  input: { caseId: string; requiredFacts: string[]; forbiddenFacts: string[] },
) {
  return withDatabaseClient((client) => confirmEvaluationCase(client, { projectId, ...input }));
}

async function unconfirmProjectEvaluationCase(projectId: string, caseId: string) {
  return withDatabaseClient((client) => unconfirmEvaluationCase(client, { projectId, caseId }));
}

async function confirmProjectEvaluationSuiteCases(projectId: string, suiteId: string) {
  return withDatabaseClient((client) => confirmEvaluationSuiteCases(client, { projectId, suiteId }));
}

async function createProjectEvaluationCase(projectId: string, input: CreateCaseInput) {
  return withDatabaseClient(async (client) => {
    const suites = await client.query("SELECT id, scope FROM evaluation_suites WHERE project_id = $1", [projectId]);
    const fullSuiteId = suites.rows.find((suite) => suite.scope === "full")?.id;
    const smokeSuiteId = suites.rows.find((suite) => suite.scope === "smoke")?.id;
    if (typeof fullSuiteId !== "string") throw new Error("请先建立评测题库。");
    return createEvaluationCase(client, {
      id: `evaluation-case-manual-${randomUUID()}`,
      projectId,
      fullSuiteId,
      smokeSuiteId: typeof smokeSuiteId === "string" ? smokeSuiteId : undefined,
      ...input,
    });
  });
}

async function deleteProjectEvaluationCase(projectId: string, caseId: string) {
  return withDatabaseClient((client) => deleteEvaluationCase(client, { projectId, caseId }));
}

async function migrateProjectEvaluationFocuses(projectId: string) {
  return withDatabaseClient((client) => migrateEvaluationCaseFocuses(client, { projectId }));
}

export async function createEvaluationsResponse(request: Request, projectId: string, deps: Deps = {}) {
  if (request.method === "GET") {
    const load = deps.load ?? (() => loadProjectEvaluations(projectId));
    return Response.json(await load());
  }
  if (request.method === "POST") {
  const body = await request.json() as { action?: string; estimatedCny?: number; softBudgetConfirmed?: boolean; roundCount?: number; caseRunCounts?: Record<string, number>; runId?: string; caseId?: string; variantId?: string; suiteId?: string; title?: string; authorInstruction?: string; type?: CreateCaseInput["type"]; riskLevel?: CreateCaseInput["riskLevel"]; chapterId?: string; requiredFacts?: string[]; forbiddenFacts?: string[]; includeInSmoke?: boolean };
    if (body.action === "seed") {
      const seed = deps.seed ?? (() => seedProjectEvaluations(projectId));
      return Response.json(await seed(), { status: 201 });
    }
    if (body.action === "migrateFocuses") {
      const migrateFocuses = deps.migrateFocuses ?? (() => migrateProjectEvaluationFocuses(projectId));
      return Response.json(await migrateFocuses());
    }
    if (body.action === "governConstraints") {
      return Response.json(await governAllProjectConstraints());
    }
    if (body.action === "confirmCase") {
      if (!body.caseId || !Array.isArray(body.requiredFacts) || !Array.isArray(body.forbiddenFacts)) {
        return Response.json({ error: "请填写题目的必要事实与禁止事实。" }, { status: 400 });
      }
      const input = { caseId: body.caseId, requiredFacts: body.requiredFacts, forbiddenFacts: body.forbiddenFacts };
      const confirmCase = deps.confirmCase ?? ((value: typeof input) => confirmProjectEvaluationCase(projectId, value));
      return Response.json(await confirmCase(input));
    }
    if (body.action === "unconfirmCase") {
      if (!body.caseId) return Response.json({ error: "请选择要撤销确认的题目。" }, { status: 400 });
      const input = { caseId: body.caseId };
      const unconfirmCase = deps.unconfirmCase ?? ((value: typeof input) => unconfirmProjectEvaluationCase(projectId, value.caseId));
      const result = await unconfirmCase(input);
      return result ? Response.json(result) : Response.json({ error: "题目不存在或已删除。" }, { status: 404 });
    }
    if (body.action === "confirmSuiteCases") {
      if (!body.suiteId) return Response.json({ error: "请选择评测集合。" }, { status: 400 });
      const input = { suiteId: body.suiteId };
      const confirmSuiteCases = deps.confirmSuiteCases ?? ((value: typeof input) => confirmProjectEvaluationSuiteCases(projectId, value.suiteId));
      return Response.json(await confirmSuiteCases(input));
    }
    if (body.action === "createCase") {
      if (!body.title?.trim() || !body.chapterId?.trim() || !Array.isArray(body.requiredFacts) || !body.requiredFacts.length || !Array.isArray(body.forbiddenFacts) || !body.forbiddenFacts.length || !["retrieval", "continuation", "adversarial", "unanswerable"].includes(body.type ?? "") || !["normal", "high"].includes(body.riskLevel ?? "")) {
        return Response.json({ error: "请填写标题、章节锚点、题目类型、风险级别、必要事实和禁止事实。" }, { status: 400 });
      }
      const input: CreateCaseInput = { title: body.title.trim(), authorInstruction: body.authorInstruction?.trim(), type: body.type!, riskLevel: body.riskLevel!, chapterId: body.chapterId.trim(), requiredFacts: body.requiredFacts, forbiddenFacts: body.forbiddenFacts, includeInSmoke: Boolean(body.includeInSmoke) };
      const createCase = deps.createCase ?? ((value: CreateCaseInput) => createProjectEvaluationCase(projectId, value));
      return Response.json(await createCase(input), { status: 201 });
    }
    if (body.action === "deleteCase") {
      if (!body.caseId) return Response.json({ error: "请选择要删除的题目。" }, { status: 400 });
      const input = { caseId: body.caseId };
      const deleteCase = deps.deleteCase ?? ((value: typeof input) => deleteProjectEvaluationCase(projectId, value.caseId));
      const deleted = await deleteCase(input);
      return deleted ? Response.json(deleted) : Response.json({ error: "题目不存在或已删除。" }, { status: 404 });
    }
    if (body.action === "createRun" && (body.estimatedCny ?? 0) > 50) {
      return Response.json({ error: "预估成本超过 50 元硬上限。" }, { status: 409 });
    }
    if (body.action === "createRun" && (body.estimatedCny ?? 0) > 30 && !body.softBudgetConfirmed) {
      return Response.json({ error: "预估成本超过 30 元，请确认后继续。", requiresSoftBudgetConfirmation: true }, { status: 409 });
    }
    if (body.action === "createRun") {
      const createRun = deps.createRun ?? (() => createProjectEvaluationRun(projectId, Boolean(body.softBudgetConfirmed)));
      try {
        return Response.json(await createRun(), { status: 201 });
      } catch (error) {
        const message = error instanceof Error ? error.message : "评测任务创建失败。";
        return Response.json({ error: message, requiresSoftBudgetConfirmation: message.includes("30 元") }, { status: message.includes("成本") ? 409 : 400 });
      }
    }
    if (body.action === "createMultiRun") {
      if (!Number.isInteger(body.roundCount) || body.roundCount! < 1 || body.roundCount! > 20) {
        return Response.json({ error: "多轮测试次数必须是 1–20 的整数。" }, { status: 400 });
      }
      const input = { roundCount: body.roundCount!, softBudgetConfirmed: Boolean(body.softBudgetConfirmed) };
      const createMultiRun = deps.createMultiRun ?? ((value: typeof input) => createProjectEvaluationRuns(projectId, value.softBudgetConfirmed, value.roundCount));
      try {
        return Response.json(await createMultiRun(input), { status: 201 });
      } catch (error) {
        const message = error instanceof Error ? error.message : "多轮评测任务创建失败。";
        return Response.json({ error: message, requiresSoftBudgetConfirmation: message.includes("30 元") }, { status: message.includes("成本") ? 409 : 400 });
      }
    }
    if (body.action === "createSelectiveMultiRun") {
      if (!body.caseRunCounts || typeof body.caseRunCounts !== "object" || Array.isArray(body.caseRunCounts)) {
        return Response.json({ error: "请为每个冒烟题填写测试次数。" }, { status: 400 });
      }
      const input = { caseRunCounts: body.caseRunCounts, softBudgetConfirmed: Boolean(body.softBudgetConfirmed) };
      const createSelectiveMultiRun = deps.createSelectiveMultiRun ?? ((value: typeof input) => createSelectiveProjectEvaluationRuns(projectId, value.caseRunCounts, value.softBudgetConfirmed));
      try {
        return Response.json(await createSelectiveMultiRun(input), { status: 201 });
      } catch (error) {
        const message = error instanceof Error ? error.message : "按题目次数创建评测任务失败。";
        return Response.json({ error: message, requiresSoftBudgetConfirmation: message.includes("30 元") }, { status: message.includes("成本") ? 409 : 400 });
      }
    }
    if (body.action === "executeNextVariant") {
      if (!body.runId) return Response.json({ error: "请选择要执行的评测任务。" }, { status: 400 });
      const executeNextVariant = deps.executeNextVariant ?? ((input: { runId: string }) => executeProjectEvaluationVariant(projectId, input.runId));
      return Response.json(await executeNextVariant({ runId: body.runId }));
    }
    if (body.action === "retryFailedVariants") {
      if (!body.runId) return Response.json({ error: "请选择要重试的评测任务。" }, { status: 400 });
      const retryFailedVariants = deps.retryFailedVariants ?? ((input: { runId: string }) => retryProjectEvaluationVariants(projectId, input.runId));
      return Response.json(await retryFailedVariants({ runId: body.runId }));
    }
    if (body.action === "rerunCase") {
      if (!body.runId || !body.caseId) return Response.json({ error: "请选择要重跑的题目。" }, { status: 400 });
      const input = { runId: body.runId, caseId: body.caseId };
      const rerunCase = deps.rerunCase ?? ((value: typeof input) => rerunProjectEvaluationCase(projectId, value));
      const result = await rerunCase(input) as { rerunCount?: number };
      return result.rerunCount ? Response.json(result) : Response.json({ error: "本题正在执行，或该轮中不存在可重跑结果。" }, { status: 409 });
    }
    if (body.action === "rerunVariant") {
      if (!body.runId || !body.variantId) return Response.json({ error: "请选择要重跑的测试项。" }, { status: 400 });
      const input = { runId: body.runId, variantId: body.variantId };
      const rerunVariant = deps.rerunVariant ?? ((value: typeof input) => rerunProjectEvaluationVariant(projectId, value));
      const result = await rerunVariant(input) as { rerunCount?: number };
      return result.rerunCount ? Response.json(result) : Response.json({ error: "本轮正在执行，或该测试项不存在可重跑结果。" }, { status: 409 });
    }
    return Response.json({ error: "暂不支持此评测操作。" }, { status: 400 });
  }
  return Response.json({ error: "不支持的请求方法。" }, { status: 405 });
}

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  return createEvaluationsResponse(request, (await params).projectId);
}

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  return createEvaluationsResponse(request, (await params).projectId);
}
