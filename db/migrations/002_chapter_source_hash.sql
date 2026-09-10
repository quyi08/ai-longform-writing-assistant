ALTER TABLE chapter_chunks
  ADD COLUMN IF NOT EXISTS chapter_content_hash text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS chapter_chunks_project_chapter_hash_idx
  ON chapter_chunks(project_id, chapter_id, chapter_content_hash);
