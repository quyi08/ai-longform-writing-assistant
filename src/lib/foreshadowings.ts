import type {
  ForeshadowingItem,
  ForeshadowingStatus,
  KnowledgeRecord,
  Project,
} from "./knowledge";

export type ForeshadowingInput = {
  title: string;
  status: ForeshadowingStatus;
  setupChapterIds: string[];
  payoffChapterIds: string[];
  characterIds: string[];
  summary: string;
  plan: string;
  result: string;
  tagsText: string;
};

export type ForeshadowingStatusFilter = ForeshadowingStatus | "all";

export type ForeshadowingStats = Record<ForeshadowingStatus, number> & {
  total: number;
};

const nowIso = () => new Date().toISOString();

const createId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const unique = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];

const normalizeTitle = (value: string) => value.trim().toLocaleLowerCase().replace(/\s+/g, " ");

const normalizeTags = (tagsText: string) =>
  tagsText
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean);

function normalizeStatus(status: unknown): ForeshadowingStatus {
  return status === "inProgress" ||
    status === "resolved" ||
    status === "abandoned" ||
    status === "unresolved"
    ? status
    : "unresolved";
}

function fromInput(input: ForeshadowingInput, existing?: ForeshadowingItem): ForeshadowingItem {
  const timestamp = nowIso();

  return {
    id: existing?.id ?? createId("foreshadowing"),
    title: input.title.trim() || "未命名伏笔",
    status: input.status,
    setupChapterIds: unique(input.setupChapterIds),
    payoffChapterIds: unique(input.payoffChapterIds),
    characterIds: unique(input.characterIds),
    summary: input.summary.trim(),
    plan: input.plan.trim(),
    result: input.result.trim(),
    tags: normalizeTags(input.tagsText),
    updatedAt: timestamp,
  };
}

function fromLegacyRecord(record: KnowledgeRecord): ForeshadowingItem {
  return {
    id: record.id,
    title: record.name.trim() || "未命名伏笔",
    status: record.status === "resolved" ? "resolved" : "unresolved",
    setupChapterIds: [],
    payoffChapterIds: [],
    characterIds: unique(record.relations.map((relation) => relation.targetId)),
    summary: record.summary,
    plan: "",
    result: "",
    tags: record.tags,
    updatedAt: record.updatedAt,
  };
}

export function normalizeForeshadowings(
  foreshadowings: ForeshadowingItem[] | undefined,
  legacyRecords: KnowledgeRecord[] = [],
): ForeshadowingItem[] {
  if (!foreshadowings) {
    return legacyRecords.filter((record) => record.type === "foreshadowing").map(fromLegacyRecord);
  }

  return foreshadowings.map((item) => ({
    ...item,
    title: item.title?.trim() || "未命名伏笔",
    status: normalizeStatus(item.status),
    setupChapterIds: unique(item.setupChapterIds ?? []),
    payoffChapterIds: unique(item.payoffChapterIds ?? []),
    characterIds: unique(item.characterIds ?? []),
    summary: item.summary ?? "",
    plan: item.plan ?? "",
    result: item.result ?? "",
    tags: item.tags ?? [],
  }));
}

export function addForeshadowing(
  foreshadowings: ForeshadowingItem[],
  input: ForeshadowingInput,
): ForeshadowingItem[] {
  return [...foreshadowings, fromInput(input)];
}

export function mergeForeshadowingItems(
  base: ForeshadowingItem[],
  additions: ForeshadowingItem[],
): ForeshadowingItem[] {
  const ids = new Set(base.map((item) => item.id));
  const titles = new Set(base.map((item) => normalizeTitle(item.title)));

  return [
    ...base,
    ...additions.filter((item) => {
      const title = normalizeTitle(item.title);
      if (ids.has(item.id) || titles.has(title)) {
        return false;
      }
      ids.add(item.id);
      titles.add(title);
      return true;
    }),
  ];
}

export function updateForeshadowing(
  foreshadowings: ForeshadowingItem[],
  foreshadowingId: string,
  input: ForeshadowingInput,
): ForeshadowingItem[] {
  return foreshadowings.map((item) =>
    item.id === foreshadowingId ? fromInput(input, item) : item,
  );
}

export function deleteForeshadowing(
  foreshadowings: ForeshadowingItem[],
  foreshadowingId: string,
): ForeshadowingItem[] {
  return foreshadowings.filter((item) => item.id !== foreshadowingId);
}

export function filterForeshadowings(
  foreshadowings: ForeshadowingItem[],
  filter: { status: ForeshadowingStatusFilter; query: string },
): ForeshadowingItem[] {
  const query = filter.query.trim().toLowerCase();

  return foreshadowings.filter((item) => {
    if (filter.status !== "all" && item.status !== filter.status) {
      return false;
    }

    if (!query) {
      return true;
    }

    return [item.title, item.summary, item.plan, item.result, ...item.tags]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
}

export function getForeshadowingStats(
  foreshadowings: ForeshadowingItem[],
): ForeshadowingStats {
  return foreshadowings.reduce<ForeshadowingStats>(
    (stats, item) => ({
      ...stats,
      total: stats.total + 1,
      [item.status]: stats[item.status] + 1,
    }),
    {
      total: 0,
      unresolved: 0,
      inProgress: 0,
      resolved: 0,
      abandoned: 0,
    },
  );
}

export function getWritingReferenceForeshadowingCount(
  foreshadowings: ForeshadowingItem[],
): number {
  return foreshadowings.filter(
    (item) => item.status === "unresolved" || item.status === "inProgress",
  ).length;
}

export function updateProjectForeshadowings(
  projects: Project[],
  projectId: string,
  foreshadowings: ForeshadowingItem[],
): Project[] {
  return projects.map((project) =>
    project.id === projectId
      ? { ...project, foreshadowings: normalizeForeshadowings(foreshadowings, project.records) }
      : project,
  );
}
