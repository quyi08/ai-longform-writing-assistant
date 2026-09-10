import type { Project } from "@/lib/knowledge";
import type { StoredWorkspaceState } from "@/lib/projects";

type QueryResult = { rowCount?: number | null; rows: Array<Record<string, unknown>> };

export type QueryClient = {
  query: (sql: string, values?: unknown[]) => Promise<QueryResult>;
};

export type MigrationSummary = {
  importedProjects: number;
  skippedProjects: number;
  importedChapters: number;
};

function createContentHash(content: string): string {
  let hash = 2166136261;
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export async function importWorkspace(
  client: QueryClient,
  workspace: Pick<StoredWorkspaceState, "projects">,
): Promise<MigrationSummary> {
  const summary: MigrationSummary = { importedProjects: 0, skippedProjects: 0, importedChapters: 0 };

  for (const project of workspace.projects) {
    const inserted = await client.query(
      `INSERT INTO projects (id, title, snapshot)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [project.id, project.title, JSON.stringify(project)],
    );
    if (!inserted.rowCount) {
      summary.skippedProjects += 1;
      continue;
    }
    summary.importedProjects += 1;
    for (const [chapterIndex, chapter] of (project.manuscript?.chapters ?? []).entries()) {
      await client.query(
        `INSERT INTO chapters (id, project_id, chapter_index, title, content, content_hash)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [chapter.id, project.id, chapterIndex + 1, chapter.title, chapter.content, createContentHash(chapter.content)],
      );
      summary.importedChapters += 1;
    }
  }
  return summary;
}

export async function listProjects(client: QueryClient): Promise<Project[]> {
  const result = await client.query("SELECT snapshot FROM projects ORDER BY updated_at DESC");
  return result.rows.map((row) => row.snapshot as Project);
}

export async function saveProject(client: QueryClient, project: Project): Promise<Project> {
  await client.query(
    `INSERT INTO projects (id, title, snapshot)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       snapshot = EXCLUDED.snapshot,
       revision = projects.revision + 1,
       updated_at = now()`,
    [project.id, project.title, JSON.stringify(project)],
  );

  const chapters = project.manuscript?.chapters ?? [];
  for (const [chapterIndex, chapter] of chapters.entries()) {
    await client.query(
      `INSERT INTO chapters (id, project_id, chapter_index, title, content, content_hash)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         project_id = EXCLUDED.project_id,
         chapter_index = EXCLUDED.chapter_index,
         title = EXCLUDED.title,
         content = EXCLUDED.content,
         content_hash = EXCLUDED.content_hash,
         updated_at = now()`,
      [chapter.id, project.id, chapterIndex + 1, chapter.title, chapter.content, createContentHash(chapter.content)],
    );
  }

  if (chapters.length) {
    await client.query(
      "DELETE FROM chapters WHERE project_id = $1 AND NOT (id = ANY($2::text[]))",
      [project.id, chapters.map((chapter) => chapter.id)],
    );
  } else {
    await client.query("DELETE FROM chapters WHERE project_id = $1", [project.id]);
  }
  return project;
}

/** Persists project metadata/analysis without touching its manuscript chapters. */
export async function saveProjectSnapshot(client: QueryClient, project: Project): Promise<Project> {
  await client.query(
    `INSERT INTO projects (id, title, snapshot)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       snapshot = EXCLUDED.snapshot,
       revision = projects.revision + 1,
       updated_at = now()`,
    [project.id, project.title, JSON.stringify(project)],
  );
  return project;
}

export async function deleteProject(client: QueryClient, projectId: string): Promise<void> {
  await client.query("DELETE FROM projects WHERE id = $1", [projectId]);
}
