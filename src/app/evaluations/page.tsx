"use client";

import { useEffect, useRef, useState } from "react";
import { EvaluationCenter, type EvaluationCenterData } from "./evaluation-center";

type CreateCaseInput = { title: string; type: "retrieval" | "continuation" | "adversarial" | "unanswerable"; riskLevel: "normal" | "high"; chapterId: string; requiredFacts: string[]; forbiddenFacts: string[]; includeInSmoke: boolean };

export default function EvaluationsPage() {
  const [data, setData] = useState<EvaluationCenterData | null>(null);
  const [message, setMessage] = useState("正在读取评测数据…");
  const [notice, setNotice] = useState("");
  const [savingCaseId, setSavingCaseId] = useState<string>();
  const [savingSuiteId, setSavingSuiteId] = useState<string>();
  const [creatingCase, setCreatingCase] = useState(false);
  const [deletingCaseId, setDeletingCaseId] = useState<string>();
  const [runningSmoke, setRunningSmoke] = useState(false);
  const [creatingSnapshot, setCreatingSnapshot] = useState(false);
  const [snapshotAnalysisBusy, setSnapshotAnalysisBusy] = useState(false);
  const autoResumedRunGroups = useRef(new Set<string>());
  const projectId = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("projectId") ?? "";
  const load = () => fetch(`/api/projects/${encodeURIComponent(projectId)}/evaluations`)
    .then((response) => response.ok ? response.json() : Promise.reject())
    .then((value) => { setData(value); setMessage(""); });
  useEffect(() => {
    if (!projectId) { setMessage("请从作品的数据一览进入功能评测。"); return; }
    load()
      .catch(() => setMessage("评测数据暂不可用。请先执行数据库迁移。"));
  }, [projectId]);
  const confirmCase = async (input: { caseId: string; requiredFacts: string[]; forbiddenFacts: string[] }) => {
    setSavingCaseId(input.caseId);
    setMessage("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/evaluations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "confirmCase", ...input }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "题目确认失败，请稍后重试。");
      await load();
      setNotice("题目已确认并启用，可进入后续评测运行。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "题目确认失败，请稍后重试。");
    } finally {
      setSavingCaseId(undefined);
    }
  };
  const unconfirmCase = async ({ caseId }: { caseId: string }) => {
    setSavingCaseId(caseId);
    setMessage("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/evaluations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "unconfirmCase", caseId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "撤销确认失败，请稍后重试。");
      await load();
      setNotice("题目已撤销确认，已回到待确认状态，不会参与后续评测。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "撤销确认失败，请稍后重试。");
    } finally {
      setSavingCaseId(undefined);
    }
  };
  const post = async (action: string, payload: Record<string, unknown>) => {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/evaluations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...payload }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "操作失败，请稍后重试。");
    return result;
  };
  const confirmSuite = async ({ suiteId }: { suiteId: string }) => {
    setSavingSuiteId(suiteId); setMessage("");
    try {
      const result = await post("confirmSuiteCases", { suiteId });
      await load();
      setNotice(`本集已确认并启用 ${result.confirmedCount ?? 0} 条题目。`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "批量确认失败，请稍后重试。"); } finally { setSavingSuiteId(undefined); }
  };
  const createCase = async (input: CreateCaseInput) => {
    setCreatingCase(true); setMessage("");
    try {
      await post("createCase", input);
      await load();
      setNotice("已新建待确认题目；确认事实后即可纳入评测。 ");
      return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : "新建题目失败，请稍后重试。"); return false; } finally { setCreatingCase(false); }
  };
  const deleteCase = async ({ caseId }: { caseId: string }) => {
    setDeletingCaseId(caseId); setMessage("");
    try {
      await post("deleteCase", { caseId });
      await load();
      setNotice("题目已删除，并已从所属评测集合移除。 ");
    } catch (error) { setMessage(error instanceof Error ? error.message : "删除题目失败，请稍后重试。"); } finally { setDeletingCaseId(undefined); }
  };
  const seedCutoffCases = async () => {
    setMessage("");
    try {
      const result = await post("seed", {}) as { fullCases?: number; smokeCases?: number };
      await load();
      setNotice(`已生成断点评测题库：完整集 ${result.fullCases ?? 0} 条，冒烟集 ${result.smokeCases ?? 0} 条。请先核对并确认题目事实。`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "断点评测题库生成失败，请稍后重试。"); }
  };
  const createSnapshot = async ({ chapterCount }: { chapterCount: number }) => {
    setCreatingSnapshot(true); setMessage(""); setNotice("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/snapshot`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chapterCount }) });
      const result = await response.json() as { project?: { id?: string }; error?: string };
      if (!response.ok) throw new Error(result.error ?? "评测快照创建失败。");
      const snapshotId = result.project?.id;
      if (!snapshotId) throw new Error("评测快照创建失败。");
      window.location.href = `/evaluations?projectId=${encodeURIComponent(snapshotId)}`;
    } catch (error) { setMessage(error instanceof Error ? error.message : "评测快照创建失败。"); } finally { setCreatingSnapshot(false); }
  };
  const runSnapshotRequest = async (path: string, body?: Record<string, unknown>) => {
    setSnapshotAnalysisBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/snapshot-analysis${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? { action: "start" }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "评测快照解析失败。");
      await load();
      setNotice("评测快照解析状态已更新，只作用于当前快照。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "评测快照解析失败。"); } finally { setSnapshotAnalysisBusy(false); }
  };
  const startSnapshotAnalysis = async (retryFailedOnly = false) => {
    setSnapshotAnalysisBusy(true); setMessage("");
    try {
      let response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/snapshot-analysis`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: retryFailedOnly ? "retryFailed" : "start" }) });
      let result = await response.json() as { error?: string; nextBatch?: { id?: string } | null; pendingBatches?: Array<{ id?: string }> };
      if (!response.ok) throw new Error(result.error ?? "评测快照解析启动失败。");
      const pending = (result.pendingBatches ?? []).flatMap((batch) => batch.id ? [batch.id] : []);
      let failedCount = 0;
       for (const [batchIndex, batchId] of pending.entries()) {
         setNotice(`正在轻量解析第 ${batchIndex + 1}/${pending.length} 个待处理批次…`);
         response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/snapshot-analysis`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "runBatch", batchId }) });
         result = await response.json() as { error?: string; pendingBatches?: Array<{ id?: string }> };
         if (!response.ok) {
           failedCount += 1;
           for (const recoveryId of (result.pendingBatches ?? []).flatMap((batch) => batch.id ? [batch.id] : [])) {
             if (!pending.includes(recoveryId)) pending.push(recoveryId);
           }
           setNotice(`第 ${batchIndex + 1}/${pending.length} 批失败，已记录并继续后续批次。`);
           await load();
           continue;
         }
         await load();
       }
      await load();
      setNotice(failedCount ? `轻量解析已处理 ${pending.length} 批，其中 ${failedCount} 批失败；可使用“重试失败批次”。` : "人物目录解析完成；下一步可执行近期深解析和生成候选。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "评测快照解析失败。"); } finally { setSnapshotAnalysisBusy(false); }
  };
  const executeRun = async (runId: string) => {
    setRunningSmoke(true);
    try {
      for (let index = 0; index < 100; index += 1) {
        const result = await post("executeNextVariant", { runId }) as { done?: boolean; status?: string };
        await load();
        if (result.done) break;
        if (result.status === "failed") setNotice("有个别变体执行失败；其余题目会继续，完成后可单独重试失败项。");
      }
      setNotice((current) => current || "冒烟集运行结束，可展开查看 A / B / C 结果与评分。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "冒烟集执行失败，请稍后重试。");
    } finally {
      setRunningSmoke(false);
      await load().catch(() => undefined);
    }
  };
  const startSmokeRun = async () => {
    if (!window.confirm("确认启动当前作品的冒烟集评测吗？系统会真实调用 Writer、Embedding 与 Judge。")) return;
    setMessage("");
    setNotice("");
    try {
      const result = await post("createRun", { estimatedCny: 0, softBudgetConfirmed: true }) as { id?: string; estimatedCny?: number };
      if (!result.id) throw new Error("评测任务创建失败。");
      setNotice(`已创建冒烟评测任务，预计成本 ¥${Number(result.estimatedCny ?? 0).toFixed(2)}，正在顺序执行。`);
      await load();
      await executeRun(result.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "冒烟集启动失败，请稍后重试。");
    }
  };
  const startMultiRun = async ({ roundCount }: { roundCount: number }) => {
    if (!Number.isInteger(roundCount) || roundCount < 1 || roundCount > 20) {
      setMessage("多轮测试次数必须是 1–20 的整数。");
      return;
    }
    if (!window.confirm(`确认连续独立运行冒烟集 ${roundCount} 轮吗？每轮都会真实调用 Writer、Embedding 与 Judge，预算将按单轮预估乘以轮数计算。`)) return;
    setMessage("");
    setNotice("");
    setRunningSmoke(true);
    try {
      const result = await post("createMultiRun", { roundCount, softBudgetConfirmed: true }) as { runs?: Array<{ id?: string; roundIndex?: number }>; estimatedCny?: number };
      const runIds = (result.runs ?? []).flatMap((run) => run.id ? [run.id] : []);
      if (runIds.length !== roundCount) throw new Error("多轮评测任务创建不完整。");
      setNotice(`已创建 ${roundCount} 轮独立评测任务，预计总成本 ¥${Number(result.estimatedCny ?? 0).toFixed(2)}，将按轮次顺序执行。`);
      for (let roundIndex = 0; roundIndex < runIds.length; roundIndex += 1) {
        setNotice(`正在执行第 ${roundIndex + 1}/${runIds.length} 轮独立评测…`);
        for (let index = 0; index < 100; index += 1) {
          const next = await post("executeNextVariant", { runId: runIds[roundIndex] }) as { done?: boolean; status?: string };
          await load();
          if (next.done) break;
        }
      }
      setNotice(`${roundCount} 轮独立评测运行结束，可查看均值、标准差、成功率与 A/B/C 差值。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "多轮冒烟集执行失败，请稍后重试。");
    } finally {
      setRunningSmoke(false);
      await load().catch(() => undefined);
    }
  };
  const startSelectiveMultiRun = async ({ caseRunCounts }: { caseRunCounts: Record<string, number> }) => {
    const entries = Object.entries(caseRunCounts);
    if (!entries.length || entries.some(([, count]) => !Number.isInteger(count) || count < 1 || count > 20)) {
      setMessage("每题测试次数必须是 1–20 的整数。");
      return;
    }
    const totalCaseRuns = entries.reduce((sum, [, count]) => sum + count, 0);
    if (!window.confirm(`确认按题目次数运行冒烟集吗？共 ${totalCaseRuns} 次题目运行，将真实调用 Writer、Embedding 与 Judge。`)) return;
    setMessage("");
    setNotice("");
    setRunningSmoke(true);
    try {
      const result = await post("createSelectiveMultiRun", { caseRunCounts, softBudgetConfirmed: true }) as { runs?: Array<{ id?: string }>; estimatedCny?: number };
      const runIds = (result.runs ?? []).flatMap((run) => run.id ? [run.id] : []);
      if (!runIds.length) throw new Error("按题目次数创建评测任务失败。");
      setNotice(`已创建 ${runIds.length} 轮按题目次数评测，预计总成本 ¥${Number(result.estimatedCny ?? 0).toFixed(2)}，将按轮次顺序执行。`);
      for (let roundIndex = 0; roundIndex < runIds.length; roundIndex += 1) {
        setNotice(`正在执行第 ${roundIndex + 1}/${runIds.length} 轮按题目次数评测…`);
        for (let index = 0; index < 100; index += 1) {
          const next = await post("executeNextVariant", { runId: runIds[roundIndex] }) as { done?: boolean };
          await load();
          if (next.done) break;
        }
      }
      setNotice("按题目次数的冒烟集运行结束，可按每题实际样本数查看汇总结果。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "按题目次数运行失败，请稍后重试。");
    } finally {
      setRunningSmoke(false);
      await load().catch(() => undefined);
    }
  };
  const retryFailedVariants = async ({ runId }: { runId: string }) => {
    setMessage("");
    try {
      await post("retryFailedVariants", { runId });
      setNotice("失败变体已重新排队，正在继续执行。");
      await load();
      await executeRun(runId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "失败项重试失败，请稍后重试。");
    }
  };
  const rerunCase = async ({ runId, caseId }: { runId: string; caseId: string }) => {
    setMessage("");
    try {
      await post("rerunCase", { runId, caseId });
      setNotice("已覆盖本轮该题原有 A / B / C 结果，正在重新执行。");
      await load();
      await executeRun(runId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "本题重跑失败，请稍后重试。");
    }
  };
  const rerunVariant = async ({ runId, variantId }: { runId: string; variantId: string }) => {
    setMessage("");
    try {
      await post("rerunVariant", { runId, variantId });
      setNotice("已覆盖本轮该测试项原有结果，正在重新执行。");
      await load();
      await executeRun(runId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "此项重跑失败，请稍后重试。");
    }
  };
  useEffect(() => {
    if (!data || runningSmoke) return;
    const running = data.runs.find((run) => run.evaluation_protocol === "v2-cutoff-aware" && run.status === "running");
    const resumable = running ?? data.runs.find((run) => run.evaluation_protocol === "v2-cutoff-aware" && run.status === "ready");
    if (!resumable) return;
    const groupId = resumable.config?.multiRun?.groupId;
    const key = groupId ?? resumable.id;
    if (autoResumedRunGroups.current.has(key)) return;
    const runs = groupId
      ? data.runs.filter((run) => run.config?.multiRun?.groupId === groupId && (run.status === "ready" || run.status === "running")).sort((left, right) => (left.config?.multiRun?.roundIndex ?? 0) - (right.config?.multiRun?.roundIndex ?? 0))
      : [resumable];
    if (!runs.length) return;
    autoResumedRunGroups.current.add(key);
    void (async () => {
      setRunningSmoke(true);
      setNotice(`检测到未完成评测，正在从第 ${runs[0]?.config?.multiRun?.roundIndex ?? 1} 轮继续执行。`);
      try {
        for (const run of runs) await executeRun(run.id);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "未完成评测恢复失败，请稍后重试。");
      } finally {
        setRunningSmoke(false);
        await load().catch(() => undefined);
      }
    })();
  }, [data, runningSmoke]);
  return <main className="workspace evaluationWorkspace"><section className="content evaluationContent"><section className="overviewText"><button className="evaluationBackButton" onClick={() => { window.location.href = `/?projectId=${encodeURIComponent(projectId)}`; }} type="button">← 返回作品功能页</button><h2>创建题目 · 人工确认 · 执行 · 评分</h2><p>评测结果与成本保存在数据库中；运行前将先进行 30 元软预算与 50 元硬上限预检。</p></section>{message ? <p className="evaluationMessage error">{message}</p> : null}{notice ? <p className="evaluationMessage success">{notice}</p> : null}{data ? <EvaluationCenter data={data} onConfirmCase={confirmCase} onUnconfirmCase={unconfirmCase} onConfirmSuite={confirmSuite} onCreateCase={createCase} onDeleteCase={deleteCase} onSeedCutoffCases={seedCutoffCases} onCreateSnapshot={createSnapshot} onStartSnapshotAnalysis={() => startSnapshotAnalysis()} onRetryFailedSnapshotAnalysis={() => startSnapshotAnalysis(true)} onRunRecentSnapshotAnalysis={() => runSnapshotRequest("/recent")} onBuildSnapshotCandidates={() => runSnapshotRequest("/candidates", { action: "build" })} onReviewSnapshotCandidate={(input) => runSnapshotRequest("/candidates", input)} onStartSmokeRun={startSmokeRun} onStartMultiRun={startMultiRun} onStartSelectiveMultiRun={startSelectiveMultiRun} onRetryFailedVariants={retryFailedVariants} onRerunCase={rerunCase} onRerunVariant={rerunVariant} runningSmoke={runningSmoke} creatingSnapshot={creatingSnapshot} snapshotAnalysisBusy={snapshotAnalysisBusy} savingCaseId={savingCaseId} savingSuiteId={savingSuiteId} creatingCase={creatingCase} deletingCaseId={deletingCaseId} /> : null}</section></main>;
}
