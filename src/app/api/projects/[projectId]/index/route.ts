import { getEmbeddingConfig } from "@/lib/embedding-config";
import { createOpenAiCompatibleEmbeddings } from "@/lib/openai-compatible";
import { withDatabaseClient } from "@/lib/server/db";
import { getIndexStatus, indexProject } from "@/lib/server/indexing-service";

type IndexResult = { indexedChapters: number; indexedChunks: number };
type IndexDeps = { indexProject?: (projectId: string) => Promise<IndexResult> };

export async function createIndexResponse(projectId: string, deps: IndexDeps = {}): Promise<Response> {
  if (!projectId.trim()) return Response.json({ error: "缺少项目标识。" }, { status: 400 });
  try {
    const run = deps.indexProject ?? ((targetProjectId: string) => {
      const config = getEmbeddingConfig(process.env);
      return withDatabaseClient((client) => indexProject(targetProjectId, client, (texts) => createOpenAiCompatibleEmbeddings(config, texts)));
    });
    return Response.json(await run(projectId));
  } catch {
    return Response.json({ error: "检索索引暂不可用，请检查本机数据库与 Embedding 配置。" }, { status: 503 });
  }
}

export async function POST(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  return createIndexResponse(projectId);
}

export async function GET(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  if (!projectId.trim()) return Response.json({ error: "缺少项目标识。" }, { status: 400 });
  try {
    return Response.json(await withDatabaseClient((client) => getIndexStatus(projectId, client)));
  } catch {
    return Response.json({ error: "索引状态暂不可用。" }, { status: 503 });
  }
}
