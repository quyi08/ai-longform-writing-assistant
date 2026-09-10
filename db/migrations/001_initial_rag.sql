CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE projects (
  id text PRIMARY KEY,
  title text NOT NULL,
  snapshot jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE chapters (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  chapter_index integer NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  content_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, chapter_index)
);

CREATE TABLE chapter_chunks (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  chapter_id text NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  chapter_index integer NOT NULL,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  content_hash text NOT NULL,
  character_count integer NOT NULL,
  entity_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  clue_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  embedding vector(1024),
  embedding_model text NOT NULL,
  status text NOT NULL CHECK (status IN ('ready', 'stale', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chapter_id, chunk_index)
);

CREATE TABLE embedding_jobs (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  chapter_id text REFERENCES chapters(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('running', 'ready', 'failed')),
  retry_count integer NOT NULL DEFAULT 0,
  error_message text,
  embedding_model text NOT NULL,
  estimated_input_tokens integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE retrieval_logs (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  query_text text NOT NULL,
  candidate_chunk_ids jsonb NOT NULL,
  selected_chunks jsonb NOT NULL,
  embedding_model text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX chapter_chunks_project_ready_idx ON chapter_chunks(project_id, status);
CREATE INDEX chapter_chunks_embedding_idx ON chapter_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX retrieval_logs_project_created_idx ON retrieval_logs(project_id, created_at DESC);
