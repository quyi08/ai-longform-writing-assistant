import { withDatabaseClient } from "@/lib/server/db";
import { deleteProject } from "@/lib/server/project-repository";

type DeleteProjectDeps = {
  deleteProject?: (projectId: string) => Promise<void>;
};

export async function createProjectDeleteResponse(
  projectId: string,
  deps: DeleteProjectDeps = {},
): Promise<Response> {
  if (!projectId.trim()) return Response.json({ error: "缺少项目标识。" }, { status: 400 });
  try {
    const remove = deps.deleteProject ?? ((targetProjectId: string) =>
      withDatabaseClient((client) => deleteProject(client, targetProjectId)));
    await remove(projectId);
    return Response.json({ projectId });
  } catch {
    return Response.json({ error: "项目数据库暂不可用。浏览器本地资料未被修改。" }, { status: 503 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  return createProjectDeleteResponse(projectId);
}
