export type RetrievalEvidence = {
  chunkId: string;
  chapterId: string;
  chapterIndex: number;
  chapterTitle: string;
  content: string;
  score: number;
};

type QueryClient = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

type RetrievalOptions = { maxChapterIndex?: number };

export async function retrieveProjectEvidence(
  projectId: string,
  queryText: string,
  client: QueryClient,
  embed: (texts: string[]) => Promise<number[][]>,
  options: RetrievalOptions = {},
): Promise<RetrievalEvidence[]> {
  const normalizedQuery = queryText.trim();
  if (!normalizedQuery) throw new Error("检索问题不能为空。");

  const vectors = await embed([normalizedQuery]);
  const vector = vectors[0];
  if (!vector || vector.length !== 1024) throw new Error("检索向量不可用。");

  const hasCutoff = Number.isInteger(options.maxChapterIndex);
  const result = await client.query(
    `SELECT
      c.id AS chunk_id,
      c.chapter_id,
      c.chapter_index,
      ch.title AS chapter_title,
      c.content,
      1 - (c.embedding <=> $2::vector) AS score
     FROM chapter_chunks c
     JOIN chapters ch ON ch.id = c.chapter_id
     WHERE c.project_id = $1 AND c.status = 'ready' AND c.embedding IS NOT NULL${hasCutoff ? " AND c.chapter_index <= $3" : ""}
     ORDER BY c.embedding <=> $2::vector ASC
     LIMIT 5`,
    hasCutoff ? [projectId, `[${vector.join(",")}]`, options.maxChapterIndex] : [projectId, `[${vector.join(",")}]`],
  );

  return result.rows.map((row) => ({
    chunkId: String(row.chunk_id),
    chapterId: String(row.chapter_id),
    chapterIndex: Number(row.chapter_index),
    chapterTitle: String(row.chapter_title),
    content: String(row.content),
    score: Number(row.score),
  }));
}
