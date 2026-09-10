import { withDatabaseClient } from "@/lib/server/db";
import { importWorkspace } from "@/lib/server/project-repository";
import type { StoredWorkspaceState } from "@/lib/projects";

type MigrationDeps = {
  importWorkspace?: (workspace: Pick<StoredWorkspaceState, "projects">) => Promise<unknown>;
};

export async function createWorkspaceMigrationResponse(
  request: Request,
  deps: MigrationDeps = {},
): Promise<Response> {
  let workspace: unknown;
  try {
    workspace = await request.json();
  } catch {
    return Response.json({ error: "导入数据格式无效。" }, { status: 400 });
  }
  if (!workspace || typeof workspace !== "object" || !Array.isArray((workspace as StoredWorkspaceState).projects)) {
    return Response.json({ error: "缺少可导入的项目数据。" }, { status: 400 });
  }

  try {
    const runImport = deps.importWorkspace ?? ((value) => withDatabaseClient((client) => importWorkspace(client, value)));
    const summary = await runImport(workspace as Pick<StoredWorkspaceState, "projects">);
    return Response.json(summary);
  } catch {
    return Response.json({ error: "项目数据库暂不可用。浏览器本地资料未被修改。" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  return createWorkspaceMigrationResponse(request);
}
