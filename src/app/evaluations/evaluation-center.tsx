"use client";

import { useState, type FormEvent } from "react";
import type { EvaluationSnapshotMetadata, SnapshotConstraintCandidate } from "@/lib/knowledge";
import { DEFAULT_EVALUATION_CONTINUATION_CHARACTER_LIMIT } from "@/lib/evaluation";
import { summarizeEvaluationComparison, summarizeEvaluationRunGroup, type EvaluationJudgeMetrics, type MetricCell } from "@/lib/evaluation-metrics";

type Suite = { id: string; name: string; scope: "smoke" | "full" };
type CasePayload = { id: string; title: string; type: string; evaluationFocus?: "rag" | "constraint" | "creative"; riskLevel: string; requiredFacts: string[]; forbiddenFacts: string[]; confirmedAt?: string; enabled: boolean };
type StoredCase = { id: string; payload: CasePayload; confirmed_at?: string | null; enabled: boolean };
type Membership = { suite_id: string; case_id: string };
type ChapterOption = { id: string; chapter_index: number; title: string };
type CreateCaseInput = { title: string; type: "retrieval" | "continuation" | "adversarial" | "unanswerable"; riskLevel: "normal" | "high"; chapterId: string; requiredFacts: string[]; forbiddenFacts: string[]; includeInSmoke: boolean };
type EvaluationRun = { id: string; status: string; estimated_cost_cny?: number | string; consumed_cost_cny?: number | string; created_at?: string; evaluation_protocol?: "v1-diagnostic" | "v2-cutoff-aware"; comparability?: "historical_diagnostic" | "comparable" | "incomplete"; diagnostic_summary?: { reason?: string; issues?: string[] }; config?: { multiRun?: { groupId: string; roundIndex: number; roundCount: number } } };
type EvaluationVariant = { id: string; run_id: string; case_id: string; variant: "A" | "B" | "C" | "retrieval"; status: string; payload?: { text?: string; error?: string; elapsedMs?: number; hardConstraintCount?: number; hardConstraintFallbackToRag?: boolean; filteredConstraintCount?: number; selectedConstraints?: Array<{ id: string; text: string; priority: string; evidenceChapterIndexes: number[]; reason: string }>; estimatedCostCny?: number; futureEvidenceSentCount?: number; futureEvidenceBlockedCount?: number; futureConstraintBlockedCount?: number; judgeRetryCount?: number; judgeDiagnostic?: { reason?: string; initialOutputPreview?: string; repairedOutputPreview?: string }; ruleResult?: { mode?: string }; judgeResult?: EvaluationJudgeMetrics | null; retrievalEvidence?: Array<{ chapterIndex: number; chapterTitle: string; score: number; preview: string }> }; case_payload?: CasePayload };

export type EvaluationCenterData = { suites: Suite[]; cases: StoredCase[]; runs: EvaluationRun[]; variants?: EvaluationVariant[]; memberships?: Membership[]; chapters?: ChapterOption[]; evaluationSnapshot?: EvaluationSnapshotMetadata; snapshotAnalysisProgress?: { completedBatchCount: number; totalBatchCount: number; pendingBatchCount: number; percent: number } };

export function sortEvaluationSuites(suites: Suite[]) {
  return [...suites].sort((left, right) => Number(left.scope !== "smoke") - Number(right.scope !== "smoke"));
}

export function isEvaluationCaseConfirmed(item: StoredCase) {
  return Boolean(item.confirmed_at ?? item.payload.confirmedAt) && item.enabled;
}

function labelForType(type: string) {
  return ({ retrieval: "检索", continuation: "受约束续写", adversarial: "高风险反例", unanswerable: "无答案" } as Record<string, string>)[type] ?? type;
}

function labelForFocus(focus?: CasePayload["evaluationFocus"]) {
  if (!focus) return "通用";
  return ({ rag: "RAG 敏感", constraint: "约束敏感", creative: "开放创作" } as const)[focus];
}

function factsFrom(form: HTMLFormElement, field: string) {
  return String(new FormData(form).get(field) ?? "").split("\n").map((item) => item.trim()).filter(Boolean);
}

function formatCny(value: number | string | undefined) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? `¥${amount.toFixed(2)}` : "¥0.00";
}

function formatMetric(cell: MetricCell, format: (value: number) => string) {
  return cell.value === null ? "—" : `${format(cell.value)}（n=${cell.sampleSize}）`;
}

export const EVALUATION_METRIC_DESCRIPTIONS: Record<string, string> = {
  "成功率": "完成且评分结果有效的变体占全部变体的比例。",
  "失败率": "请求或执行失败的变体占全部变体的比例。",
  "正向生成质量均值 ± 标准差": "正常续写的正向质量均值；标准差反映样本波动。",
  "最终净质量均值 ± 标准差": "正向质量减风险扣分后的均值；标准差反映样本波动。",
  "相对 A 的最终净质量差值": "该方案最终净质量均值减方案 A 的对应均值。",
  "平均断点承接分（仅正常续写）": "是否紧接当前断点的事件、场景和悬念继续书写。",
  "平均事实遵循分（仅正常续写）": "对已给定事实的尊重程度；开放题不罚低影响补全。",
  "平均人物一致性分（仅正常续写）": "人物口吻、能力、关系和行为是否符合已知设定。",
  "平均剧情连贯分（仅正常续写）": "前后因果是否清楚，场景转换是否自然。",
  "平均剧情推进分（仅正常续写）": "是否产生下一步行动、选择或信息变化。",
  "平均文风可读性分（仅正常续写）": "叙述是否流畅、清晰，节奏和语气是否易读。",
  "RAG 专项质量（证据使用与转化，100分）": "RAG 题按证据使用、准确理解与自然转化加权计算。",
  "约束专项质量（边界与一致性，100分）": "约束题按可执行边界遵循和一致性加权计算。",
  "开放创作专项质量（推进与张力，100分）": "开放题按推进、张力、主动性和可控扩写加权计算。",
  "风险扣分（仅正常续写）": "严重冲突、主线性无依据设定等风险的平均扣分。",
  "最终净质量（仅正常续写）": "正向生成质量减风险扣分；仅比较正常续写。",
  "核心证据合理使用（仅正常续写）": "关键证据是否被合理采用，不要求复述全部背景。",
  "合理扩写评分（仅正常续写）": "新增细节是否服务当前场景，且不改写主线因果。",
  "场景张力（仅正常续写）": "冲突、悬念、信息差或行动压力带来的张力。",
  "人物主动性（仅正常续写）": "人物是否基于自身动机作出选择和行动。",
  "可控开脑洞（仅正常续写）": "允许低影响想象；不允许无依据设定决定主线。",
  "证据转化（仅正常续写）": "是否把检索线索转为当前观察、推断或行动。",
  "平均约束遵循分（仅正常续写）": "是否满足本题直接相关的可执行边界。",
  "安全处理成功率（无答案/反例）": "无答案或反例题中，安全拒答、澄清或纠偏的成功比例。",
  "严重冲突率": "与核心事实、人物设定或题目边界严重矛盾的比例。",
  "无依据断言率": "把未证实推测或主线设定写成确定事实的比例。",
  "人工复核率": "因风险、证据不足或输出不完整而需人工判断的比例。",
  "未来信息泄漏": "是否引入知识截止点之后的正文信息；越低越好。",
  "平均耗时": "从变体开始执行到得到结果的平均耗时。",
  "平均估算成本": "按实际提示与输出长度估算的单变体平均费用。",
};

export function evaluationMetricDescription(label: string) {
  return EVALUATION_METRIC_DESCRIPTIONS[label] ?? null;
}

function MetricLabel({ label }: { label: string }) {
  const description = evaluationMetricDescription(label);
  return description ? <span className="evaluationMetricTooltip" tabIndex={0} title={description}>{label}<span role="tooltip">{description}</span></span> : <>{label}</>;
}

function estimateSmokeCost(cases: StoredCase[]) {
  let writerInput = 0;
  let writerOutput = 0;
  let judgeInput = 0;
  let judgeOutput = 0;
  for (const item of cases) {
    if (item.payload.type === "retrieval") continue;
    writerInput += 1_200 + 2_400 + 3_200;
    const outputTokensPerVariant = Math.ceil(DEFAULT_EVALUATION_CONTINUATION_CHARACTER_LIMIT * 1.5);
    writerOutput += 3 * outputTokensPerVariant;
    const judgeCount = 3;
    judgeInput += judgeCount * (1_500 + outputTokensPerVariant);
    judgeOutput += judgeCount * 500;
  }
  return (writerInput / 1_000_000) * 4 + (writerOutput / 1_000_000) * 12 + (judgeInput / 1_000_000) * 4 + (judgeOutput / 1_000_000) * 12;
}

export function EvaluationCenter({ data, onConfirmCase, onUnconfirmCase, onConfirmSuite, onCreateCase, onDeleteCase, onSeedCutoffCases, onCreateSnapshot, onStartSnapshotAnalysis, onRetryFailedSnapshotAnalysis, onRunRecentSnapshotAnalysis, onBuildSnapshotCandidates, onReviewSnapshotCandidate, onStartSmokeRun, onStartMultiRun, onStartSelectiveMultiRun, onRetryFailedVariants, onRerunCase, onRerunVariant, runningSmoke, creatingSnapshot, snapshotAnalysisBusy, savingCaseId, savingSuiteId, creatingCase, deletingCaseId }: {
  data: EvaluationCenterData;
  onConfirmCase: (input: { caseId: string; requiredFacts: string[]; forbiddenFacts: string[] }) => Promise<void>;
  onUnconfirmCase: (input: { caseId: string }) => Promise<void>;
  onConfirmSuite: (input: { suiteId: string }) => Promise<void>;
  onCreateCase: (input: CreateCaseInput) => Promise<boolean>;
  onDeleteCase: (input: { caseId: string }) => Promise<void>;
  onSeedCutoffCases: () => Promise<void>;
  onCreateSnapshot: (input: { chapterCount: number }) => Promise<void>;
  onStartSnapshotAnalysis: () => Promise<void>;
  onRetryFailedSnapshotAnalysis: () => Promise<void>;
  onRunRecentSnapshotAnalysis: () => Promise<void>;
  onBuildSnapshotCandidates: () => Promise<void>;
  onReviewSnapshotCandidate: (input: { candidateId?: string; title?: string; value?: string; action: "lock" | "reference" | "ignore" | "lockPackage" }) => Promise<void>;
  onStartSmokeRun: () => Promise<void>;
  onStartMultiRun: (input: { roundCount: number }) => Promise<void>;
  onStartSelectiveMultiRun: (input: { caseRunCounts: Record<string, number> }) => Promise<void>;
  onRetryFailedVariants: (input: { runId: string }) => Promise<void>;
  onRerunCase: (input: { runId: string; caseId: string }) => Promise<void>;
  onRerunVariant: (input: { runId: string; variantId: string }) => Promise<void>;
  runningSmoke?: boolean;
  creatingSnapshot?: boolean;
  snapshotAnalysisBusy?: boolean;
  savingCaseId?: string;
  savingSuiteId?: string;
  creatingCase?: boolean;
  deletingCaseId?: string;
}) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editedConstraintValues, setEditedConstraintValues] = useState<Record<string, string>>({});
  const [snapshotChapterCount, setSnapshotChapterCount] = useState(Math.max(1, Math.floor((data.chapters?.length ?? 1) * 0.6)));
  const [multiRoundCount, setMultiRoundCount] = useState(5);
  const [caseRunCounts, setCaseRunCounts] = useState<Record<string, number>>({});
  const [rerunMenu, setRerunMenu] = useState<{ runId: string; caseId: string; variantId: string; variantLabel: string; title: string; x: number; y: number; disabled: boolean } | null>(null);
  const caseById = new Map(data.cases.map((item) => [item.id, item]));
  const membersBySuite = new Map<string, StoredCase[]>();
  for (const membership of data.memberships ?? []) {
    const item = caseById.get(membership.case_id);
    if (item) membersBySuite.set(membership.suite_id, [...(membersBySuite.get(membership.suite_id) ?? []), item]);
  }
  const smokeSuite = data.suites.find((suite) => suite.scope === "smoke");
  const smokeCases = smokeSuite ? membersBySuite.get(smokeSuite.id) ?? [] : [];
  const enabledSmokeCases = smokeCases.filter(isEvaluationCaseConfirmed);
  const estimatedVariantCount = enabledSmokeCases.reduce((count, item) => count + (item.payload.type === "retrieval" ? 1 : 3), 0);
  const estimatedSmokeCost = estimateSmokeCost(enabledSmokeCases);
  const selectiveRunCount = enabledSmokeCases.reduce((sum, item) => sum + Math.max(1, Math.min(20, caseRunCounts[item.id] ?? 1)), 0);
  const selectiveVariantCount = enabledSmokeCases.reduce((sum, item) => sum + (item.payload.type === "retrieval" ? 1 : 3) * Math.max(1, Math.min(20, caseRunCounts[item.id] ?? 1)), 0);
  const estimatedSelectiveSmokeCost = enabledSmokeCases.reduce((sum, item) => sum + estimateSmokeCost([item]) * Math.max(1, Math.min(20, caseRunCounts[item.id] ?? 1)), 0);
  const v2Runs = data.runs.filter((item) => item.evaluation_protocol === "v2-cutoff-aware");
  const historicalRuns = data.runs.filter((item) => item.evaluation_protocol !== "v2-cutoff-aware");
  const latestRun = v2Runs[0];
  const activeMultiRun = latestRun?.config?.multiRun;
  const activeRuns = activeMultiRun
    ? v2Runs.filter((item) => item.config?.multiRun?.groupId === activeMultiRun.groupId).sort((left, right) => (left.config?.multiRun?.roundIndex ?? 0) - (right.config?.multiRun?.roundIndex ?? 0))
    : latestRun ? [latestRun] : [];
  const activeRunIds = new Set(activeRuns.map((item) => item.id));
  const latestVariants = (data.variants ?? []).filter((item) => activeRunIds.has(item.run_id));
  const completedVariantCount = latestVariants.filter((item) => item.status === "completed").length;
  const failedVariants = latestVariants.filter((item) => item.status === "failed");
  const comparison = summarizeEvaluationComparison(latestVariants.map((item) => ({
    ...item,
    caseType: item.case_payload?.type as "retrieval" | "continuation" | "adversarial" | "unanswerable" | undefined,
    evaluationFocus: item.case_payload?.evaluationFocus,
  })));
  const multiRunSummary = summarizeEvaluationRunGroup(latestVariants.map((item) => ({
    ...item,
    caseType: item.case_payload?.type as "retrieval" | "continuation" | "adversarial" | "unanswerable" | undefined,
    evaluationFocus: item.case_payload?.evaluationFocus,
  })));
  const comparisonReady = activeRuns.length > 0 && activeRuns.every((item) => item.comparability === "comparable") && latestVariants.some((item) => item.variant !== "retrieval");
  const candidatePackagesByImportance = new Map<"main" | "important", Map<string, SnapshotConstraintCandidate[]>>([
    ["main", new Map()],
    ["important", new Map()],
  ]);
  for (const candidate of data.evaluationSnapshot?.analysis.candidates ?? []) {
    const importance = candidate.importance ?? "important";
    const packages = candidatePackagesByImportance.get(importance)!;
    packages.set(candidate.title, [...(packages.get(candidate.title) ?? []), candidate]);
  }
  const reviewedDirectoryNames = new Set((data.evaluationSnapshot?.analysis.candidates ?? []).map((candidate) => candidate.title));
  const directoryOnlyCount = (data.evaluationSnapshot?.analysis.directory ?? []).filter((entry) => !reviewedDirectoryNames.has(entry.canonicalName)).length;
  const snapshotFailedBatches = data.evaluationSnapshot?.analysis.failedBatches ?? [];
  const snapshotRecoveryByParent = new Map((data.evaluationSnapshot?.analysis.recoveryBatches ?? []).map((item) => [item.parentBatchId, item]));

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const created = await onCreateCase({
      title: String(new FormData(form).get("title") ?? "").trim(),
      type: String(new FormData(form).get("type") ?? "retrieval") as CreateCaseInput["type"],
      riskLevel: String(new FormData(form).get("riskLevel") ?? "normal") as CreateCaseInput["riskLevel"],
      chapterId: String(new FormData(form).get("chapterId") ?? "").trim(),
      requiredFacts: factsFrom(form, "requiredFacts"),
      forbiddenFacts: factsFrom(form, "forbiddenFacts"),
      includeInSmoke: new FormData(form).get("includeInSmoke") === "on",
    });
    if (created) {
      form.reset();
      setShowCreateForm(false);
    }
  };

  return <section className="evaluationCenter">
    <header className="evaluationCenterHeader"><div><span className="eyebrow">开发者工具</span><h2>功能评测</h2><p>先审核事实与边界；确认启用后，才可进入 A / B / C 运行与评分。</p></div><div className="evaluationHeaderActions"><button type="button" onClick={() => void onSeedCutoffCases()}>生成断点评测题库</button><button type="button" onClick={() => setShowCreateForm((value) => !value)}>{showCreateForm ? "收起新建" : "新建测试"}</button><strong>{data.cases.length} 条候选题</strong></div></header>
    <p className="evaluationSeedNote">新题库以评测快照最后保留章节为知识截止点，不会改写历史题库或既有评测结果。</p>
    <details className="evaluationSnapshotCreator"><summary>评测数据快照（开发者）</summary><div><p>复制当前作品的前若干章节作为未完本测试样本；不会修改原作品，快照不会携带原书的索引、解析或人物资料。</p><label><span>保留前</span><input type="number" min="1" max={data.chapters?.length ?? 1} value={snapshotChapterCount} onChange={(event) => setSnapshotChapterCount(Math.max(1, Math.min(data.chapters?.length ?? 1, Number(event.target.value) || 1)))} /><span>章 / 共 {data.chapters?.length ?? 0} 章</span></label><button type="button" disabled={creatingSnapshot || !(data.chapters?.length)} onClick={() => { if (window.confirm(`创建仅保留前 ${snapshotChapterCount} 章的评测快照吗？原作品不会被修改。`)) void onCreateSnapshot({ chapterCount: snapshotChapterCount }); }}>{creatingSnapshot ? "正在创建…" : "创建评测快照"}</button></div></details>
    {data.evaluationSnapshot ? <details className="evaluationSnapshotCreator"><summary>评测快照解析（开发者）</summary><div><p>只读取本快照的前 {data.evaluationSnapshot.retainedChapterCount} 章；只有会影响续写一致性的高价值事实才需要人工确认。</p><p>状态：{data.evaluationSnapshot.analysis.status} · 人物目录 {data.evaluationSnapshot.analysis.directory.length} 人 · 待确认约束 {data.evaluationSnapshot.analysis.candidates.length} 条 · 已收录目录 {directoryOnlyCount} 人</p>{data.snapshotAnalysisProgress ? <p className="snapshotAnalysisProgress" aria-live="polite"><span>轻量解析进度：{data.snapshotAnalysisProgress.completedBatchCount} / {data.snapshotAnalysisProgress.totalBatchCount} 批（{data.snapshotAnalysisProgress.percent}%）· 剩余 {data.snapshotAnalysisProgress.pendingBatchCount} 批</span><progress max={data.snapshotAnalysisProgress.totalBatchCount || 1} value={data.snapshotAnalysisProgress.completedBatchCount} /></p> : null}{snapshotFailedBatches.length ? <p className="snapshotAnalysisFailures">解析失败批次（恢复中）：{snapshotFailedBatches.length} 项 · {snapshotFailedBatches.map((item) => { const recovery = snapshotRecoveryByParent.get(item.batchId); const complete = recovery?.children.filter((child) => child.status === "completed").length; return `${item.batchId}（${item.kind ?? "unknown"}${recovery ? `，紧凑子批 ${complete}/${recovery.children.length}` : ""}：${item.error}）`; }).join("；")}</p> : null}<div className="evaluationSnapshotActions"><button disabled={snapshotAnalysisBusy} onClick={() => void onStartSnapshotAnalysis()} type="button">开始轻量解析</button><button disabled={snapshotAnalysisBusy || !snapshotFailedBatches.length} onClick={() => void onRetryFailedSnapshotAnalysis()} type="button">重试失败批次</button><button disabled={snapshotAnalysisBusy} onClick={() => void onRunRecentSnapshotAnalysis()} type="button">近期深解析</button><button disabled={snapshotAnalysisBusy} onClick={() => void onBuildSnapshotCandidates()} type="button">生成候选</button></div>{(["main", "important"] as const).map((importance) => { const packages = candidatePackagesByImportance.get(importance)!; if (!packages.size) return null; const heading = importance === "main" ? "主要候选约束包" : "重要候选约束包"; return <section className="snapshotCandidateSection" key={importance}><h4>{heading} · {packages.size} 项</h4><div className="snapshotCandidateGrid">{[...packages].map(([title, items]) => <article key={title}><strong>{title} · 约束包</strong><button disabled={snapshotAnalysisBusy || !items.some((item) => item.status === "pending")} onClick={() => void onReviewSnapshotCandidate({ title, action: "lockPackage" })} type="button">整包确认并锁定</button>{items.map((candidate) => <section key={candidate.id}><label><span>{candidate.kind === "identity" ? "身份与别名" : candidate.kind === "relationship" ? "核心关系" : candidate.kind === "abilityLimit" ? "能力与限制" : candidate.kind === "secretConflict" ? "秘密与冲突" : candidate.kind === "recentState" ? "近期状态" : candidate.kind === "clue" ? "关键线索" : "明确目标"}</span><textarea value={editedConstraintValues[candidate.id] ?? candidate.value} onChange={(event) => setEditedConstraintValues((values) => ({ ...values, [candidate.id]: event.target.value }))} disabled={candidate.status !== "pending"} /></label><small>证据：{candidate.evidence.map((item) => `第 ${item.chapterIndex} 章`).join("、")}</small><div><button disabled={snapshotAnalysisBusy || candidate.status !== "pending"} onClick={() => void onReviewSnapshotCandidate({ candidateId: candidate.id, value: editedConstraintValues[candidate.id] ?? candidate.value, action: "lock" })} type="button">修改后确认锁定</button><button disabled={snapshotAnalysisBusy || candidate.status !== "pending"} onClick={() => void onReviewSnapshotCandidate({ candidateId: candidate.id, action: "reference" })} type="button">仅保留参考</button><button disabled={snapshotAnalysisBusy || candidate.status !== "pending"} onClick={() => void onReviewSnapshotCandidate({ candidateId: candidate.id, action: "ignore" })} type="button">忽略</button></div></section>)}</article>)}</div></section>; })}</div></details> : null}
    {historicalRuns.length ? <details className="evaluationSnapshotCreator"><summary>历史诊断记录（开发者）</summary><div><p>已保留 {historicalRuns.length} 次 V1 诊断运行，仅用于说明评测口径如何改进，不参与当前 A / B / C 对比。</p>{historicalRuns.map((run) => <p key={run.id}>{run.diagnostic_summary?.reason ?? "旧版诊断结果已归档。"}</p>)}</div></details> : null}
    <section className="evaluationRunPanel">
      <div><span className="eyebrow">真实 LLM 评测</span><h3>冒烟集 A / B / C 对照</h3><p>仅执行当前作品已确认的 {enabledSmokeCases.length} 条冒烟题，服务端会在启动前重新校验作品、题目与预算。</p></div>
      <div className="evaluationRunMetrics"><span>预计变体 {estimatedVariantCount} 个</span><span>单轮预计成本 {formatCny(estimatedSmokeCost)}</span><button disabled={!enabledSmokeCases.length || runningSmoke} onClick={() => void onStartSmokeRun()} type="button">{runningSmoke ? "正在运行…" : "运行冒烟集"}</button></div>
       <div className="evaluationRunMetrics"><strong>多轮独立运行</strong><label><span>轮数</span><input type="number" min="1" max="20" value={multiRoundCount} disabled={runningSmoke} onChange={(event) => setMultiRoundCount(Math.max(1, Math.min(20, Number(event.target.value) || 1)))} /></label><span>预计变体 {estimatedVariantCount * multiRoundCount} 个</span><span>预计成本 {formatCny(estimatedSmokeCost * multiRoundCount)}</span><button disabled={!enabledSmokeCases.length || runningSmoke} onClick={() => void onStartMultiRun({ roundCount: multiRoundCount })} type="button">{runningSmoke ? "正在运行…" : "运行多轮冒烟集"}</button></div>
       <div className="evaluationRunMetrics"><strong>按题目设置次数</strong><span>共 {selectiveRunCount} 次题目运行 · 预计变体 {selectiveVariantCount} 个</span><span>预计成本 {formatCny(estimatedSelectiveSmokeCost)}</span><button disabled={!enabledSmokeCases.length || runningSmoke} onClick={() => void onStartSelectiveMultiRun({ caseRunCounts: Object.fromEntries(enabledSmokeCases.map((item) => [item.id, Math.max(1, Math.min(20, caseRunCounts[item.id] ?? 1))])) })} type="button">{runningSmoke ? "正在运行…" : "按题目设置次数运行"}</button></div>
      {latestRun ? <div className="evaluationRunProgress"><strong>评测进度 {completedVariantCount + failedVariants.length}/{latestVariants.length || estimatedVariantCount}</strong><span>状态：{activeMultiRun ? `${activeRuns.length}/${activeMultiRun.roundCount} 轮` : latestRun.status}</span><span>预计成本 {formatCny(activeRuns.reduce((sum, item) => sum + Number(item.estimated_cost_cny ?? 0), 0))}</span><span>实际成本 {formatCny(activeRuns.reduce((sum, item) => sum + Number(item.consumed_cost_cny ?? 0), 0))}</span>{failedVariants.length || latestVariants.some((item) => item.payload?.judgeResult?.status === "invalid") ? activeRuns.map((run) => <button key={run.id} disabled={runningSmoke} onClick={() => void onRetryFailedVariants({ runId: run.id })} type="button">重试失败/无效项（第 {run.config?.multiRun?.roundIndex ?? 1} 轮）</button>) : null}</div> : null}
    </section>
    {activeRuns.some((run) => run.comparability === "incomplete") ? <p className="evaluationResultError">结果不完整：本次运行存在失败或无效 Judge 输出，不能作为 A / B / C 横向结论。</p> : null}
    {activeMultiRun ? <section className="evaluationComparison"><header><div><span className="eyebrow">多轮统计</span><h3>{activeMultiRun.roundCount} 轮独立运行汇总</h3><p>每轮独立创建 A / B / C 变体，统计所有轮次的完成情况与正常续写质量波动。</p></div></header><div className="evaluationComparisonTable"><table><thead><tr><th>指标</th>{(["A", "B", "C"] as const).map((variant) => <th key={variant}>方案 {variant}</th>)}</tr></thead><tbody>{[
      ["成功率", (value: typeof multiRunSummary.A) => formatMetric(value.successRate, (rate) => `${rate.toFixed(1)}%`)],
      ["失败率", (value: typeof multiRunSummary.A) => formatMetric(value.failureRate, (rate) => `${rate.toFixed(1)}%`)],
       ["正向生成质量均值 ± 标准差", (value: typeof multiRunSummary.A) => value.positiveQualityScore.value === null ? "—" : `${value.positiveQualityScore.value.toFixed(1)} ± ${value.positiveQualityScore.standardDeviation?.toFixed(1) ?? "—"} / 100（n=${value.positiveQualityScore.sampleSize}）`],
       ["最终净质量均值 ± 标准差", (value: typeof multiRunSummary.A) => value.netQualityScore.value === null ? "—" : `${value.netQualityScore.value.toFixed(1)} ± ${value.netQualityScore.standardDeviation?.toFixed(1) ?? "—"} / 100（n=${value.netQualityScore.sampleSize}）`],
       ["相对 A 的最终净质量差值", (value: typeof multiRunSummary.A, variant: "A" | "B" | "C") => value.netQualityScore.value === null || multiRunSummary.A.netQualityScore.value === null ? "—" : `${(value.netQualityScore.value - multiRunSummary.A.netQualityScore.value).toFixed(1)} 分`],
    ].map(([label, render]) => <tr key={label as string}><th><MetricLabel label={label as string} /></th>{(["A", "B", "C"] as const).map((variant) => <td key={variant}>{(render as (value: typeof multiRunSummary.A, variant: "A" | "B" | "C") => string)(multiRunSummary[variant], variant)}</td>)}</tr>)}</tbody></table></div></section> : null}
    {comparisonReady ? <section className="evaluationComparison"><header><div><span className="eyebrow">运行汇总</span><h3>本次 A / B / C 对照</h3><p>只比较同为受约束续写的有效 V2 生成变体；评分项显示有效样本数。成本按各方案的实际提示与输出长度估算。</p></div></header><div className="evaluationComparisonTable"><table><thead><tr><th>指标</th>{(["A", "B", "C"] as const).map((variant) => <th key={variant}>方案 {variant}</th>)}</tr></thead><tbody>{[
       ["平均断点承接分（仅正常续写）", (value: typeof comparison.A) => formatMetric(value.cutoffContinuity, (score) => `${score.toFixed(2)} / 5`)],
       ["平均事实遵循分（仅正常续写）", (value: typeof comparison.A) => formatMetric(value.factFollowing, (score) => `${score.toFixed(2)} / 5`)],
       ["平均人物一致性分（仅正常续写）", (value: typeof comparison.A) => formatMetric(value.characterConsistency, (score) => `${score.toFixed(2)} / 5`)],
       ["平均剧情连贯分（仅正常续写）", (value: typeof comparison.A) => formatMetric(value.plotContinuity, (score) => `${score.toFixed(2)} / 5`)],
       ["平均剧情推进分（仅正常续写）", (value: typeof comparison.A) => formatMetric(value.narrativeAdvancement, (score) => `${score.toFixed(2)} / 5`)],
       ["平均文风可读性分（仅正常续写）", (value: typeof comparison.A) => formatMetric(value.styleFit, (score) => `${score.toFixed(2)} / 5`)],
       ["RAG 专项质量（证据使用与转化，100分）", (value: typeof comparison.A) => formatMetric(value.ragQualityScore, (score) => `${score.toFixed(1)} / 100`)],
       ["约束专项质量（边界与一致性，100分）", (value: typeof comparison.A) => formatMetric(value.constraintQualityScore, (score) => `${score.toFixed(1)} / 100`)],
       ["开放创作专项质量（推进与张力，100分）", (value: typeof comparison.A) => formatMetric(value.creativeQualityScore, (score) => `${score.toFixed(1)} / 100`)],
       ["风险扣分（仅正常续写）", (value: typeof comparison.A) => formatMetric(value.riskPenalty, (score) => `${score.toFixed(1)} 分`)],
       ["最终净质量（仅正常续写）", (value: typeof comparison.A) => formatMetric(value.netQualityScore, (score) => `${score.toFixed(1)} / 100`)],
       ["核心证据合理使用（仅正常续写）", (value: typeof comparison.A) => formatMetric(value.coreEvidenceUse, (score) => `${score.toFixed(2)} / 5`)],
       ["合理扩写评分（仅正常续写）", (value: typeof comparison.A) => formatMetric(value.creativePlausibility, (score) => `${score.toFixed(2)} / 5`)],
       ["场景张力（仅正常续写）", (value: typeof comparison.A) => formatMetric(value.sceneDramaticTension, (score) => `${score.toFixed(2)} / 5`)],
       ["人物主动性（仅正常续写）", (value: typeof comparison.A) => formatMetric(value.characterAgency, (score) => `${score.toFixed(2)} / 5`)],
       ["可控开脑洞（仅正常续写）", (value: typeof comparison.A) => formatMetric(value.creativeControl, (score) => `${score.toFixed(2)} / 5`)],
       ["证据转化（仅正常续写）", (value: typeof comparison.A) => formatMetric(value.evidenceTransformation, (score) => `${score.toFixed(2)} / 5`)],
       ["平均约束遵循分（仅正常续写）", (value: typeof comparison.A) => formatMetric(value.constraintCompliance, (score) => `${score.toFixed(2)} / 5`)],
      ["安全处理成功率（无答案/反例）", (value: typeof comparison.A) => formatMetric(value.safetyTaskSuccessRate, (rate) => `${rate.toFixed(1)}%`)],
      ["严重冲突率", (value: typeof comparison.A) => formatMetric(value.severeConflictRate, (rate) => `${rate.toFixed(1)}%`)],
      ["无依据断言率", (value: typeof comparison.A) => formatMetric(value.unsupportedClaimRate, (rate) => `${rate.toFixed(1)}%`)],
      ["人工复核率", (value: typeof comparison.A) => formatMetric(value.humanReviewRate, (rate) => `${rate.toFixed(1)}%`)],
      ["未来信息泄漏", (value: typeof comparison.A) => formatMetric(value.futureInformationLeakage, (rate) => `${rate.toFixed(1)}%`)],
      ["平均耗时", (value: typeof comparison.A) => formatMetric(value.averageElapsedMs, (milliseconds) => `${(milliseconds / 1000).toFixed(1)} 秒`)],
      ["平均估算成本", (value: typeof comparison.A) => formatMetric(value.averageEstimatedCostCny, (cost) => `¥${cost.toFixed(3)}`)],
     ].map(([label, render]) => <tr key={label as string}><th><MetricLabel label={label as string} /></th>{(["A", "B", "C"] as const).map((variant) => <td key={variant}>{(render as (value: typeof comparison.A) => string)(comparison[variant])}</td>)}</tr>)}</tbody></table></div><p className="evaluationComparisonNote">不同题型使用不同权重：RAG 侧重核心证据使用与转化；约束题侧重边界与一致性；开放创作侧重剧情推进、场景张力与人物主动性。三类题都保留严重冲突、无依据断言和未来信息泄漏等共同安全指标。</p></section> : null}
     {latestVariants.length ? <section className="evaluationResults"><h3>本次结果</h3>{latestVariants.map((item) => <details className="evaluationResultCard" key={item.id} onContextMenu={(event) => { event.preventDefault(); const variantLabel = item.variant === "retrieval" ? "检索" : `方案 ${item.variant}`; setRerunMenu({ runId: item.run_id, caseId: item.case_id, variantId: item.id, variantLabel, title: item.case_payload?.title ?? item.case_id, x: event.clientX, y: event.clientY, disabled: Boolean(runningSmoke || latestVariants.some((candidate) => candidate.run_id === item.run_id && ["pending", "running"].includes(candidate.status))) }); }}><summary><strong>{item.variant === "retrieval" ? "检索" : `方案 ${item.variant}`}</strong><span>{item.case_payload?.title ?? item.case_id}</span><small>{item.status}</small></summary><div><p><b>规则模式：</b>{item.payload?.ruleResult?.mode ?? "待执行"} · 硬约束 {item.payload?.hardConstraintCount ?? 0} 条 · 截止点拦截约束 {item.payload?.futureConstraintBlockedCount ?? 0} 条 · 耗时 {item.payload?.elapsedMs ? `${(item.payload.elapsedMs / 1000).toFixed(1)} 秒` : "—"}</p>{item.payload?.hardConstraintFallbackToRag ? <p>未选到高相关硬约束，已按方案 B 执行。</p> : null}{item.payload?.selectedConstraints?.length ? <details><summary>本次使用的硬约束（过滤 {item.payload.filteredConstraintCount ?? 0} 条）</summary><ol>{item.payload.selectedConstraints.map((constraint) => <li key={constraint.id}><strong>{constraint.priority.toUpperCase()}</strong> · {constraint.text}<small>；{constraint.reason}{constraint.evidenceChapterIndexes.length ? `；证据第 ${constraint.evidenceChapterIndexes.join("、")} 章` : ""}</small></li>)}</ol></details> : null}{item.payload?.error ? <p className="evaluationResultError">失败原因：{item.payload.error}</p> : null}{item.payload?.retrievalEvidence?.length ? <details><summary>检索证据</summary><ol>{item.payload.retrievalEvidence.map((evidence, index) => <li key={`${item.id}-${index}`}>第 {evidence.chapterIndex} 章《{evidence.chapterTitle}》 · 相似度 {(evidence.score * 100).toFixed(1)}%<p>{evidence.preview}</p></li>)}</ol></details> : null}{item.payload?.text ? <details><summary>生成文本</summary><p className="evaluationGeneratedText">{item.payload.text}</p></details> : null}{item.payload?.judgeResult ? <details><summary>独立评分</summary><pre>{JSON.stringify(item.payload.judgeResult, null, 2)}</pre></details> : null}{item.payload?.judgeResult?.status === "invalid" && item.payload.judgeDiagnostic ? <details className="evaluationJudgeDiagnostic"><summary>评分诊断（已尝试 Judge 格式修复 {item.payload.judgeRetryCount ?? 0} 次）</summary><p>{item.payload.judgeDiagnostic.reason ?? "Judge 输出无法按协议解析。"}</p><pre>{item.payload.judgeDiagnostic.repairedOutputPreview ?? item.payload.judgeDiagnostic.initialOutputPreview ?? "无可用输出摘要"}</pre></details> : null}</div></details>)}</section> : null}
     {rerunMenu ? <div className="evaluationRerunMenu" role="menu" style={{ left: rerunMenu.x, top: rerunMenu.y }}><strong>{rerunMenu.title}</strong><button type="button" disabled={rerunMenu.disabled} onClick={() => { const target = rerunMenu; setRerunMenu(null); void onRerunVariant({ runId: target.runId, variantId: target.variantId }); }}>重跑此项（{rerunMenu.variantLabel}）</button><button type="button" disabled={rerunMenu.disabled} onClick={() => { const target = rerunMenu; setRerunMenu(null); void onRerunCase({ runId: target.runId, caseId: target.caseId }); }}>重跑整组（A/B/C）</button>{rerunMenu.disabled ? <small>本轮仍在执行，完成后才能覆盖重跑。</small> : null}<button type="button" onClick={() => setRerunMenu(null)}>取消</button></div> : null}
    {showCreateForm ? <form className="evaluationCreateForm" onSubmit={create}>
      <h3>新建测试</h3>
      <label><span>题目标题</span><input name="title" required placeholder="例如：检索某个关键人物首次出现的原文证据" /></label>
      <div className="evaluationFormGrid"><label><span>题目类型</span><select name="type" defaultValue="retrieval"><option value="retrieval">检索</option><option value="continuation">受约束续写</option><option value="adversarial">高风险反例</option><option value="unanswerable">无答案</option></select></label><label><span>风险级别</span><select name="riskLevel" defaultValue="normal"><option value="normal">常规</option><option value="high">高风险</option></select></label><label><span>章节锚点</span><input name="chapterId" required list="evaluation-chapter-options" placeholder="选择或输入章节" /><datalist id="evaluation-chapter-options">{(data.chapters ?? []).map((chapter) => <option key={chapter.id} value={chapter.id}>{`第 ${chapter.chapter_index} 章 · ${chapter.title}`}</option>)}</datalist></label></div>
      <label><span>必要事实（每行一条）</span><textarea name="requiredFacts" required /></label>
      <label><span>禁止事实（每行一条）</span><textarea name="forbiddenFacts" required /></label>
      <div className="evaluationCreateActions"><label className="evaluationCheckbox"><input name="includeInSmoke" type="checkbox" /> 同时加入冒烟集</label><button disabled={creatingCase} type="submit">{creatingCase ? "正在创建…" : "创建待确认题目"}</button></div>
    </form> : null}
    <div className="evaluationSuiteGrid">
      {sortEvaluationSuites(data.suites).map((suite) => {
        const cases = membersBySuite.get(suite.id) ?? [];
        const pendingCount = cases.filter((item) => !isEvaluationCaseConfirmed(item)).length;
        return <section className="evaluationSuiteCard" key={suite.id}>
          <header><div><span>{suite.scope === "smoke" ? "冒烟集 · 日常验证" : "完整集 · 版本验收"}</span><h3>{suite.name}</h3></div><div className="evaluationSuiteActions"><strong>{cases.length} 条</strong><button disabled={!pendingCount || savingSuiteId === suite.id} type="button" onClick={() => onConfirmSuite({ suiteId: suite.id })}>{savingSuiteId === suite.id ? "正在确认…" : `确认本集 ${pendingCount} 条待确认`}</button></div></header>
          <p>{suite.scope === "smoke" ? `从完整集中引用 ${cases.length} 条，用于低成本验证。` : "覆盖断点续写、RAG、约束与开放创作题。"}</p>
          <div className="evaluationCaseList">
            {cases.map((item) => {
              const candidate = item.payload;
              const confirmed = isEvaluationCaseConfirmed(item);
              const save = async (event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                const form = event.currentTarget;
                if (confirmed) {
                  await onUnconfirmCase({ caseId: item.id });
                } else {
                  await onConfirmCase({ caseId: item.id, requiredFacts: factsFrom(form, "requiredFacts"), forbiddenFacts: factsFrom(form, "forbiddenFacts") });
                }
              };
               return <details className="evaluationCaseCard" key={`${suite.id}-${item.id}`}>
                 <summary><span className={confirmed ? "evaluationCaseStatus confirmed" : "evaluationCaseStatus"}>{confirmed ? "已确认" : "待人工确认"}</span><strong>{candidate.title}</strong><small>{labelForFocus(candidate.evaluationFocus)} · {labelForType(candidate.type)} · {candidate.riskLevel === "high" ? "高风险" : "常规"}</small>{suite.scope === "smoke" && confirmed ? <label className="evaluationCaseRunCount" title="仅影响“按题目设置次数运行”" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}><span>测试次数</span><input aria-label={`${candidate.title} 的测试次数`} type="number" min="1" max="20" value={caseRunCounts[item.id] ?? 1} disabled={runningSmoke} onChange={(event) => setCaseRunCounts((counts) => ({ ...counts, [item.id]: Math.max(1, Math.min(20, Number(event.target.value) || 1)) }))} /></label> : null}</summary>
                 <form className="evaluationCaseDetail" onSubmit={save}>
                  <h4>编辑题目事实</h4>
                  <label><span>必要事实</span><textarea defaultValue={candidate.requiredFacts.join("\n")} name="requiredFacts" required /></label>
                  <label><span>禁止事实</span><textarea defaultValue={candidate.forbiddenFacts.join("\n")} name="forbiddenFacts" required /></label>
                  <div className="evaluationCaseActions"><small>{confirmed ? "撤销后题目会回到待确认，且不会参与后续评测。" : "每行一条事实。确认后会写入数据库，并允许后续评测运行。"}</small><div><button disabled={savingCaseId === item.id} type="submit">{savingCaseId === item.id ? "正在保存…" : confirmed ? "撤销确认" : "确认并启用题目"}</button><button className="evaluationDeleteButton" disabled={deletingCaseId === item.id} onClick={() => { if (window.confirm(`确认删除「${candidate.title}」？题目会从全部所属集合移除。`)) void onDeleteCase({ caseId: item.id }); }} type="button" title="删除题目" aria-label="删除题目">{deletingCaseId === item.id ? "删除中…" : "🗑"}</button></div></div>
                </form>
              </details>;
            })}
          </div>
        </section>;
      })}
    </div>
  </section>;
}
