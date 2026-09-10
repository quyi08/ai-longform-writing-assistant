import { createChapterChunks, type ChapterChunkDraft } from "../chunking";

export type IndexedChapter = {
  id: string;
  title: string;
  content: string;
  contentHash: string;
  chapterIndex: number;
};

export type ChapterIndexJob = {
  chapterId: string;
  chapterIndex: number;
  chunks: ChapterChunkDraft[];
};

export function planChapterIndexing(
  chapters: IndexedChapter[],
  indexedHashes: Map<string, string>,
  _embed: (texts: string[]) => Promise<number[][]> | void,
): ChapterIndexJob[] {
  return chapters
    .filter((chapter) => indexedHashes.get(chapter.id) !== chapter.contentHash)
    .map((chapter) => ({
      chapterId: chapter.id,
      chapterIndex: chapter.chapterIndex,
      chunks: createChapterChunks(chapter, chapter.chapterIndex),
    }));
}

type QueryClient = { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> };

export type IndexStatus = { totalChapters: number; completedChapters: number; pendingChapters: number; failedChapters: number };

export async function getIndexStatus(projectId: string, client: QueryClient): Promise<IndexStatus> {
  const result = await client.query(
    `SELECT
      count(*) FILTER (WHERE length(trim(content)) > 0)::int AS total,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM chapter_chunks c WHERE c.project_id = chapters.project_id AND c.chapter_id = chapters.id AND c.status = 'ready' AND c.chapter_content_hash = chapters.content_hash))::int AS completed,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM embedding_jobs j WHERE j.project_id = chapters.project_id AND j.chapter_id = chapters.id AND j.status = 'failed'))::int AS failed
     FROM chapters WHERE project_id = $1`,
    [projectId],
  );
  const row = result.rows[0] ?? {};
  const totalChapters = Number(row.total ?? 0);
  const completedChapters = Number(row.completed ?? 0);
  const failedChapters = Number(row.failed ?? 0);
  return { totalChapters, completedChapters, pendingChapters: Math.max(0, totalChapters - completedChapters), failedChapters };
}

export async function indexProject(
  projectId: string,
  client: QueryClient,
  embed: (texts: string[]) => Promise<number[][]>,
): Promise<{ indexedChapters: number; indexedChunks: number; failedChapters: number }> {
  const [chapterResult, hashResult] = await Promise.all([
    client.query("SELECT id, title, content, content_hash AS \"contentHash\", chapter_index AS \"chapterIndex\" FROM chapters WHERE project_id = $1 ORDER BY chapter_index", [projectId]),
    client.query("SELECT chapter_id, chapter_content_hash FROM chapter_chunks WHERE project_id = $1 AND status = 'ready'", [projectId]),
  ]);
  const indexedHashes = new Map(hashResult.rows.map((row) => [String(row.chapter_id), String(row.chapter_content_hash)]));
  const chapters = chapterResult.rows.map((row) => ({ id: String(row.id), title: String(row.title), content: String(row.content), contentHash: String(row.contentHash), chapterIndex: Number(row.chapterIndex) }));
  const jobs = planChapterIndexing(chapters, indexedHashes, embed);
  let indexedChunks = 0;
  let failedChapters = 0;
  for (const job of jobs) {
    try {
      const vectors = await embed(job.chunks.map((chunk) => chunk.content));
      if (vectors.length !== job.chunks.length) throw new Error("Embedding response count mismatch");
      await client.query("DELETE FROM chapter_chunks WHERE project_id = $1 AND chapter_id = $2", [projectId, job.chapterId]);
      for (const [index, chunk] of job.chunks.entries()) {
        await client.query(
          "INSERT INTO chapter_chunks (id, project_id, chapter_id, chapter_index, chunk_index, content, content_hash, chapter_content_hash, character_count, embedding, embedding_model, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::vector,$11,'ready')",
          [`${job.chapterId}:${chunk.chunkIndex}:${chunk.contentHash}`, projectId, job.chapterId, job.chapterIndex, chunk.chunkIndex, chunk.content, chunk.contentHash, chapters.find((chapter) => chapter.id === job.chapterId)!.contentHash, chunk.characterCount, `[${vectors[index].join(",")}]`, "qwen3.7-text-embedding"],
        );
        indexedChunks += 1;
      }
    } catch (error) {
      failedChapters += 1;
      const message = error instanceof Error ? error.message.slice(0, 240) : "Embedding request failed";
      await client.query(
        "INSERT INTO embedding_jobs (id, project_id, chapter_id, status, error_message, embedding_model) VALUES ($1,$2,$3,'failed',$4,$5)",
        [`${job.chapterId}:failed:${Date.now()}`, projectId, job.chapterId, message, "qwen3.7-text-embedding"],
      );
    }
  }
  return { indexedChapters: jobs.length - failedChapters, indexedChunks, failedChapters };
}
