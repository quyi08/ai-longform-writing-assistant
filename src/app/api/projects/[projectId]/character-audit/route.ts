import { getAiProviderConfig } from "@/lib/ai-config";
import {
  applyCharacterAudit,
  auditCharacterCandidates,
  buildCharacterAuditCandidates,
  characterAuditRulesVersion,
  createCharacterAuditFingerprint,
} from "@/lib/character-audit";
import type { CharacterAuditItem, Project } from "@/lib/knowledge";
import { withDatabaseClient } from "@/lib/server/db";
import { listProjects, saveProject } from "@/lib/server/project-repository";

type CharacterAuditDeps = {
  loadProjects?: () => Promise<Project[]>;
  saveProject?: (project: Project) => Promise<Project>;
  createFingerprint?: (project: Project) => string;
  runAudit?: (project: Project) => Promise<CharacterAuditItem[]>;
};

type CharacterAuditOptions = { force?: boolean };

export async function createCharacterAuditResponse(
  projectId: string,
  deps: CharacterAuditDeps = {},
  options: CharacterAuditOptions = {},
): Promise<Response> {
  if (!projectId.trim()) return Response.json({ error: "缺少项目标识。" }, { status: 400 });

  try {
    const loadProjects = deps.loadProjects ?? (() => withDatabaseClient(listProjects));
    const project = (await loadProjects()).find((item) => item.id === projectId);
    if (!project) return Response.json({ error: "项目不存在。" }, { status: 404 });

    const fingerprint = (deps.createFingerprint ?? createCharacterAuditFingerprint)(project);
    if (!options.force && project.characterAudit?.status === "succeeded" && project.characterAudit.fingerprint === fingerprint) {
      return Response.json({ project, cached: true });
    }

    const runAudit = deps.runAudit ?? (async (currentProject: Project) => {
      const config = getAiProviderConfig(process.env, "characterAuditor");
      return auditCharacterCandidates(config, buildCharacterAuditCandidates(currentProject));
    });
    const items = await runAudit(project);
    const auditedProject = applyCharacterAudit(project, items);
    const nextProject: Project = {
      ...auditedProject,
      characterAudit: {
        fingerprint,
        generatedAt: new Date().toISOString(),
        rulesVersion: characterAuditRulesVersion,
        status: "succeeded",
        model: deps.runAudit ? undefined : getAiProviderConfig(process.env, "characterAuditor").model,
        items,
        reviewQueue: items
          .filter((item) => item.needsHumanReview || (item.mainScore >= 75 && item.mainScore < 85))
          .map((item) => item.suggestionId),
      },
    };
    const persist = deps.saveProject ?? ((item: Project) => withDatabaseClient((client) => saveProject(client, item)));
    const savedProject = await persist(nextProject);
    return Response.json({ project: savedProject, cached: false });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    return Response.json({ error: `人物复核失败，原有建议未修改：${detail}` }, { status: 503 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  const body = await request.json().catch(() => ({}));
  return createCharacterAuditResponse(projectId, {}, { force: body?.force === true });
}
