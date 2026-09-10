import type { ManuscriptChapter, OutlineBoard, OutlinePart, Project } from "./knowledge";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function createOutlineBoardId(boards: OutlineBoard[]): string {
  const maxIndex = boards.reduce((maxValue, board) => {
    const match = /^outline-board-(\d+)$/.exec(board.id);
    return match ? Math.max(maxValue, Number(match[1])) : maxValue;
  }, 0);

  return `outline-board-${maxIndex + 1}`;
}

function createOutlinePartId(parts: OutlinePart[]): string {
  const maxIndex = parts.reduce((maxValue, part) => {
    const match = /^outline-part-(\d+)$/.exec(part.id);
    return match ? Math.max(maxValue, Number(match[1])) : maxValue;
  }, 0);

  return `outline-part-${maxIndex + 1}`;
}

export type OutlineOption = {
  id: string;
  label: string;
};

function createDefaultOutlineBoard(): OutlineBoard {
  return {
    id: "outline-board-1",
    title: "大纲框架 1",
    chapterIds: [],
    summary: "",
    updatedAt: today(),
  };
}

export function ensureOutlineBoards(project: Project): OutlineBoard[] {
  if (project.outlineBoards?.length) {
    return project.outlineBoards;
  }

  return [createDefaultOutlineBoard()];
}

export function ensureOutlineParts(project: Project): OutlinePart[] {
  return project.outlineParts ?? [];
}

export function addOutlinePart(parts: OutlinePart[]): OutlinePart[] {
  return [
    ...parts,
    {
      id: createOutlinePartId(parts),
      title: "未命名分节",
      chapterIds: [],
      characterIds: [],
      summary: "",
      updatedAt: today(),
    },
  ];
}

export function deleteOutlineParts(
  parts: OutlinePart[],
  selectedIds: string[],
): OutlinePart[] {
  const selectedIdSet = new Set(selectedIds);
  return parts.filter((part) => !selectedIdSet.has(part.id));
}

export function moveOutlinePart(
  parts: OutlinePart[],
  sourcePartId: string,
  targetPartId: string,
): OutlinePart[] {
  if (sourcePartId === targetPartId) {
    return parts;
  }

  const sourceIndex = parts.findIndex((part) => part.id === sourcePartId);
  const targetIndex = parts.findIndex((part) => part.id === targetPartId);
  if (sourceIndex === -1 || targetIndex === -1) {
    return parts;
  }

  const nextParts = [...parts];
  const [sourcePart] = nextParts.splice(sourceIndex, 1);
  nextParts.splice(targetIndex, 0, sourcePart);
  return nextParts;
}

export function updateOutlinePart(
  parts: OutlinePart[],
  partId: string,
  input: Partial<Pick<OutlinePart, "title" | "chapterIds" | "characterIds" | "summary">>,
): OutlinePart[] {
  return parts.map((part) =>
    part.id === partId
      ? {
          ...part,
          ...input,
          title: input.title?.trim() || part.title,
          chapterIds: input.chapterIds ?? part.chapterIds,
          characterIds: input.characterIds ?? part.characterIds,
          summary: input.summary ?? part.summary,
          updatedAt: today(),
        }
      : part,
  );
}

export function searchOutlineOptions<T extends OutlineOption>(options: T[], query: string): T[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return options;
  }

  return options.filter((option) => option.label.toLowerCase().includes(normalizedQuery));
}

export function addOutlineBoard(boards: OutlineBoard[]): OutlineBoard[] {
  const nextIndex = boards.length + 1;

  return [
    ...boards,
    {
      id: createOutlineBoardId(boards),
      title: `大纲框架 ${nextIndex}`,
      chapterIds: [],
      summary: "",
      updatedAt: today(),
    },
  ];
}

export function deleteOutlineBoard(
  boards: OutlineBoard[],
  boardId: string,
): OutlineBoard[] {
  const remaining = boards.filter((board) => board.id !== boardId);
  return remaining.length ? remaining : [createDefaultOutlineBoard()];
}

export function addChapterToOutlineBoard(
  boards: OutlineBoard[],
  boardId: string,
  chapterId: string,
): OutlineBoard[] {
  return boards.map((board) => {
    const chapterIds = board.chapterIds.filter((id) => id !== chapterId);
    if (board.id !== boardId) {
      return { ...board, chapterIds };
    }

    return {
      ...board,
      chapterIds: [...chapterIds, chapterId],
      updatedAt: today(),
    };
  });
}

export function parseChapterRangeInput(
  input: string,
  chapterCount: number,
): { startIndex: number; endIndex: number } | undefined {
  if (chapterCount <= 0) {
    return undefined;
  }

  const numbers = input.match(/\d+/g)?.map((value) => Number(value)) ?? [];
  if (!numbers.length || numbers.some((value) => !Number.isFinite(value) || value <= 0)) {
    return undefined;
  }

  const first = numbers[0];
  const second = numbers[1] ?? first;
  const startChapter = Math.min(first, second);
  const endChapter = Math.max(first, second);
  const startIndex = Math.max(0, Math.min(chapterCount - 1, startChapter - 1));
  const endIndex = Math.max(0, Math.min(chapterCount - 1, endChapter - 1));

  return { startIndex, endIndex };
}

export function addChapterRangeToOutlineBoard(
  boards: OutlineBoard[],
  boardId: string,
  chapters: ManuscriptChapter[],
  rangeInput: string,
): OutlineBoard[] {
  const range = parseChapterRangeInput(rangeInput, chapters.length);
  if (!range) {
    return boards;
  }

  const chapterIdsToMove = chapters
    .slice(range.startIndex, range.endIndex + 1)
    .map((chapter) => chapter.id);
  const chapterIdsToMoveSet = new Set(chapterIdsToMove);

  return boards.map((board) => {
    const chapterIds = board.chapterIds.filter((id) => !chapterIdsToMoveSet.has(id));
    if (board.id !== boardId) {
      return { ...board, chapterIds };
    }

    return {
      ...board,
      chapterIds: [...chapterIds, ...chapterIdsToMove],
      updatedAt: today(),
    };
  });
}

export function removeChapterFromOutlineBoard(
  boards: OutlineBoard[],
  boardId: string,
  chapterId: string,
): OutlineBoard[] {
  return boards.map((board) =>
    board.id === boardId
      ? {
          ...board,
          chapterIds: board.chapterIds.filter((id) => id !== chapterId),
          updatedAt: today(),
        }
      : board,
  );
}

export function updateOutlineBoardSummary(
  boards: OutlineBoard[],
  boardId: string,
  summary: string,
): OutlineBoard[] {
  return boards.map((board) =>
    board.id === boardId ? { ...board, summary, updatedAt: today() } : board,
  );
}

export function updateOutlineBoardTitle(
  boards: OutlineBoard[],
  boardId: string,
  title: string,
): OutlineBoard[] {
  const normalizedTitle = title.trim();

  return boards.map((board) =>
    board.id === boardId && normalizedTitle
      ? { ...board, title: normalizedTitle, updatedAt: today() }
      : board,
  );
}

export function updateProjectOutlineBoards(
  projects: Project[],
  projectId: string,
  outlineBoards: OutlineBoard[],
): Project[] {
  return projects.map((project) =>
    project.id === projectId ? { ...project, outlineBoards } : project,
  );
}

export function updateProjectOutlineParts(
  projects: Project[],
  projectId: string,
  outlineParts: OutlinePart[],
): Project[] {
  return projects.map((project) =>
    project.id === projectId ? { ...project, outlineParts } : project,
  );
}
