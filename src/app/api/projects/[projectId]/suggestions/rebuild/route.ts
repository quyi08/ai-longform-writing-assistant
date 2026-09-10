import { buildAiSuggestionPool } from "@/lib/ai-suggestions";
import { createConfirmedDmbjIdentityMappings } from "@/lib/character-identity";
import type { Project } from "@/lib/knowledge";
import { withDatabaseClient } from "@/lib/server/db";
import { listProjects, saveProject } from "@/lib/server/project-repository";

type SuggestionRebuildDeps = {
  loadProjects?: () => Promise<Project[]>;
  saveProject?: (project: Project) => Promise<Project>;
};

type SuggestionRebuildOptions = {
  applyCanonicalCharacterMappings?: boolean;
};

export async function createSuggestionRebuildResponse(
  projectId: string,
  deps: SuggestionRebuildDeps = {},
  options: SuggestionRebuildOptions = {},
): Promise<Response> {
  if (!projectId.trim()) return Response.json({ error: "缺少项目标识。" }, { status: 400 });

  try {
    const loadProjects = deps.loadProjects ?? (() => withDatabaseClient(listProjects));
    const project = (await loadProjects()).find((item) => item.id === projectId);
    if (!project) return Response.json({ error: "项目不存在。" }, { status: 404 });

    const nextProject: Project = {
      ...project,
      characterIdentityMappings: options.applyCanonicalCharacterMappings
        ? createConfirmedDmbjIdentityMappings()
        : project.characterIdentityMappings,
      aiSuggestionsInitialized: true,
    };
    nextProject.aiSuggestionPool = buildAiSuggestionPool(nextProject);
    const persist = deps.saveProject ?? ((item: Project) =>
      withDatabaseClient((client) => saveProject(client, item)));
    const savedProject = await persist(nextProject);
    const pendingNewCharacters = (savedProject.aiSuggestionPool ?? []).filter(
      (suggestion) => suggestion.type === "newCharacter" && suggestion.status === "pending",
    ).length;
    return Response.json({ project: savedProject, pendingNewCharacters });
  } catch {
    return Response.json({ error: "人物建议重新整理失败，原有数据未被修改。" }, { status: 503 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  const body = await request.json().catch(() => ({}));
  return createSuggestionRebuildResponse(projectId, {}, {
    applyCanonicalCharacterMappings: body?.applyCanonicalCharacterMappings === true,
  });
}
