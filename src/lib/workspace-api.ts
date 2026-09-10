import type { Project } from "./knowledge";
import type { StoredWorkspaceState } from "./projects";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type IndexProjectResult = { indexedChapters: number; indexedChunks: number };
export type IndexStatus = { totalChapters: number; completedChapters: number; pendingChapters: number; failedChapters: number };
export type RetrievalEvidence = { chunkId: string; chapterId: string; chapterIndex: number; chapterTitle: string; content: string; score: number };

export async function loadIndexStatus(projectId: string, fetcher: FetchLike = fetch): Promise<IndexStatus> {
  const response = await fetcher(`/api/projects/${encodeURIComponent(projectId)}/index`);
  if (!response.ok) throw new Error("索引状态暂不可用。");
  return response.json() as Promise<IndexStatus>;
}

export async function indexProject(projectId: string, fetcher: FetchLike = fetch): Promise<IndexProjectResult> {
  const response = await fetcher(`/api/projects/${encodeURIComponent(projectId)}/index`, { method: "POST" });
  if (!response.ok) throw new Error("检索索引暂不可用。");
  return response.json() as Promise<IndexProjectResult>;
}

export async function rebuildProjectSuggestions(
  projectId: string,
  applyCanonicalCharacterMappings: boolean,
  fetcher: FetchLike = fetch,
): Promise<Project> {
  const response = await fetcher(`/api/projects/${encodeURIComponent(projectId)}/suggestions/rebuild`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ applyCanonicalCharacterMappings }),
  });
  if (!response.ok) throw new Error("人物称呼整理暂不可用。");
  const payload = await response.json() as { project?: Project };
  if (!payload.project) throw new Error("人物称呼整理暂不可用。");
  return payload.project;
}

export async function auditProjectCharacters(
  projectId: string,
  force = false,
  fetcher: FetchLike = fetch,
): Promise<{ project: Project; cached: boolean }> {
  const response = await fetcher(`/api/projects/${encodeURIComponent(projectId)}/character-audit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ force }),
  });
  if (!response.ok) throw new Error((await response.json().catch(() => ({})) as { error?: string }).error ?? "人物复核暂不可用。");
  const payload = await response.json() as { project?: Project; cached?: boolean };
  if (!payload.project) throw new Error("人物复核暂不可用。");
  return { project: payload.project, cached: payload.cached === true };
}

export async function retrieveProjectEvidence(
  projectId: string,
  query: string,
  fetcher: FetchLike = fetch,
): Promise<RetrievalEvidence[]> {
  const response = await fetcher(`/api/projects/${encodeURIComponent(projectId)}/retrieve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!response.ok) throw new Error("检索验证暂不可用。");
  const payload = await response.json() as { evidence?: RetrievalEvidence[] };
  return Array.isArray(payload.evidence) ? payload.evidence : [];
}

export async function loadServerProjects(fetcher: FetchLike = fetch): Promise<Project[]> {
  const response = await fetcher("/api/projects");
  if (!response.ok) throw new Error("项目数据库暂不可用。");
  const payload = (await response.json()) as { projects?: Project[] };
  return Array.isArray(payload.projects) ? payload.projects : [];
}

export async function saveServerProject(project: Project, fetcher: FetchLike = fetch): Promise<Project> {
  const response = await fetcher("/api/projects", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project }),
  });
  if (!response.ok) throw new Error("项目同步失败，浏览器本地资料仍已保留。");
  const payload = (await response.json()) as { project?: Project };
  if (!payload.project) throw new Error("项目同步失败，浏览器本地资料仍已保留。");
  return payload.project;
}

export async function deleteServerProject(projectId: string, fetcher: FetchLike = fetch): Promise<void> {
  const response = await fetcher(`/api/projects/${encodeURIComponent(projectId)}`, { method: "DELETE" });
  if (!response.ok) throw new Error("项目删除同步失败，浏览器本地资料仍已保留。");
}

export async function migrateWorkspaceSnapshot(
  state: StoredWorkspaceState,
  fetcher: FetchLike = fetch,
) {
  const response = await fetcher("/api/workspace/migrate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state),
  });
  if (!response.ok) throw new Error("项目数据库暂不可用。");
  return response.json() as Promise<{ importedProjects: number; skippedProjects: number; importedChapters: number }>;
}
