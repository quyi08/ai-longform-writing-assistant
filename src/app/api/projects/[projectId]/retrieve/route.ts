import { getEmbeddingConfig } from "@/lib/embedding-config";
import { createOpenAiCompatibleEmbeddings } from "@/lib/openai-compatible";
import { withDatabaseClient } from "@/lib/server/db";
import { retrieveProjectEvidence, type RetrievalEvidence } from "@/lib/server/retrieval-service";

type RetrieveDeps = {
  retrieve?: (projectId: string, query: string) => Promise<RetrievalEvidence[]>;
};

export async function createRetrieveResponse(
  projectId: string,
  payload: { query?: unknown },
  deps: RetrieveDeps = {},
): Promise<Response> {
  const query = typeof payload.query === "string" ? payload.query.trim() : "";
  if (!projectId.trim()) return Response.json({ error: "缺少项目标识。" }, { status: 400 });
  if (!query) return Response.json({ error: "检索问题不能为空。" }, { status: 400 });

  try {
    const retrieve = deps.retrieve ?? ((targetProjectId: string, targetQuery: string) => {
      const config = getEmbeddingConfig(process.env);
      return withDatabaseClient((client) => retrieveProjectEvidence(
        targetProjectId,
        targetQuery,
        client,
        (texts) => createOpenAiCompatibleEmbeddings(config, texts),
      ));
    });
    return Response.json({ evidence: await retrieve(projectId, query) });
  } catch {
    return Response.json({ error: "检索验证暂不可用，请检查本机数据库与 Embedding 配置。" }, { status: 503 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  let payload: { query?: unknown } = {};
  try {
    payload = await request.json() as { query?: unknown };
  } catch {
    return Response.json({ error: "检索请求格式不正确。" }, { status: 400 });
  }
  return createRetrieveResponse(projectId, payload);
}
