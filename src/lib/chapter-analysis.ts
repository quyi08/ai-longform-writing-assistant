import type {
  AnalyzedCharacterAttributeTitle,
  ChapterAnalysis,
  ChapterAnalysisCandidate,
  ChapterAnalysisClueMention,
  ChapterAnalysisImportance,
  ManuscriptChapter,
  Project,
} from "./knowledge";

type ChapterAnalysisMetadata = {
  projectId: string;
  chapterId: string;
  chapterIndex: number;
  chapterTitle: string;
  content: string;
};

export type ChapterAnalysisStats = {
  totalChapters: number;
  analyzedChapters: number;
  staleChapters: number;
  candidateCharacters: number;
  candidateClues: number;
};

export type ChapterAnalysisProgressState = {
  state: "unprepared" | "running" | "partial" | "complete";
  progress: number;
};

type GetChaptersNeedingAnalysisOptions = {
  force?: boolean;
};

const importanceValues = new Set<ChapterAnalysisImportance>(["minor", "medium", "major"]);
const candidateActions = new Set(["create_candidate", "merge_or_create", "update_existing"]);
const analyzedCharacterAttributeTitleSet = new Set<AnalyzedCharacterAttributeTitle>([
  "姓名与别名",
  "剧情身份",
  "人物关系",
  "已知信息与秘密",
  "能力与限制",
]);

function today() {
  return new Date().toISOString().slice(0, 10);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function number(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function boolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function confidence(value: unknown, fallback = 0.7): number {
  return Math.max(0, Math.min(1, number(value, fallback)));
}

function importance(value: unknown): ChapterAnalysisImportance {
  return typeof value === "string" && importanceValues.has(value as ChapterAnalysisImportance)
    ? (value as ChapterAnalysisImportance)
    : "medium";
}

function createEmptyCandidateUpdates(): ChapterAnalysis["candidateUpdates"] {
  return {
    characters: [],
    clues: [],
    foreshadowings: [],
    locations: [],
    items: [],
    factions: [],
    worldRules: [],
  };
}

function normalizeCandidates(value: unknown): ChapterAnalysisCandidate[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.reduce<ChapterAnalysisCandidate[]>((items, item) => {
    if (!isRecord(item)) {
      return items;
    }
    const name = text(item.name);
    if (!name) {
      return items;
    }
    const action =
      typeof item.action === "string" && candidateActions.has(item.action)
        ? (item.action as ChapterAnalysisCandidate["action"])
        : "create_candidate";
    const suggestedAttributes = isRecord(item.suggestedAttributes)
      ? Object.fromEntries(
          Object.entries(item.suggestedAttributes)
            .filter(([key]) => analyzedCharacterAttributeTitleSet.has(key as AnalyzedCharacterAttributeTitle))
            .map(([key, value]) => [key, text(value)])
            .filter(([, value]) => value),
        )
      : undefined;
    const suggestedAttributeEvidence = isRecord(item.suggestedAttributeEvidence)
      ? Object.fromEntries(
          Object.entries(item.suggestedAttributeEvidence)
            .filter(([key]) => analyzedCharacterAttributeTitleSet.has(key as AnalyzedCharacterAttributeTitle))
            .map(([key, value]) => [key, text(value)])
            .filter(([, value]) => value),
        )
      : undefined;

    items.push({
      name,
      action,
      confidence: confidence(item.confidence),
      evidence: text(item.evidence) || undefined,
      suggestedAttributes,
      suggestedAttributeEvidence,
    });
    return items;
  }, []);
}

function normalizeEvents(value: unknown): ChapterAnalysis["plot"]["mainEvents"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.reduce<ChapterAnalysis["plot"]["mainEvents"]>((items, item) => {
    if (!isRecord(item)) {
      return items;
    }
    const title = text(item.title);
    const summary = text(item.summary);
    if (!title && !summary) {
      return items;
    }

    items.push({
      title: title || summary.slice(0, 24),
      summary,
      importance: importance(item.importance),
      type: text(item.type) || undefined,
    });
    return items;
  }, []);
}

function normalizeEntityList(value: unknown): ChapterAnalysis["entities"]["locations"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.reduce<ChapterAnalysis["entities"]["locations"]>((items, item) => {
    if (typeof item === "string") {
      const name = item.trim();
      if (name) {
        items.push({ name, description: "", importance: "medium" });
      }
      return items;
    }
    if (!isRecord(item)) {
      return items;
    }
    const name = text(item.name);
    if (!name) {
      return items;
    }

    items.push({
      name,
      description: text(item.description),
      importance: importance(item.importance),
    });
    return items;
  }, []);
}

function normalizeCharacterList(value: unknown): ChapterAnalysis["characters"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.reduce<ChapterAnalysis["characters"]>((items, item) => {
    if (!isRecord(item)) {
      return items;
    }
    const name = text(item.name);
    if (!name) {
      return items;
    }

    const relationshipChanges = Array.isArray(item.relationshipChanges)
      ? item.relationshipChanges.reduce<Array<{ targetName: string; change: string }>>(
          (relations, relation) => {
            if (!isRecord(relation)) {
              return relations;
            }
            const targetName = text(relation.targetName);
            const change = text(relation.change);
            if (targetName || change) {
              relations.push({ targetName, change });
            }
            return relations;
          },
          [],
        )
      : [];

    items.push({
      name,
      matchedCharacterId: text(item.matchedCharacterId) || null,
      aliases: stringList(item.aliases),
      role: text(item.role),
      stateBefore: text(item.stateBefore),
      stateAfter: text(item.stateAfter),
      emotion: stringList(item.emotion),
      goal: text(item.goal),
      traitsShown: stringList(item.traitsShown),
      relationshipChanges,
    });
    return items;
  }, []);
}

function normalizeForeshadowings(value: unknown): ChapterAnalysis["foreshadowings"] {
  const source = isRecord(value) ? value : {};
  const setupLike = (items: unknown) =>
    Array.isArray(items)
      ? items.reduce<ChapterAnalysis["foreshadowings"]["setups"]>((result, item) => {
          if (!isRecord(item)) {
            return result;
          }
          const title = text(item.title);
          const evidence = text(item.evidence);
          if (!title && !evidence) {
            return result;
          }
          result.push({
            title,
            evidence,
            possiblePayoff: text(item.possiblePayoff),
            relatedCharacters: stringList(item.relatedCharacters),
            confidence: confidence(item.confidence),
          });
          return result;
        }, [])
      : [];
  const payoffLike = (items: unknown) =>
    Array.isArray(items)
      ? items.reduce<ChapterAnalysis["foreshadowings"]["payoffs"]>((result, item) => {
          if (!isRecord(item)) {
            return result;
          }
          const title = text(item.title);
          const evidence = text(item.evidence);
          if (!title && !evidence) {
            return result;
          }
          result.push({
            title,
            evidence,
            relatedCharacters: stringList(item.relatedCharacters),
            confidence: confidence(item.confidence),
          });
          return result;
        }, [])
      : [];
  const updateLike = (items: unknown) =>
    Array.isArray(items)
      ? items.reduce<ChapterAnalysis["foreshadowings"]["updates"]>((result, item) => {
          if (!isRecord(item)) {
            return result;
          }
          const title = text(item.title);
          const evidence = text(item.evidence);
          if (!title && !evidence) {
            return result;
          }
          result.push({
            title,
            evidence,
            status: text(item.status),
            confidence: confidence(item.confidence),
          });
          return result;
        }, [])
      : [];

  return {
    setups: setupLike(source.setups),
    payoffs: payoffLike(source.payoffs),
    updates: updateLike(source.updates),
  };
}

function normalizeClueMentions(value: unknown): ChapterAnalysisClueMention[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.reduce<ChapterAnalysisClueMention[]>((items, item) => {
    if (!isRecord(item)) {
      return items;
    }
    const name = text(item.name);
    const summary = text(item.summary);
    const evidence = text(item.evidence);
    if (!name && !summary && !evidence) {
      return items;
    }

    items.push({
      name: name || summary.slice(0, 24) || evidence.slice(0, 24) || "未命名线索",
      summary,
      evidence,
      relatedCharacters: stringList(item.relatedCharacters),
      importance: importance(item.importance),
      confidence: confidence(item.confidence),
    });
    return items;
  }, []);
}

function legacyForeshadowingsToClues(foreshadowings: ChapterAnalysis["foreshadowings"]): ChapterAnalysisClueMention[] {
  return [
    ...foreshadowings.setups.map((item) => ({
      name: item.title,
      summary: item.possiblePayoff || item.evidence,
      evidence: item.evidence,
      relatedCharacters: item.relatedCharacters,
      importance: "medium" as const,
      confidence: item.confidence,
    })),
    ...foreshadowings.payoffs.map((item) => ({
      name: item.title,
      summary: item.evidence,
      evidence: item.evidence,
      relatedCharacters: item.relatedCharacters,
      importance: "medium" as const,
      confidence: item.confidence,
    })),
    ...foreshadowings.updates.map((item) => ({
      name: item.title,
      summary: item.status || item.evidence,
      evidence: item.evidence,
      relatedCharacters: [],
      importance: "medium" as const,
      confidence: item.confidence,
    })),
  ].filter((item) => item.name || item.summary || item.evidence);
}

function normalizeClues(value: unknown, legacyForeshadowings: ChapterAnalysis["foreshadowings"]): ChapterAnalysis["clues"] {
  const source = isRecord(value) ? value : {};
  const mentions = normalizeClueMentions(source.mentions);

  return {
    mentions: mentions.length ? mentions : legacyForeshadowingsToClues(legacyForeshadowings),
  };
}

export function createChapterContentHash(content: string): string {
  let hash = 2166136261;
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function normalizeChapterAnalysis(raw: unknown, metadata: ChapterAnalysisMetadata): ChapterAnalysis {
  const source = isRecord(raw) ? raw : {};
  const summary = isRecord(source.summary) ? source.summary : {};
  const plot = isRecord(source.plot) ? source.plot : {};
  const entities = isRecord(source.entities) ? source.entities : {};
  const timeline = isRecord(source.timeline) ? source.timeline : {};
  const craft = isRecord(source.craft) ? source.craft : {};
  const continuationHints = isRecord(source.continuationHints) ? source.continuationHints : {};
  const candidateUpdates = isRecord(source.candidateUpdates) ? source.candidateUpdates : {};
  const quality = isRecord(source.quality) ? source.quality : {};
  const emptyCandidates = createEmptyCandidateUpdates();
  const foreshadowings = normalizeForeshadowings(source.foreshadowings);

  return {
    schemaVersion: 1,
    projectId: metadata.projectId,
    chapterId: metadata.chapterId,
    chapterIndex: metadata.chapterIndex + 1,
    chapterTitle: metadata.chapterTitle,
    contentHash: createChapterContentHash(metadata.content),
    wordCount: metadata.content.replace(/\s/g, "").length,
    summary: {
      short: text(summary.short),
      detailed: text(summary.detailed),
    },
    plot: {
      mainEvents: normalizeEvents(plot.mainEvents),
      turningPoint: text(plot.turningPoint),
      chapterEnding: text(plot.chapterEnding),
    },
    characters: normalizeCharacterList(source.characters),
    entities: {
      locations: normalizeEntityList(entities.locations),
      items: normalizeEntityList(entities.items),
      factions: normalizeEntityList(entities.factions),
      worldRules: normalizeEntityList(entities.worldRules),
    },
    foreshadowings,
    clues: normalizeClues(source.clues, foreshadowings),
    timeline: {
      timeLabel: text(timeline.timeLabel),
      sequenceNote: text(timeline.sequenceNote),
      duration: text(timeline.duration),
    },
    craft: {
      pov: text(craft.pov),
      tone: stringList(craft.tone),
      conflictTypes: stringList(craft.conflictTypes),
      chapterHook: text(craft.chapterHook),
      styleNotes: stringList(craft.styleNotes),
    },
    continuationHints: {
      openQuestions: stringList(continuationHints.openQuestions),
      nextLeads: stringList(continuationHints.nextLeads),
      warnings: stringList(continuationHints.warnings),
    },
    candidateUpdates: {
      ...emptyCandidates,
      characters: normalizeCandidates(candidateUpdates.characters),
      clues: normalizeCandidates(candidateUpdates.clues).length
        ? normalizeCandidates(candidateUpdates.clues)
        : normalizeCandidates(candidateUpdates.foreshadowings),
      foreshadowings: normalizeCandidates(candidateUpdates.foreshadowings),
      locations: normalizeCandidates(candidateUpdates.locations),
      items: normalizeCandidates(candidateUpdates.items),
      factions: normalizeCandidates(candidateUpdates.factions),
      worldRules: normalizeCandidates(candidateUpdates.worldRules),
    },
    quality: {
      confidence: confidence(quality.confidence),
      needsHumanReview: boolean(quality.needsHumanReview, false),
      issues: stringList(quality.issues),
    },
    updatedAt: today(),
  };
}

export function upsertChapterAnalysis(project: Project, analysis: ChapterAnalysis): Project {
  const analyses = project.chapterAnalyses ?? [];

  return {
    ...project,
    chapterAnalyses: [
      ...analyses.filter((item) => item.chapterId !== analysis.chapterId),
      analysis,
    ].sort((first, second) => first.chapterIndex - second.chapterIndex),
  };
}

export function clearChapterAnalyses(project: Project): Project {
  return {
    ...project,
    chapterAnalyses: [],
  };
}

export function getRecentChapterPreview(
  chapter: ManuscriptChapter,
  analyses: ChapterAnalysis[] = [],
): string {
  const summary = analyses.find((analysis) => analysis.chapterId === chapter.id)?.summary?.short?.trim();
  if (summary) {
    return summary;
  }

  const preview = chapter.content.replace(/\s+/g, " ").trim();
  if (!preview) {
    return "暂无内容简介";
  }

  return preview.length > 80 ? `${preview.slice(0, 80)}…` : preview;
}

export function getChaptersNeedingAnalysis(
  project: Project,
  options: GetChaptersNeedingAnalysisOptions = {},
): ManuscriptChapter[] {
  const chapters = project.manuscript?.chapters ?? [];
  if (options.force) {
    return chapters;
  }

  const hashByChapterId = new Map((project.chapterAnalyses ?? []).map((analysis) => [analysis.chapterId, analysis.contentHash]));
  return chapters.filter((chapter) => hashByChapterId.get(chapter.id) !== createChapterContentHash(chapter.content));
}

export function getChapterAnalysisStats(project: Project): ChapterAnalysisStats {
  const totalChapters = project.manuscript?.chapters.length ?? 0;
  const staleChapters = getChaptersNeedingAnalysis(project).length;
  const analyses = project.chapterAnalyses ?? [];

  return {
    totalChapters,
    analyzedChapters: totalChapters - staleChapters,
    staleChapters,
    candidateCharacters: analyses.reduce((sum, analysis) => sum + analysis.candidateUpdates.characters.length, 0),
    candidateClues: analyses.reduce(
      (sum, analysis) =>
        sum +
        (analysis.candidateUpdates.clues?.length ??
          analysis.candidateUpdates.foreshadowings.length),
      0,
    ),
  };
}

export function getChapterAnalysisProgressState(
  project: Project,
  options: { isRunning?: boolean; progress?: number } = {},
): ChapterAnalysisProgressState {
  const stats = getChapterAnalysisStats(project);
  const isComplete =
    stats.totalChapters > 0 &&
    stats.analyzedChapters === stats.totalChapters &&
    stats.staleChapters === 0;
  const savedProgress = stats.totalChapters
    ? Math.round((stats.analyzedChapters / stats.totalChapters) * 100)
    : 0;

  if (isComplete) {
    return { state: "complete", progress: 100 };
  }

  if (options.isRunning) {
    return {
      state: "running",
      progress: Math.max(0, Math.min(100, Math.round(options.progress ?? savedProgress))),
    };
  }

  return {
    state: stats.analyzedChapters > 0 ? "partial" : "unprepared",
    progress: savedProgress,
  };
}
