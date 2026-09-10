import type {
  ChapterAnalysis,
  ManuscriptChapter,
  SnapshotCharacterDirectoryEntry,
  SnapshotConstraintCandidate,
  SnapshotEvidence,
  SnapshotFactKind,
  SnapshotRecoveryBatch,
} from "./knowledge";

export type SnapshotAnalysisBatch = {
  id: string;
  chapterIds: string[];
  chapterIndexes: number[];
};

export type SnapshotPendingAnalysisBatch = SnapshotAnalysisBatch & {
  parentBatchId: string;
  mode: "standard" | "compact";
};

export type SnapshotAnalysisProgress = {
  completedBatchCount: number;
  totalBatchCount: number;
  pendingBatchCount: number;
  percent: number;
};

export const SNAPSHOT_PRIMARY_CHARACTER_BUDGET = 8_000;
export const LEGACY_SNAPSHOT_PRIMARY_CHARACTER_BUDGET = 18_000;

export type SnapshotDirectoryInput = {
  name: string;
  aliases: string[];
  evidence: SnapshotEvidence[];
  stableFacts?: Array<{ kind?: SnapshotFactKind; value: string; evidence: SnapshotEvidence[] }>;
  lastKnownState?: { value: string; evidence: SnapshotEvidence[] };
  confirmedCanonicalName?: string;
};

export function createSnapshotAnalysisBatches(
  chapters: ManuscriptChapter[],
  batchSize = 5,
  completedBatchIds: string[] = [],
  characterBudget = SNAPSHOT_PRIMARY_CHARACTER_BUDGET,
): SnapshotAnalysisBatch[] {
  const completed = new Set(completedBatchIds);
  const size = Math.max(1, Math.floor(batchSize));
  const batches: SnapshotAnalysisBatch[] = [];

  for (let start = 0; start < chapters.length;) {
    let end = start;
    let characters = 0;
    while (end < chapters.length && end - start < size) {
      const nextSize = chapters[end].content.length;
      if (end > start && characters + nextSize > characterBudget) break;
      characters += nextSize;
      end += 1;
      if (characters >= characterBudget) break;
    }
    const id = `chapters-${start + 1}-${end}`;
    if (!completed.has(id)) {
      batches.push({
        id,
        chapterIds: chapters.slice(start, end).map((chapter) => chapter.id),
        chapterIndexes: Array.from({ length: end - start }, (_, offset) => start + offset + 1),
      });
    }
    start = end;
  }

  return batches;
}

/** Splits an output-heavy batch only after it has failed structural validation. */
export function createSnapshotRecoveryChildren(batch: SnapshotAnalysisBatch) {
  if (batch.chapterIds.length < 2) return [];
  const splitAt = Math.ceil(batch.chapterIds.length / 2);
  return [batch.chapterIds.slice(0, splitAt), batch.chapterIds.slice(splitAt)]
    .filter((chapterIds) => chapterIds.length)
    .map((chapterIds, index) => ({
      id: `${batch.id}:compact-${index + 1}`,
      chapterIds,
      status: "pending" as const,
    }));
}

/** Gives the UI one durable queue containing normal work plus any compact recovery children. */
export function getPendingSnapshotAnalysisBatches(
  chapters: ManuscriptChapter[],
  completedBatchIds: string[] = [],
  recoveryBatches: SnapshotRecoveryBatch[] = [],
  characterBudget?: number,
): SnapshotPendingAnalysisBatch[] {
  const effectiveCharacterBudget = characterBudget ?? getSnapshotAnalysisCharacterBudget(chapters, completedBatchIds, recoveryBatches);
  const recoveryByParent = new Map(recoveryBatches.map((item) => [item.parentBatchId, item]));
  return createSnapshotAnalysisBatches(chapters, 5, [], effectiveCharacterBudget).reduce<SnapshotPendingAnalysisBatch[]>((pending, batch) => {
    if (completedBatchIds.includes(batch.id)) return pending;
    const recovery = recoveryByParent.get(batch.id);
    if (!recovery) {
      pending.push({ ...batch, parentBatchId: batch.id, mode: "standard" });
      return pending;
    }
    pending.push(...recovery.children
      .filter((child) => child.status !== "completed")
      .map((child) => ({
        id: child.id,
        chapterIds: child.chapterIds,
        chapterIndexes: child.chapterIds.map((chapterId) => chapters.findIndex((chapter) => chapter.id === chapterId) + 1),
        parentBatchId: batch.id,
        mode: "compact" as const,
      })));
    return pending;
  }, []);
}

/** Keeps existing snapshots resumable after the primary batch size was reduced. */
export function getSnapshotAnalysisCharacterBudget(
  chapters: ManuscriptChapter[],
  completedBatchIds: string[] = [],
  recoveryBatches: SnapshotRecoveryBatch[] = [],
) {
  const currentIds = new Set(createSnapshotAnalysisBatches(chapters).map((batch) => batch.id));
  const legacyIds = new Set(createSnapshotAnalysisBatches(chapters, 5, [], LEGACY_SNAPSHOT_PRIMARY_CHARACTER_BUDGET).map((batch) => batch.id));
  const persistedParentIds = [
    ...completedBatchIds,
    ...recoveryBatches.map((recovery) => recovery.parentBatchId),
  ];
  return persistedParentIds.some((id) => legacyIds.has(id) && !currentIds.has(id))
    ? LEGACY_SNAPSHOT_PRIMARY_CHARACTER_BUDGET
    : SNAPSHOT_PRIMARY_CHARACTER_BUDGET;
}

/** Derives durable UI progress from the persisted completed batch ids. */
export function getSnapshotAnalysisProgress(
  chapters: ManuscriptChapter[],
  completedBatchIds: string[] = [],
  recoveryBatches: SnapshotRecoveryBatch[] = [],
): SnapshotAnalysisProgress {
  const characterBudget = getSnapshotAnalysisCharacterBudget(chapters, completedBatchIds, recoveryBatches);
  const totalBatchCount = createSnapshotAnalysisBatches(chapters, 5, [], characterBudget).length;
  const pendingBatchCount = createSnapshotAnalysisBatches(chapters, 5, completedBatchIds, characterBudget).length;
  const completedBatchCount = Math.max(0, totalBatchCount - pendingBatchCount);
  return {
    completedBatchCount,
    totalBatchCount,
    pendingBatchCount,
    percent: totalBatchCount ? Math.round((completedBatchCount / totalBatchCount) * 100) : 0,
  };
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

function uniqueEvidence(evidence: SnapshotEvidence[]) {
  const seen = new Set<string>();
  return evidence.filter((item) => {
    const key = `${item.chapterId}:${item.chapterIndex}:${item.quote}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function directoryId(name: string) {
  return `snapshot-character-${encodeURIComponent(name)}`;
}

function needsIdentityReview(name: string) {
  return name === "我" || /^(他|她|它|三叔|叔叔|老师|老板)$/.test(name);
}

export function mergeSnapshotDirectory(
  current: SnapshotCharacterDirectoryEntry[],
  inputs: SnapshotDirectoryInput[],
): SnapshotCharacterDirectoryEntry[] {
  const entries = current.map((item) => ({
    ...item,
    aliases: [...item.aliases],
    chapterIds: [...item.chapterIds],
    stableFacts: item.stableFacts.map((fact) => ({ ...fact, evidence: [...fact.evidence] })),
    lastKnownState: item.lastKnownState
      ? { ...item.lastKnownState, evidence: [...item.lastKnownState.evidence] }
      : undefined,
  }));

  for (const input of inputs) {
    const canonicalName = input.confirmedCanonicalName?.trim() || input.name.trim();
    if (!canonicalName) continue;
    const aliases = unique([canonicalName, ...input.aliases.map((alias) => alias.trim()).filter(Boolean)]);
    const match = entries.find((entry) =>
      entry.canonicalName === canonicalName ||
      (!needsIdentityReview(input.name.trim()) && aliases.some((alias) => entry.aliases.includes(alias))),
    );
    const chapterIndexes = input.evidence.map((item) => item.chapterIndex);

    if (match) {
      match.aliases = unique([...match.aliases, ...aliases]);
      match.chapterIds = unique([...match.chapterIds, ...input.evidence.map((item) => item.chapterId)]);
      match.firstChapterIndex = Math.min(match.firstChapterIndex, ...chapterIndexes);
      match.lastChapterIndex = Math.max(match.lastChapterIndex, ...chapterIndexes);
      match.stableFacts = [...match.stableFacts, ...(input.stableFacts ?? [])].map((fact) => ({
        ...fact,
        evidence: uniqueEvidence(fact.evidence),
      }));
      if (input.lastKnownState) match.lastKnownState = input.lastKnownState;
      continue;
    }

    entries.push({
      id: directoryId(canonicalName),
      canonicalName,
      aliases,
      firstChapterIndex: Math.min(...chapterIndexes),
      lastChapterIndex: Math.max(...chapterIndexes),
      chapterIds: unique(input.evidence.map((item) => item.chapterId)),
      stableFacts: (input.stableFacts ?? []).map((fact) => ({
        ...fact,
        evidence: uniqueEvidence(fact.evidence),
      })),
      lastKnownState: input.lastKnownState,
      needsIdentityReview: needsIdentityReview(input.name.trim()) && !input.confirmedCanonicalName,
    });
  }

  return entries;
}

export function canLockSnapshotCandidate(candidate: SnapshotConstraintCandidate, retainedChapterCount: number) {
  return Boolean(candidate.value.trim()) && candidate.evidence.length > 0 && candidate.evidence.every(
    (evidence) => evidence.chapterIndex >= 1 && evidence.chapterIndex <= retainedChapterCount,
  );
}

export type SnapshotCandidateBudget = { main: number; important: number; total: number };

const reviewableFactKinds = new Set<Exclude<SnapshotFactKind, "transient">>([
  "identity",
  "relationship",
  "abilityLimit",
  "secretConflict",
  "recentState",
  "nextGoal",
]);

export function getSnapshotCandidateBudget(chapterCount: number): SnapshotCandidateBudget {
  if (chapterCount <= 50) return { main: 5, important: 7, total: 12 };
  if (chapterCount <= 200) return { main: 8, important: 15, total: 23 };
  if (chapterCount <= 500) return { main: 12, important: 20, total: 32 };
  return { main: 12, important: 25, total: 37 };
}

function rankSnapshotDirectoryEntry(entry: SnapshotCharacterDirectoryEntry, recentChapterIds: Set<string>) {
  const coreKinds = new Set(entry.stableFacts.flatMap((fact) => {
    const kind = fact.kind as Exclude<SnapshotFactKind, "transient"> | undefined;
    return kind && reviewableFactKinds.has(kind) ? [kind] : [];
  }));
  const evidenceChapterCount = new Set(entry.stableFacts.flatMap((fact) => fact.evidence.map((item) => item.chapterId))).size;
  const isRecent = entry.chapterIds.some((id) => recentChapterIds.has(id));
  let score = 0;
  score += entry.chapterIds.length >= 4 ? 3 : entry.chapterIds.length >= 2 ? 2 : 0;
  score += isRecent ? 3 : 0;
  score += coreKinds.size >= 3 ? 2 : coreKinds.size >= 2 ? 1 : 0;
  score += evidenceChapterCount >= 2 ? 1 : 0;
  if (entry.needsIdentityReview) score -= 3;
  return { score, isRecent, coreKinds };
}

function compactFactValues(values: string[], kind: Exclude<SnapshotFactKind, "transient">) {
  const uniqueValues = unique(values.map((value) => value.trim()).filter(Boolean));
  if (kind === "identity" || kind === "recentState" || kind === "nextGoal") return uniqueValues.at(-1) ?? "";
  return uniqueValues.slice(0, 2).join("；");
}

function normalizeEvidenceText(value: string) {
  return value.replace(/\s+/g, "").trim();
}

/** Converts only quote-verified, recent major clues into review candidates. */
export function buildSnapshotPriorityClueCandidates(
  chapters: Array<Pick<ManuscriptChapter, "id" | "content">>,
  analyses: ChapterAnalysis[],
  recentChapterIds: string[],
): SnapshotConstraintCandidate[] {
  const recent = new Set(recentChapterIds);
  const chapterById = new Map(chapters.map((chapter, index) => [chapter.id, { chapter, chapterIndex: index + 1 }]));
  const seen = new Set<string>();

  return analyses
    .filter((analysis) => recent.has(analysis.chapterId))
    .flatMap((analysis) => analysis.clues.mentions.flatMap((mention) => {
      if (mention.importance !== "major" || !mention.name.trim() || !mention.summary.trim() || !mention.evidence.trim()) return [];
      const source = chapterById.get(analysis.chapterId);
      const quote = mention.evidence.trim();
      if (!source || quote.length < 6 || !normalizeEvidenceText(source.chapter.content).includes(normalizeEvidenceText(quote))) return [];
      const key = `${analysis.chapterId}:${mention.name.trim()}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{
        id: `snapshot-candidate-clue-${encodeURIComponent(key)}`,
        group: "world" as const,
        title: `线索：${mention.name.trim()}`,
        value: mention.summary.trim(),
        confidence: Math.min(0.95, Math.max(0.68, mention.confidence)),
        kind: "clue" as const,
        importance: "main" as const,
        evidence: [{ chapterId: analysis.chapterId, chapterIndex: source.chapterIndex, quote, sourceType: "chapter" as const }],
        status: "pending" as const,
      }];
    }));
}

export function buildSnapshotConstraintCandidates(
  directory: SnapshotCharacterDirectoryEntry[],
  recentChapterIds: string[],
  retainedChapterCount: number,
  priorityClues: SnapshotConstraintCandidate[] = [],
): SnapshotConstraintCandidate[] {
  const recent = new Set(recentChapterIds);
  const budget = getSnapshotCandidateBudget(retainedChapterCount);
  const rankedCharacters = directory.flatMap((entry) => {
    const ranking = rankSnapshotDirectoryEntry(entry, recent);
    if (entry.needsIdentityReview || ranking.coreKinds.size === 0) return [];
    const importance = ranking.score >= 5 ? "main" as const : ranking.score >= 2 ? "important" as const : undefined;
    if (!importance) return [];
    return [{ sourceType: "character" as const, entry, ...ranking, importance }];
  });
  const rankedClues = priorityClues
    .filter((candidate) => candidate.kind === "clue" && candidate.evidence.length > 0 && candidate.evidence.every((item) => item.chapterIndex <= retainedChapterCount))
    .map((candidate) => ({ sourceType: "clue" as const, candidate, score: 9 + Number(candidate.evidence.some((item) => recent.has(item.chapterId))), isRecent: candidate.evidence.some((item) => recent.has(item.chapterId)), importance: candidate.importance ?? "important" as const }));
  const ranked = [...rankedCharacters, ...rankedClues].sort((left, right) => right.score - left.score || Number(right.isRecent) - Number(left.isRecent) || (left.sourceType === "character" ? left.entry.canonicalName : left.candidate.title).localeCompare(right.sourceType === "character" ? right.entry.canonicalName : right.candidate.title, "zh-CN"));
  const main = ranked.filter((item) => item.importance === "main").slice(0, budget.main);
  const important = ranked.filter((item) => item.importance === "important").slice(0, Math.min(budget.important, budget.total - main.length));

  return [...main, ...important].flatMap((item) => {
    if (item.sourceType === "clue") return [item.candidate];
    const { entry, importance, isRecent } = item;
    const factsByKind = new Map<Exclude<SnapshotFactKind, "transient">, Array<{ value: string; evidence: SnapshotEvidence[] }>>();
    for (const fact of entry.stableFacts) {
      const kind = fact.kind as Exclude<SnapshotFactKind, "transient"> | undefined;
      if (!kind || !reviewableFactKinds.has(kind)) continue;
      factsByKind.set(kind, [...(factsByKind.get(kind) ?? []), fact]);
    }
    const maxFacts = importance === "main" ? 3 : 2;
    return [...factsByKind.entries()].slice(0, maxFacts).flatMap(([kind, facts]) => {
      const value = compactFactValues(facts.map((fact) => fact.value), kind);
      const evidence = uniqueEvidence(facts.flatMap((fact) => fact.evidence));
      if (!value || !evidence.length) return [];
      return [{
        id: `snapshot-candidate-${entry.id}-${kind}`,
        group: isRecent ? "active" as const : "latent" as const,
        title: entry.canonicalName,
        value,
        confidence: Math.min(0.95, 0.68 + Math.min(0.2, evidence.length * 0.06)),
        kind,
        importance,
        evidence,
        status: "pending" as const,
      }];
    });
  });
}
