import type { ChapterAnalysis, ChapterAnalysisClueMention } from "./knowledge";

export type AiAnalysisCharacterRow = {
  name: string;
  count: number;
  chapters: string[];
  detail: string;
  confidence?: number;
};

export type AiAnalysisForeshadowingKind = "setup" | "payoff" | "update";

export type AiAnalysisForeshadowingRow = {
  key: string;
  kind: AiAnalysisForeshadowingKind;
  index: number;
  label: string;
  detail: string;
};

export type AiAnalysisClueRow = {
  key: string;
  index: number;
  label: string;
  detail: string;
};

type CharacterAccumulator = {
  name: string;
  count: number;
  chapters: Set<string>;
  details: string[];
  confidence?: number;
};

function normalizeName(name: string) {
  return name.trim();
}

function pushUniqueDetail(details: string[], detail: string) {
  const normalized = detail.trim();
  if (normalized && !details.includes(normalized)) {
    details.push(normalized);
  }
}

function toCharacterRows(map: Map<string, CharacterAccumulator>) {
  return [...map.values()]
    .map<AiAnalysisCharacterRow>((item) => ({
      name: item.name,
      count: item.count,
      chapters: [...item.chapters],
      detail: item.details.slice(0, 3).join("；"),
      confidence: item.confidence,
    }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "zh-Hans-CN"));
}

export function getMatchedAnalysisCharacters(analyses: ChapterAnalysis[]): AiAnalysisCharacterRow[] {
  const map = new Map<string, CharacterAccumulator>();

  analyses.forEach((analysis) => {
    analysis.characters.forEach((character) => {
      const name = normalizeName(character.name);
      if (!name) {
        return;
      }

      const existing =
        map.get(name) ??
        ({
          name,
          count: 0,
          chapters: new Set<string>(),
          details: [],
        } satisfies CharacterAccumulator);

      existing.count += 1;
      existing.chapters.add(analysis.chapterTitle);
      pushUniqueDetail(
        existing.details,
        [character.role, character.stateAfter, character.goal].filter(Boolean).join(" / "),
      );
      map.set(name, existing);
    });
  });

  return toCharacterRows(map);
}

export function getCandidateAnalysisCharacters(analyses: ChapterAnalysis[]): AiAnalysisCharacterRow[] {
  return getCandidateRows(analyses, "characters");
}

export function getCandidateAnalysisForeshadowings(
  analyses: ChapterAnalysis[],
): AiAnalysisCharacterRow[] {
  return getCandidateRows(analyses, "foreshadowings");
}

export function getCandidateAnalysisClues(analyses: ChapterAnalysis[]): AiAnalysisCharacterRow[] {
  return getCandidateRows(analyses, "clues");
}

function getCandidateRows(
  analyses: ChapterAnalysis[],
  kind: "characters" | "foreshadowings" | "clues",
): AiAnalysisCharacterRow[] {
  const map = new Map<string, CharacterAccumulator>();

  analyses.forEach((analysis) => {
    const candidates =
      kind === "clues"
        ? analysis.candidateUpdates.clues?.length
          ? analysis.candidateUpdates.clues
          : analysis.candidateUpdates.foreshadowings
        : analysis.candidateUpdates[kind];

    candidates.forEach((candidate) => {
      const name = normalizeName(candidate.name);
      if (!name) {
        return;
      }

      const existing =
        map.get(name) ??
        ({
          name,
          count: 0,
          chapters: new Set<string>(),
          details: [],
          confidence: 0,
        } satisfies CharacterAccumulator);

      existing.count += 1;
      existing.chapters.add(analysis.chapterTitle);
      existing.confidence = Math.max(existing.confidence ?? 0, candidate.confidence);
      pushUniqueDetail(existing.details, candidate.evidence ?? candidate.action);
      map.set(name, existing);
    });
  });

  return toCharacterRows(map);
}

function getAnalysisClueMentions(analysis: ChapterAnalysis): ChapterAnalysisClueMention[] {
  if (analysis.clues?.mentions?.length) {
    return analysis.clues.mentions;
  }

  return [
    ...analysis.foreshadowings.setups.map((item) => ({
      name: item.title,
      summary: item.possiblePayoff || item.evidence,
      evidence: item.evidence,
      relatedCharacters: item.relatedCharacters,
      importance: "medium" as const,
      confidence: item.confidence,
    })),
    ...analysis.foreshadowings.payoffs.map((item) => ({
      name: item.title,
      summary: item.evidence,
      evidence: item.evidence,
      relatedCharacters: item.relatedCharacters,
      importance: "medium" as const,
      confidence: item.confidence,
    })),
    ...analysis.foreshadowings.updates.map((item) => ({
      name: item.title,
      summary: item.status || item.evidence,
      evidence: item.evidence,
      relatedCharacters: [],
      importance: "medium" as const,
      confidence: item.confidence,
    })),
  ].filter((item) => item.name || item.summary || item.evidence);
}

export function getAnalysisClueRows(analysis: ChapterAnalysis, limit = 4): AiAnalysisClueRow[] {
  return getAnalysisClueMentions(analysis)
    .map((item, index) => ({
      key: `${analysis.chapterId}-clue-${index}`,
      index,
      label: item.name,
      detail: item.summary || item.evidence,
    }))
    .slice(0, limit);
}

export function getAnalysisClueGroups(analyses: ChapterAnalysis[]): AiAnalysisCharacterRow[] {
  const map = new Map<string, CharacterAccumulator>();

  analyses.forEach((analysis) => {
    getAnalysisClueMentions(analysis).forEach((clue) => {
      const name = normalizeName(clue.name);
      if (!name) {
        return;
      }

      const existing =
        map.get(name) ??
        ({
          name,
          count: 0,
          chapters: new Set<string>(),
          details: [],
          confidence: 0,
        } satisfies CharacterAccumulator);

      existing.count += 1;
      existing.chapters.add(analysis.chapterTitle);
      existing.confidence = Math.max(existing.confidence ?? 0, clue.confidence);
      pushUniqueDetail(existing.details, clue.summary || clue.evidence);
      map.set(name, existing);
    });
  });

  return toCharacterRows(map);
}

export function getAnalysisForeshadowingRows(
  analysis: ChapterAnalysis,
  limit = 4,
): AiAnalysisForeshadowingRow[] {
  const rows: AiAnalysisForeshadowingRow[] = [
    ...analysis.foreshadowings.setups.map((item, index) => ({
      key: `${analysis.chapterId}-setup-${index}`,
      kind: "setup" as const,
      index,
      label: `埋设：${item.title}`,
      detail: item.evidence || item.possiblePayoff,
    })),
    ...analysis.foreshadowings.payoffs.map((item, index) => ({
      key: `${analysis.chapterId}-payoff-${index}`,
      kind: "payoff" as const,
      index,
      label: `回收：${item.title}`,
      detail: item.evidence,
    })),
    ...analysis.foreshadowings.updates.map((item, index) => ({
      key: `${analysis.chapterId}-update-${index}`,
      kind: "update" as const,
      index,
      label: `推进：${item.title}`,
      detail: item.evidence || item.status,
    })),
  ];

  return rows.slice(0, limit);
}

export function deleteAnalysisClue(
  analysis: ChapterAnalysis,
  index: number,
  updatedAt = new Date().toISOString(),
): ChapterAnalysis {
  const mentions = getAnalysisClueMentions(analysis);

  return {
    ...analysis,
    clues: {
      mentions: mentions.filter((_, itemIndex) => itemIndex !== index),
    },
    updatedAt,
  };
}

export function deleteAnalysisForeshadowing(
  analysis: ChapterAnalysis,
  kind: AiAnalysisForeshadowingKind,
  index: number,
  updatedAt = new Date().toISOString(),
): ChapterAnalysis {
  return {
    ...analysis,
    foreshadowings: {
      setups:
        kind === "setup"
          ? analysis.foreshadowings.setups.filter((_, itemIndex) => itemIndex !== index)
          : analysis.foreshadowings.setups,
      payoffs:
        kind === "payoff"
          ? analysis.foreshadowings.payoffs.filter((_, itemIndex) => itemIndex !== index)
          : analysis.foreshadowings.payoffs,
      updates:
        kind === "update"
          ? analysis.foreshadowings.updates.filter((_, itemIndex) => itemIndex !== index)
          : analysis.foreshadowings.updates,
    },
    updatedAt,
  };
}

export function updateAnalysisClue(
  analysis: ChapterAnalysis,
  index: number,
  draft: { title: string; detail: string },
  updatedAt = new Date().toISOString(),
): ChapterAnalysis {
  const name = draft.title.trim() || "未命名线索";
  const detail = draft.detail.trim();
  const mentions = getAnalysisClueMentions(analysis);

  return {
    ...analysis,
    clues: {
      mentions: mentions.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              name,
              summary: detail,
              evidence: detail || item.evidence,
            }
          : item,
      ),
    },
    updatedAt,
  };
}

export function updateAnalysisForeshadowing(
  analysis: ChapterAnalysis,
  kind: AiAnalysisForeshadowingKind,
  index: number,
  draft: { title: string; detail: string },
  updatedAt = new Date().toISOString(),
): ChapterAnalysis {
  const title = draft.title.trim() || "未命名伏笔";
  const detail = draft.detail.trim();

  return {
    ...analysis,
    foreshadowings: {
      setups: analysis.foreshadowings.setups.map((item, itemIndex) =>
        kind === "setup" && itemIndex === index ? { ...item, title, evidence: detail } : item,
      ),
      payoffs: analysis.foreshadowings.payoffs.map((item, itemIndex) =>
        kind === "payoff" && itemIndex === index ? { ...item, title, evidence: detail } : item,
      ),
      updates: analysis.foreshadowings.updates.map((item, itemIndex) =>
        kind === "update" && itemIndex === index ? { ...item, title, evidence: detail } : item,
      ),
    },
    updatedAt,
  };
}
