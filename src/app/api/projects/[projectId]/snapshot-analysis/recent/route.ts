import type { ChapterAnalysis, Project } from "@/lib/knowledge";
import { createChapterAnalysisStreamResponse } from "@/app/api/ai/analyze-chapters/route";
import { withDatabaseClient } from "@/lib/server/db";
import { listProjects, saveProjectSnapshot } from "@/lib/server/project-repository";

type RecentDeps = {
  loadProject?: () => Promise<Project | undefined>;
  saveProject?: (project: Project) => Promise<Project>;
  analyze?: (input: { project: Project; chapterIds: string[] }) => Promise<ChapterAnalysis[]>;
};

async function loadProject(projectId: string) {
  return withDatabaseClient(async (client) => (await listProjects(client)).find((project) => project.id === projectId));
}

async function saveSnapshot(project: Project) {
  return withDatabaseClient((client) => saveProjectSnapshot(client, project));
}

async function runExistingAnalysis(input: { project: Project; chapterIds: string[] }) {
  const response = await createChapterAnalysisStreamResponse(new Request("http://localhost/api/ai/analyze-chapters", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project: input.project, chapterIds: input.chapterIds, force: true, mode: "full" }),
  }));
  if (!response.ok || !response.body) throw new Error("近期章节深度解析启动失败。");
  const text = await response.text();
  const analyses: ChapterAnalysis[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const event = JSON.parse(line) as { type?: string; analysis?: ChapterAnalysis; error?: string };
    if (event.type === "chapterDone" && event.analysis) analyses.push(event.analysis);
    if (event.type === "chapterError") throw new Error(event.error ?? "近期章节深度解析失败。");
  }
  return analyses;
}

export async function createRecentSnapshotAnalysisResponse(projectId: string, request: Request, deps: RecentDeps = {}) {
  if (request.method !== "POST") return Response.json({ error: "不支持的请求方法。" }, { status: 405 });
  const project = await (deps.loadProject ?? (() => loadProject(projectId)))();
  if (!project) return Response.json({ error: "作品不存在。" }, { status: 404 });
  if (!project.evaluationSnapshot) return Response.json({ error: "当前作品不是评测快照。" }, { status: 400 });
  const chapters = project.manuscript?.chapters ?? [];
  const chapterIds = chapters.slice(-5).map((chapter) => chapter.id);
  try {
    const analyses = await (deps.analyze ?? runExistingAnalysis)({ project, chapterIds });
    const next: Project = {
      ...project,
      chapterAnalyses: [
        ...(project.chapterAnalyses ?? []).filter((analysis) => !chapterIds.includes(analysis.chapterId)),
        ...analyses,
      ],
      evaluationSnapshot: {
        ...project.evaluationSnapshot,
        analysis: { ...project.evaluationSnapshot.analysis, status: "candidate_review", recentChapterIds: chapterIds },
      },
    };
    await (deps.saveProject ?? saveSnapshot)(next);
    return Response.json({ projectId, analysis: next.evaluationSnapshot.analysis, analyzedCount: analyses.length });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "近期章节深度解析失败。" }, { status: 502 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  return createRecentSnapshotAnalysisResponse((await params).projectId, request);
}
