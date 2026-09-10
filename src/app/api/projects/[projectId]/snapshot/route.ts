import { randomUUID } from "node:crypto";
import type { Project } from "@/lib/knowledge";
import { createEvaluationSnapshot } from "@/lib/projects";
import { createCutoffCenteredEvaluationSeed } from "@/lib/evaluation-seed";
import { saveEvaluationSeed } from "@/lib/server/evaluation-repository";
import { withDatabaseClient } from "@/lib/server/db";
import { listProjects, saveProject } from "@/lib/server/project-repository";

type SnapshotDeps = {
  createSnapshot?: (input: { chapterCount: number }) => Promise<Project>;
};

async function createDatabaseSnapshot(sourceProjectId: string, chapterCount: number): Promise<Project> {
  return withDatabaseClient(async (client) => {
    const source = (await listProjects(client)).find((project) => project.id === sourceProjectId);
    if (!source) throw new Error("原作品不存在。");
    const totalChapters = source.manuscript?.chapters.length ?? 0;
    if (!totalChapters) throw new Error("原作品没有可复制的章节。");
    if (chapterCount > totalChapters) throw new Error(`最多只能保留 ${totalChapters} 章。`);
    const snapshot = createEvaluationSnapshot(source, chapterCount, `evaluation-snapshot-${randomUUID()}`);
    await saveProject(client, snapshot);
    await saveEvaluationSeed(client, createCutoffCenteredEvaluationSeed({
      projectId: snapshot.id,
      projectTitle: snapshot.title,
      chapters: (snapshot.manuscript?.chapters ?? []).map((chapter, index) => ({ id: chapter.id, chapterIndex: index + 1, title: chapter.title, content: chapter.content })),
    }));
    return snapshot;
  });
}

export async function createProjectSnapshotResponse(
  sourceProjectId: string,
  request: Request,
  deps: SnapshotDeps = {},
): Promise<Response> {
  if (!sourceProjectId.trim()) return Response.json({ error: "缺少原作品标识。" }, { status: 400 });
  const body = await request.json().catch(() => ({})) as { chapterCount?: unknown };
  const chapterCount = Number(body.chapterCount);
  if (!Number.isInteger(chapterCount) || chapterCount < 1) {
    return Response.json({ error: "请填写至少保留 1 章。" }, { status: 400 });
  }

  try {
    const createSnapshot = deps.createSnapshot ?? ((input: { chapterCount: number }) => createDatabaseSnapshot(sourceProjectId, input.chapterCount));
    return Response.json({ project: await createSnapshot({ chapterCount }) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "创建评测快照失败。" }, { status: 400 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  return createProjectSnapshotResponse(projectId, request);
}
