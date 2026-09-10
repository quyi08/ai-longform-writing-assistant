import { randomUUID } from "node:crypto";
import type { Project, SnapshotConstraintCandidate } from "@/lib/knowledge";
import { buildSnapshotConstraintCandidates, buildSnapshotPriorityClueCandidates, canLockSnapshotCandidate, getPendingSnapshotAnalysisBatches } from "@/lib/snapshot-analysis";
import { withDatabaseClient } from "@/lib/server/db";
import { listProjects, saveProjectSnapshot } from "@/lib/server/project-repository";

type CandidateDeps = { loadProject?: () => Promise<Project | undefined>; saveProject?: (project: Project) => Promise<Project> };

function snapshotConstraintMeta(candidate: SnapshotConstraintCandidate) {
  const priority = candidate.kind === "identity" || candidate.kind === "abilityLimit" || candidate.kind === "secretConflict"
    ? "p0" as const
    : candidate.kind === "relationship" ? "p2" as const
    : candidate.group === "world" ? "p1" as const : "p1" as const;
  return {
    priority,
    evidenceLevel: "explicit" as const,
    evidenceChapterIndexes: [...new Set(candidate.evidence.map((item) => item.chapterIndex))].sort((left, right) => left - right),
    scopeEntities: [candidate.title],
    source: "snapshot" as const,
  };
}

async function loadProject(projectId: string) {
  return withDatabaseClient(async (client) => (await listProjects(client)).find((project) => project.id === projectId));
}
async function saveSnapshot(project: Project) { return withDatabaseClient((client) => saveProjectSnapshot(client, project)); }

function updateCandidate(project: Project, candidate: SnapshotConstraintCandidate, status: SnapshotConstraintCandidate["status"]): Project {
  const snapshot = project.evaluationSnapshot!;
  const candidates = snapshot.analysis.candidates.map((item) => item.id === candidate.id ? { ...item, status } : item);
  if (status !== "locked") return { ...project, evaluationSnapshot: { ...snapshot, analysis: { ...snapshot.analysis, candidates } } };
  if (candidate.group === "active" || candidate.group === "latent") {
    const existing = (project.characters ?? []).find((character) => character.name === candidate.title);
    const attribute = {
      id: `snapshot-attribute-${randomUUID()}`,
      kind: "summary" as const,
      title: "快照已证实事实",
      value: candidate.value,
      locked: true,
      constraintMeta: snapshotConstraintMeta(candidate),
    };
    const characters = existing
      ? (project.characters ?? []).map((character) => character.id === existing.id ? { ...character, attributes: [...character.attributes, attribute], updatedAt: new Date().toISOString() } : character)
      : [...(project.characters ?? []), { id: `snapshot-character-${randomUUID()}`, name: candidate.title, gender: "", catchphrase: "", attributes: [attribute], updatedAt: new Date().toISOString() }];
    return { ...project, characters, evaluationSnapshot: { ...snapshot, analysis: { ...snapshot.analysis, candidates } } };
  }
  return {
    ...project,
    records: [...project.records, {
      id: `snapshot-rule-${randomUUID()}`,
      type: "worldRule",
      name: candidate.title,
      summary: candidate.value,
      status: "locked",
      tags: ["评测快照", candidate.group],
      relations: [],
      constraintMeta: snapshotConstraintMeta(candidate),
      updatedAt: new Date().toISOString(),
    }],
    evaluationSnapshot: { ...snapshot, analysis: { ...snapshot.analysis, candidates } },
  };
}

export async function createSnapshotCandidatesResponse(projectId: string, request: Request, deps: CandidateDeps = {}) {
  if (request.method !== "POST") return Response.json({ error: "不支持的请求方法。" }, { status: 405 });
  const project = await (deps.loadProject ?? (() => loadProject(projectId)))();
  if (!project) return Response.json({ error: "作品不存在。" }, { status: 404 });
  if (!project.evaluationSnapshot) return Response.json({ error: "当前作品不是评测快照。" }, { status: 400 });
  const body = await request.json().catch(() => ({})) as { action?: string; candidateId?: string; title?: string; value?: string };
  if (body.action === "build") {
    const pendingBatches = getPendingSnapshotAnalysisBatches(
      project.manuscript?.chapters ?? [],
      project.evaluationSnapshot.analysis.completedBatchIds,
      project.evaluationSnapshot.analysis.recoveryBatches ?? [],
    );
    if (pendingBatches.length) {
      return Response.json({ error: `轻量解析尚未完成，仍有 ${pendingBatches.length} 个批次待处理。请先完成轻量解析后再生成候选。` }, { status: 409 });
    }
    const priorityClues = buildSnapshotPriorityClueCandidates(
      project.manuscript?.chapters ?? [],
      project.chapterAnalyses ?? [],
      project.evaluationSnapshot.analysis.recentChapterIds,
    );
    const candidates = buildSnapshotConstraintCandidates(
      project.evaluationSnapshot.analysis.directory,
      project.evaluationSnapshot.analysis.recentChapterIds,
      project.evaluationSnapshot.retainedChapterCount,
      priorityClues,
    );
    const next: Project = {
      ...project,
      evaluationSnapshot: { ...project.evaluationSnapshot, analysis: { ...project.evaluationSnapshot.analysis, candidates, status: "candidate_review" } },
    };
    await (deps.saveProject ?? saveSnapshot)(next);
    return Response.json({ analysis: next.evaluationSnapshot.analysis });
  }
  if (body.action === "lockPackage") {
    const packageItems = project.evaluationSnapshot.analysis.candidates.filter((item) => item.title === body.title && item.status === "pending");
    if (!packageItems.length) return Response.json({ error: "该人物没有待确认的约束项。" }, { status: 400 });
    if (packageItems.some((item) => !canLockSnapshotCandidate(item, project.evaluationSnapshot!.retainedChapterCount))) {
      return Response.json({ error: "约束包中存在缺少快照正文证据的条目，不能整包锁定。" }, { status: 400 });
    }
    const next = packageItems.reduce((current, item) => updateCandidate(current, item, "locked"), project);
    await (deps.saveProject ?? saveSnapshot)(next);
    return Response.json({ analysis: next.evaluationSnapshot!.analysis });
  }
  const found = project.evaluationSnapshot.analysis.candidates.find((item) => item.id === body.candidateId);
  const candidate = found && typeof body.value === "string" ? { ...found, value: body.value.trim() } : found;
  if (!candidate) return Response.json({ error: "候选不存在。" }, { status: 404 });
  const status = body.action === "lock" ? "locked" : body.action === "reference" ? "reference" : body.action === "ignore" ? "ignored" : undefined;
  if (!status) return Response.json({ error: "暂不支持此候选操作。" }, { status: 400 });
  if (status === "locked" && !canLockSnapshotCandidate(candidate, project.evaluationSnapshot.retainedChapterCount)) {
    return Response.json({ error: "候选缺少快照范围内的正文证据，不能锁定。" }, { status: 400 });
  }
  const source = candidate === found ? project : { ...project, evaluationSnapshot: { ...project.evaluationSnapshot, analysis: { ...project.evaluationSnapshot.analysis, candidates: project.evaluationSnapshot.analysis.candidates.map((item) => item.id === candidate!.id ? candidate! : item) } } };
  const next = updateCandidate(source, candidate, status);
  await (deps.saveProject ?? saveSnapshot)(next);
  return Response.json({ analysis: next.evaluationSnapshot!.analysis });
}

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  return createSnapshotCandidatesResponse((await params).projectId, request);
}
