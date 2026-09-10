import type { QueryClient } from "./project-repository";
import type { EvaluationSeed } from "@/lib/evaluation-seed";

type EvaluationRunVariantInput = {
  id: string;
  caseId: string;
  variant: "A" | "B" | "C" | "retrieval";
};

type CreateEvaluationRunInput = {
  id: string;
  projectId: string;
  suiteId: string;
  config: unknown;
  estimatedCostCny: number;
  protocol: "v1-diagnostic" | "v2-cutoff-aware";
  comparability: "historical_diagnostic" | "comparable" | "incomplete";
  variants: EvaluationRunVariantInput[];
};

export async function confirmEvaluationCase(
  client: QueryClient,
  input: { projectId: string; caseId: string; requiredFacts: string[]; forbiddenFacts: string[] },
) {
  const result = await client.query(
    `UPDATE evaluation_cases
     SET payload = payload || $3::jsonb,
         confirmed_at = now(),
         enabled = true,
         updated_at = now()
     WHERE id = $1 AND project_id = $2
     RETURNING id`,
    [input.caseId, input.projectId, JSON.stringify({ requiredFacts: input.requiredFacts, forbiddenFacts: input.forbiddenFacts })],
  );
  return result.rows[0] ?? null;
}

export async function unconfirmEvaluationCase(
  client: QueryClient,
  input: { projectId: string; caseId: string },
) {
  const result = await client.query(
    `UPDATE evaluation_cases
     SET confirmed_at = NULL, enabled = false, updated_at = now()
     WHERE id = $1 AND project_id = $2
     RETURNING id`,
    [input.caseId, input.projectId],
  );
  return result.rows[0] ?? null;
}

/** Adds typed focus to legacy manual cases that declared it in their visible title. */
export async function migrateEvaluationCaseFocuses(
  client: QueryClient,
  input: { projectId: string },
) {
  const result = await client.query(
    `UPDATE evaluation_cases
     SET payload = jsonb_set(
           payload,
           '{evaluationFocus}',
           to_jsonb(CASE
             WHEN payload ->> 'title' LIKE 'RAG 敏感：%' THEN 'rag'
             WHEN payload ->> 'title' LIKE '约束敏感：%' THEN 'constraint'
             WHEN payload ->> 'title' LIKE '开放创作：%' THEN 'creative'
           END::text),
           true
         ),
         updated_at = now()
     WHERE project_id = $1
       AND NOT (payload ? 'evaluationFocus')
       AND (
         payload ->> 'title' LIKE 'RAG 敏感：%'
         OR payload ->> 'title' LIKE '约束敏感：%'
         OR payload ->> 'title' LIKE '开放创作：%'
       )`,
    [input.projectId],
  );
  return { migratedCount: result.rowCount ?? 0 };
}

export async function confirmEvaluationSuiteCases(
  client: QueryClient,
  input: { projectId: string; suiteId: string },
) {
  const result = await client.query(
    `UPDATE evaluation_cases AS item
     SET confirmed_at = now(), enabled = true, updated_at = now()
     FROM evaluation_suite_cases AS membership
     JOIN evaluation_suites AS suite ON suite.id = membership.suite_id
     WHERE item.id = membership.case_id
       AND suite.project_id = $1
       AND membership.suite_id = $2
       AND item.confirmed_at IS NULL`,
    [input.projectId, input.suiteId],
  );
  return { confirmedCount: result.rowCount ?? 0 };
}

type ManualEvaluationCaseInput = {
  id: string;
  projectId: string;
  fullSuiteId: string;
  smokeSuiteId?: string;
  title: string;
  authorInstruction?: string;
  type: "retrieval" | "continuation" | "adversarial" | "unanswerable";
  riskLevel: "normal" | "high";
  chapterId: string;
  requiredFacts: string[];
  forbiddenFacts: string[];
  includeInSmoke: boolean;
};

export async function createEvaluationCase(client: QueryClient, input: ManualEvaluationCaseInput) {
  const expectedBehavior = input.type === "retrieval" ? "retrieve_evidence" : input.type === "adversarial" ? "block_conflict" : input.type === "unanswerable" ? "limited" : "continue_story";
  const payload = {
    id: input.id,
    projectId: input.projectId,
    suiteId: input.fullSuiteId,
    title: input.title,
    type: input.type,
    riskLevel: input.riskLevel,
    chapterId: input.chapterId,
    authorInstruction: input.authorInstruction?.trim() || "人工创建的评测题目；仅依据指定章节与确认事实执行。",
    requiredFacts: input.requiredFacts,
    forbiddenFacts: input.forbiddenFacts,
    expectedEvidenceChapterIds: [input.chapterId],
    expectedBehavior,
    enabled: false,
  };
  const result = await client.query(
    `INSERT INTO evaluation_cases (id, suite_id, project_id, payload, enabled)
     VALUES ($1, $2, $3, $4::jsonb, false)
     RETURNING id`,
    [input.id, input.fullSuiteId, input.projectId, JSON.stringify(payload)],
  );
  await client.query(
    `INSERT INTO evaluation_suite_cases (suite_id, case_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [input.fullSuiteId, input.id],
  );
  if (input.includeInSmoke && input.smokeSuiteId) {
    await client.query(
      `INSERT INTO evaluation_suite_cases (suite_id, case_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [input.smokeSuiteId, input.id],
    );
  }
  return result.rows[0] ?? null;
}

export async function deleteEvaluationCase(
  client: QueryClient,
  input: { projectId: string; caseId: string },
) {
  const result = await client.query(
    "DELETE FROM evaluation_cases WHERE id = $1 AND project_id = $2 RETURNING id",
    [input.caseId, input.projectId],
  );
  return result.rows[0] ?? null;
}

export async function createEvaluationRun(client: QueryClient, input: CreateEvaluationRunInput) {
  const eligibleCases = await client.query(
    `SELECT item.id
     FROM evaluation_cases AS item
     JOIN evaluation_suite_cases AS membership ON membership.case_id = item.id
     JOIN evaluation_suites AS suite ON suite.id = membership.suite_id
     WHERE suite.project_id = $1
       AND membership.suite_id = $2
       AND item.confirmed_at IS NOT NULL
       AND item.enabled = true`,
    [input.projectId, input.suiteId],
  );
  const eligibleCaseIds = new Set(eligibleCases.rows.map((item) => String(item.id)));
  const variants = input.variants.filter((item) => eligibleCaseIds.has(item.caseId));

  if (!variants.length) {
    throw new Error("当前冒烟集没有已确认并启用的题目。");
  }

  await client.query(
    `INSERT INTO evaluation_runs (id, suite_id, project_id, status, config, estimated_cost_cny, evaluation_protocol, comparability)
     VALUES ($1, $2, $3, 'ready', $4::jsonb, $5, $6, $7)`,
    [input.id, input.suiteId, input.projectId, JSON.stringify(input.config), input.estimatedCostCny, input.protocol, input.comparability],
  );
  for (const variant of variants) {
    await client.query(
      `INSERT INTO evaluation_variant_results (id, run_id, case_id, variant)
       VALUES ($1, $2, $3, $4)`,
      [variant.id, input.id, variant.caseId, variant.variant],
    );
  }
  return { id: input.id, variantCount: variants.length };
}

export async function loadEvaluationVariant(
  client: QueryClient,
  input: { projectId: string; variantId: string },
) {
  const result = await client.query(
    `SELECT result.*, item.payload AS case_payload, run.config AS run_config,
            run.evaluation_protocol, run.comparability, run.diagnostic_summary,
            COUNT(*) OVER (PARTITION BY result.run_id) AS variant_count
     FROM evaluation_variant_results AS result
     JOIN evaluation_runs AS run ON run.id = result.run_id
     JOIN evaluation_cases AS item ON item.id = result.case_id
     WHERE run.project_id = $1 AND result.id = $2`,
    [input.projectId, input.variantId],
  );
  return result.rows[0] ?? null;
}

export async function retryFailedEvaluationVariants(
  client: QueryClient,
  input: { projectId: string; runId: string },
) {
  const result = await client.query(
    `UPDATE evaluation_variant_results AS result
     SET status = 'pending', payload = '{}'::jsonb, lease_expires_at = NULL, updated_at = now()
     FROM evaluation_runs AS run
     WHERE result.run_id = run.id
       AND result.run_id = $1
       AND run.project_id = $2
       AND (
         result.status = 'failed'
         OR (result.status = 'completed' AND COALESCE(result.payload #>> '{judgeResult,status}', '') = 'invalid')
       )`,
    [input.runId, input.projectId],
  );
  return { retriedCount: result.rowCount ?? 0 };
}

/** Replaces one case's prior A/B/C result inside the same evaluation round. */
export async function rerunEvaluationCaseVariants(
  client: QueryClient,
  input: { projectId: string; runId: string; caseId: string },
) {
  const result = await client.query(
    `UPDATE evaluation_variant_results AS result
     SET status = 'pending', payload = '{}'::jsonb, lease_expires_at = NULL, updated_at = now()
     FROM evaluation_runs AS run
     WHERE result.run_id = run.id
       AND result.run_id = $1
       AND result.case_id = $2
       AND run.project_id = $3
       AND NOT EXISTS (
         SELECT 1 FROM evaluation_variant_results AS active
         WHERE active.run_id = result.run_id
           AND active.status IN ('pending', 'running')
       )`,
    [input.runId, input.caseId, input.projectId],
  );
  if (result.rowCount) {
    await client.query(
      `UPDATE evaluation_runs
       SET status = 'running', comparability = 'incomplete', updated_at = now()
       WHERE id = $1 AND project_id = $2`,
      [input.runId, input.projectId],
    );
  }
  return { rerunCount: result.rowCount ?? 0 };
}

/** Replaces exactly one prior variant result inside the same evaluation round. */
export async function rerunEvaluationVariant(
  client: QueryClient,
  input: { projectId: string; runId: string; variantId: string },
) {
  const result = await client.query(
    `UPDATE evaluation_variant_results AS result
     SET status = 'pending', payload = '{}'::jsonb, lease_expires_at = NULL, updated_at = now()
     FROM evaluation_runs AS run
     WHERE result.run_id = run.id
       AND result.run_id = $1
       AND result.id = $2
       AND run.project_id = $3
       AND NOT EXISTS (
         SELECT 1 FROM evaluation_variant_results AS active
         WHERE active.run_id = result.run_id
           AND active.status IN ('pending', 'running')
       )`,
    [input.runId, input.variantId, input.projectId],
  );
  if (result.rowCount) {
    await client.query(
      `UPDATE evaluation_runs
       SET status = 'running', comparability = 'incomplete', updated_at = now()
       WHERE id = $1 AND project_id = $2`,
      [input.runId, input.projectId],
    );
  }
  return { rerunCount: result.rowCount ?? 0 };
}

export async function saveEvaluationSeed(client: QueryClient, seed: EvaluationSeed) {
  for (const suite of [seed.fullSuite, seed.smokeSuite]) {
    await client.query(
      `INSERT INTO evaluation_suites (id, project_id, name, scope)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
      [suite.id, seed.projectId, suite.name, suite.scope],
    );
  }

  for (const item of seed.fullCases) {
    await client.query(
      `INSERT INTO evaluation_cases (id, suite_id, project_id, payload, enabled)
       VALUES ($1, $2, $3, $4::jsonb, false)
       ON CONFLICT (id) DO NOTHING`,
      [item.id, seed.fullSuite.id, seed.projectId, JSON.stringify(item)],
    );
    await client.query(
      `INSERT INTO evaluation_suite_cases (suite_id, case_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [seed.fullSuite.id, item.id],
    );
  }

  for (const caseId of seed.smokeCaseIds) {
    await client.query(
      `INSERT INTO evaluation_suite_cases (suite_id, case_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [seed.smokeSuite.id, caseId],
    );
  }
}

export async function claimNextEvaluationVariant(
  client: QueryClient,
  input: { projectId: string; runId: string },
) {
  await client.query(
    `UPDATE evaluation_variant_results AS result
     SET status = 'pending', lease_expires_at = NULL
     FROM evaluation_runs AS run
     WHERE result.run_id = run.id
       AND result.run_id = $1
       AND run.project_id = $2
       AND result.status = 'running'
       AND result.lease_expires_at < now()`,
    [input.runId, input.projectId],
  );
  const result = await client.query(
    `WITH candidate AS (
      SELECT result.id FROM evaluation_variant_results AS result
      JOIN evaluation_runs AS run ON run.id = result.run_id
      WHERE result.run_id = $1 AND run.project_id = $2 AND result.status = 'pending'
      ORDER BY result.created_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE evaluation_variant_results AS result
    SET status = 'running', lease_expires_at = now() + interval '5 minutes', updated_at = now()
    FROM candidate
    WHERE result.id = candidate.id
    RETURNING result.*`,
    [input.runId, input.projectId],
  );
  return result.rows[0] ?? null;
}

export async function saveEvaluationVariantResult(
  client: QueryClient,
  result: { id: string; status: "completed" | "failed"; payload?: unknown },
) {
  const update = await client.query(
    `UPDATE evaluation_variant_results
     SET status = $2, payload = $3::jsonb, lease_expires_at = NULL, updated_at = now()
     WHERE id = $1 AND status <> 'completed'
     RETURNING id`,
    [result.id, result.status, JSON.stringify(result.payload ?? {})],
  );
  return { skipped: !update.rowCount };
}
