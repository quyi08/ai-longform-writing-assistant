import type { Project } from "@/lib/knowledge";
import { withDatabaseClient } from "@/lib/server/db";
import { listProjects, saveProject } from "@/lib/server/project-repository";

type ProjectsDeps = {
  listProjects?: () => Promise<Project[]>;
  saveProject?: (project: Project) => Promise<Project>;
};

export async function createProjectsResponse(request: Request, deps: ProjectsDeps = {}): Promise<Response> {
  try {
    if (request.method === "GET") {
      const load = deps.listProjects ?? (() => withDatabaseClient(listProjects));
      return Response.json({ projects: await load() });
    }
    if (request.method === "PUT") {
      const body = (await request.json()) as { project?: Project };
      if (!body.project?.id || !body.project.title) {
        return Response.json({ error: "缺少项目数据。" }, { status: 400 });
      }
      const persist = deps.saveProject ?? ((project) => withDatabaseClient((client) => saveProject(client, project)));
      return Response.json({ project: await persist(body.project) });
    }
    return Response.json({ error: "不支持的请求方法。" }, { status: 405 });
  } catch {
    return Response.json({ error: "项目数据库暂不可用。浏览器本地资料未被修改。" }, { status: 503 });
  }
}

export async function GET(request: Request) {
  return createProjectsResponse(request);
}

export async function PUT(request: Request) {
  return createProjectsResponse(request);
}
