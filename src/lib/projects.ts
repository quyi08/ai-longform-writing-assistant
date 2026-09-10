import type {
  CurrentChapterGoal,
  Project,
  WritingReferencePreparation,
} from "./knowledge";

const defaultTitle = "未命名小说";

export type MirrorProjectLinks = Record<string, string | undefined>;

export type StoredWorkspaceState = {
  projects: Project[];
  mirrorLinks: MirrorProjectLinks;
  activeProjectId?: string;
  selectedRecordId?: string;
  loginVideoEnded?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function createProjectId(title: string, count: number): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}-]/gu, "");

  return `${slug || "novel"}-${count + 1}-${Date.now().toString(36)}`;
}

export function addProject(
  projects: Project[],
  title: string,
  coverImage?: Project["coverImage"],
): Project[] {
  const normalizedTitle = title.trim() || defaultTitle;
  const project: Project = {
    id: createProjectId(normalizedTitle, projects.length),
    title: normalizedTitle,
    genre: "未设定",
    synopsis: "这是一部新小说，等待补充作品简介。",
    targetWordCount: 300000,
    updateFrequency: "未设定",
    coverImage,
    records: [],
  };

  return [...projects, project];
}

/**
 * Produces an isolated, spoiler-free project copy for continuation evaluation.
 * Knowledge derived from the source is intentionally cleared: it may contain
 * facts from chapters that are outside the snapshot cutoff.
 */
export function createEvaluationSnapshot(
  source: Project,
  chapterCount: number,
  snapshotId: string,
): Project {
  const sourceChapters = source.manuscript?.chapters ?? [];
  const retainedCount = Math.max(1, Math.min(Math.floor(chapterCount), sourceChapters.length));
  const chapters = sourceChapters.slice(0, retainedCount).map((chapter, index) => ({
    ...chapter,
    id: `${snapshotId}-chapter-${index + 1}`,
  }));

  return {
    id: snapshotId,
    title: `${source.title} · 评测快照（前 ${retainedCount} 章）`,
    genre: source.genre,
    synopsis: source.synopsis,
    targetWordCount: source.targetWordCount,
    updateFrequency: source.updateFrequency,
    coverImage: source.coverImage,
    manuscript: source.manuscript ? { ...source.manuscript, chapters } : undefined,
    characters: [],
    characterIdentityMappings: [],
    records: [],
    chapterAnalyses: [],
    aiSuggestionQueue: [],
    aiSuggestionPool: [],
    aiSuggestionsInitialized: false,
    characterAudit: undefined,
    clueDiagnosis: undefined,
    currentChapterGoal: undefined,
    writingReferencePreparation: undefined,
    continuationRuns: [],
    outlineBoards: [],
    outlineParts: [],
    timelineEvents: [],
    foreshadowings: [],
    clueBoards: [],
    relationshipGraphs: [],
    maps: [],
    evaluationSnapshot: {
      sourceProjectId: source.id,
      sourceTitle: source.title,
      retainedChapterCount: retainedCount,
      createdAt: new Date().toISOString(),
      analysis: {
        version: 1,
        status: "idle",
        completedBatchIds: [],
        failedBatches: [],
        recoveryBatches: [],
        directory: [],
        recentChapterIds: [],
        candidates: [],
      },
    },
  };
}

export function renameProject(
  projects: Project[],
  projectId: string,
  title: string,
): Project[] {
  const normalizedTitle = title.trim() || defaultTitle;

  return projects.map((project) =>
    project.id === projectId ? { ...project, title: normalizedTitle } : project,
  );
}

export function deleteProject(projects: Project[], projectId: string): Project[] {
  if (projects.length <= 1) {
    return projects;
  }

  return projects.filter((project) => project.id !== projectId);
}

export function resolveActiveProject(
  projects: Project[],
  activeProjectId: string,
): Project | undefined {
  return (
    projects.find((project) => project.id === activeProjectId) ?? projects[0]
  );
}

export function updateProjectCover(
  projects: Project[],
  projectId: string,
  coverImage: NonNullable<Project["coverImage"]>,
): Project[] {
  return projects.map((project) =>
    project.id === projectId ? { ...project, coverImage } : project,
  );
}

export function updateProjectSynopsis(
  projects: Project[],
  projectId: string,
  synopsis: string,
): Project[] {
  const limitedSynopsis = synopsis.slice(0, 80);

  return projects.map((project) =>
    project.id === projectId ? { ...project, synopsis: limitedSynopsis } : project,
  );
}

export function updateProjectCurrentChapterGoal(
  projects: Project[],
  projectId: string,
  goal: CurrentChapterGoal,
): Project[] {
  const normalizedGoal: CurrentChapterGoal = {
    ...goal,
    plot: goal.plot.trim(),
    characterChange: goal.characterChange.trim(),
    conflict: goal.conflict.trim(),
    foreshadowing: goal.foreshadowing.trim(),
    endingHook: goal.endingHook.trim(),
    lockedRules: goal.lockedRules.trim(),
  };
  const hasGoalContent = [
    normalizedGoal.plot,
    normalizedGoal.characterChange,
    normalizedGoal.conflict,
    normalizedGoal.foreshadowing,
    normalizedGoal.endingHook,
    normalizedGoal.lockedRules,
  ].some(Boolean);

  return projects.map((project) =>
    project.id === projectId
      ? { ...project, currentChapterGoal: hasGoalContent ? normalizedGoal : undefined }
      : project,
  );
}

export function updateProjectWritingReferencePreparation(
  projects: Project[],
  projectId: string,
  preparation: WritingReferencePreparation,
): Project[] {
  const uniqueIds = (ids: string[]) => [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  const selectedIds = uniqueIds(preparation.selectedIds);
  const lockedIds = uniqueIds(preparation.lockedIds).filter((id) => selectedIds.includes(id));
  const nextChapterCharacterIds = uniqueIds(preparation.nextChapterCharacterIds ?? []);

  return projects.map((project) =>
    project.id === projectId
      ? {
          ...project,
          writingReferencePreparation: {
            selectedIds,
            lockedIds,
            nextChapterCharacterIds,
            temporaryRequest: {
              mustHappen: preparation.temporaryRequest.mustHappen.trim(),
              mustAvoid: preparation.temporaryRequest.mustAvoid.trim(),
              atmosphere: preparation.temporaryRequest.atmosphere.trim(),
              other: preparation.temporaryRequest.other.trim(),
            },
          },
        }
      : project,
  );
}

export function assignProjectToMirror(
  mirrorLinks: MirrorProjectLinks,
  mirrorId: string,
  projectId: string,
): MirrorProjectLinks {
  return {
    ...mirrorLinks,
    [mirrorId]: projectId,
  };
}

export function getMirrorProject(
  projects: Project[],
  mirrorLinks: MirrorProjectLinks,
  mirrorId: string,
): Project | undefined {
  const projectId = mirrorLinks[mirrorId];
  return projects.find((project) => project.id === projectId);
}

export function removeProjectFromMirrorLinks(
  mirrorLinks: MirrorProjectLinks,
  projectId: string,
): MirrorProjectLinks {
  return Object.fromEntries(
    Object.entries(mirrorLinks).filter(
      ([, linkedProjectId]) => linkedProjectId !== projectId,
    ),
  );
}

export function parseStoredWorkspaceState(
  value: string | null,
): StoredWorkspaceState | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed) || !Array.isArray(parsed.projects)) {
      return undefined;
    }

    return {
      projects: parsed.projects as Project[],
      mirrorLinks: isRecord(parsed.mirrorLinks)
        ? (parsed.mirrorLinks as MirrorProjectLinks)
        : {},
      activeProjectId:
        typeof parsed.activeProjectId === "string" ? parsed.activeProjectId : undefined,
      selectedRecordId:
        typeof parsed.selectedRecordId === "string" ? parsed.selectedRecordId : undefined,
      loginVideoEnded:
        typeof parsed.loginVideoEnded === "boolean" ? parsed.loginVideoEnded : undefined,
    };
  } catch {
    return undefined;
  }
}
