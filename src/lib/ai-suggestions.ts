import type {
  AiSuggestion,
  AiSuggestionSource,
  AiSuggestionStatus,
  AiSuggestionType,
  AiSuggestionImportanceLevel,
  ChapterAnalysis,
  CharacterAnalysisAttribute,
  ClueDiagnosisTier,
  Project,
} from "./knowledge";
import { analyzedCharacterAttributeTitles } from "./knowledge";
import { buildClueDiagnosisInput, getCluePoolFingerprint } from "./clue-diagnosis";
import {
  addCharacter,
  getProjectCharacters,
  syncAnalyzedCharacterAttributes,
  updateCharacterBase,
} from "./characters";
import { addForeshadowing, normalizeForeshadowings } from "./foreshadowings";
import { resolveProjectCharacterIdentity } from "./character-identity";

const typeLabels: Record<AiSuggestionType, string> = {
  newCharacter: "新人物",
  characterUpdate: "人物变化",
  newForeshadowing: "新伏笔",
  timelineEvent: "时间线",
  worldRule: "设定补充",
};

const typeOrder: AiSuggestionType[] = [
  "newCharacter",
  "newForeshadowing",
  "timelineEvent",
  "characterUpdate",
  "worldRule",
];
const analyzedCharacterAttributeTitleSet = new Set<string>(analyzedCharacterAttributeTitles);

const typeSummaryLabels: Record<AiSuggestionType, (count: number) => string> = {
  newCharacter: (count) => `${count} 个新人物`,
  characterUpdate: (count) => `${count} 处人物变化`,
  newForeshadowing: (count) => `${count} 条伏笔`,
  timelineEvent: (count) => `${count} 条时间线`,
  worldRule: (count) => `${count} 条设定补充`,
};

export type AiSuggestionCategory = "characters" | "clues" | "timeline";

export function getClueSuggestionTier(suggestion: AiSuggestion): ClueDiagnosisTier {
  return suggestion.clueDiagnosisTier ?? "priority";
}

function getTieredClueSuggestions(project: Project, tier: ClueDiagnosisTier): AiSuggestion[] {
  const queue = project.aiSuggestionPool ?? project.aiSuggestionQueue ?? [];
  return queue
    .filter(
      (suggestion) =>
        getAiSuggestionCategory(suggestion.type) === "clues" &&
        suggestion.status === "pending" &&
        getClueSuggestionTier(suggestion) === tier,
    )
    .sort((left, right) => (right.clueDiagnosisScore ?? 0) - (left.clueDiagnosisScore ?? 0));
}

export function getPriorityClueSuggestions(project: Project): AiSuggestion[] {
  return getTieredClueSuggestions(project, "priority");
}

export function getWatchClueSuggestions(project: Project): AiSuggestion[] {
  return getTieredClueSuggestions(project, "watch");
}

type SuggestionTheme = {
  key: string;
  label?: string;
};

export function getAiSuggestionCategory(type: AiSuggestionType): AiSuggestionCategory {
  if (type === "newCharacter" || type === "characterUpdate") {
    return "characters";
  }
  if (type === "timelineEvent") {
    return "timeline";
  }
  return "clues";
}

function makeId(type: AiSuggestionType, chapterId: string, name: string): string {
  return `ai-suggestion-${type}-${chapterId}-${name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")}`;
}

function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function sameName(left: string, right: string): boolean {
  return normalizeName(left) === normalizeName(right);
}

function mergeCharacterChanges(
  left: CharacterAnalysisAttribute[] = [],
  right: CharacterAnalysisAttribute[] = [],
): CharacterAnalysisAttribute[] {
  const byTitle = new Map<string, CharacterAnalysisAttribute>();
  [...left, ...right].forEach((change) => {
    if (change.value.trim()) {
      const existing = byTitle.get(change.title);
      if (change.title === "姓名与别名" && existing) {
        const aliases = [...existing.value.split(/[／/、,，;；\n]+/), ...change.value.split(/[／/、,，;；\n]+/)]
          .map((item) => item.trim())
          .filter(Boolean);
        byTitle.set(change.title, {
          ...existing,
          value: [...new Set(aliases)].join(" / "),
        });
        return;
      }
      byTitle.set(change.title, change);
    }
  });
  return [...byTitle.values()];
}

function normalizeCharacterIdentityTerm(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[（）()【】\[\]“”"']/g, "")
    .replace(/[。．]/g, "")
    .replace(/\s+/g, " ");
}

function getSuggestionBareTargetName(suggestion: AiSuggestion): string {
  return normalizeCharacterIdentityTerm(
    (suggestion.targetName ?? "").replace(/[（(][^）)]*[）)]/g, "").trim(),
  );
}

function getExplicitSuggestionAliases(suggestion: AiSuggestion): string[] {
  const aliasValue = suggestion.characterChanges?.find((change) => change.title === "姓名与别名")?.value ?? "";
  const ownNames = new Set([
    normalizeCharacterIdentityTerm(suggestion.targetName ?? ""),
    getSuggestionBareTargetName(suggestion),
  ]);
  return [...new Set(aliasValue.split(/[／/、,，;；\n]+/)
    .map(normalizeCharacterIdentityTerm)
    .filter(
      (term) =>
        term.length >= 2 &&
        term.length <= 12 &&
        /^[\p{L}\p{N}·・-]+$/u.test(term) &&
        !ownNames.has(term) &&
        !/(正文|本章|未|不详|称|出现|叙述|主角|人物|姓名|名字|未知)/.test(term),
    ))];
}

function haveSafeSharedIdentityEvidence(left: AiSuggestion, right: AiSuggestion): boolean {
  const leftBareName = getSuggestionBareTargetName(left);
  const rightBareName = getSuggestionBareTargetName(right);
  if (leftBareName.length >= 2 && leftBareName === rightBareName) return true;
  const leftAliases = getExplicitSuggestionAliases(left);
  const rightAliases = getExplicitSuggestionAliases(right);
  return leftAliases.some((alias) => rightAliases.includes(alias));
}

function consolidateGeneratedCharacterSuggestions(pool: AiSuggestion[]): AiSuggestion[] {
  const candidates = pool.filter(
    (suggestion) => suggestion.type === "newCharacter" && suggestion.status === "pending",
  );
  if (candidates.length < 2) return pool;

  const parent = candidates.map((_, index) => index);
  const find = (index: number): number => {
    if (parent[index] !== index) parent[index] = find(parent[index]);
    return parent[index];
  };
  const union = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
  };
  for (let current = 0; current < candidates.length; current += 1) {
    for (let previous = 0; previous < current; previous += 1) {
      if (haveSafeSharedIdentityEvidence(candidates[current], candidates[previous])) union(current, previous);
    }
  }

  const clusters = new Map<number, AiSuggestion[]>();
  candidates.forEach((suggestion, index) => {
    const root = find(index);
    clusters.set(root, [...(clusters.get(root) ?? []), suggestion]);
  });
  const mergedById = new Map<string, AiSuggestion>();
  for (const cluster of clusters.values()) {
    const [first, ...rest] = cluster;
    const merged = rest.reduce<AiSuggestion>((current, suggestion) => {
      const sources = mergeSources(current.sources, suggestion.sources);
      return {
        ...current,
        sources,
        source: formatSources(sources, current.source),
        characterChanges: mergeCharacterChanges(current.characterChanges, suggestion.characterChanges),
      };
    }, first);
    mergedById.set(first.id, {
      ...merged,
      canonicalKey: createCanonicalKey(merged.type, merged.targetName ?? merged.title, merged.detail),
    });
    rest.forEach((suggestion) => mergedById.set(suggestion.id, mergedById.get(first.id)!));
  }
  const emitted = new Set<string>();
  return pool.flatMap((suggestion) => {
    const merged = mergedById.get(suggestion.id);
    if (!merged) return [suggestion];
    if (emitted.has(merged.id)) return [];
    emitted.add(merged.id);
    return [merged];
  });
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function getCharacterImportanceCapacity(
  project: Project,
  suggestionCount: number,
): { main: number; important: number } {
  if (!suggestionCount) return { main: 0, important: 0 };
  const chapters = project.manuscript?.chapters ?? [];
  const chapterCount = chapters.length;
  const wordCount = chapters.reduce((total, chapter) => total + chapter.content.replace(/\s/g, "").length, 0);
  const main = clamp(
    Math.round(6 + 1.55 * Math.sqrt(chapterCount) + 4 * Math.log(wordCount / 100000 + 1)),
    12,
    60,
  );
  const visibleMain = Math.min(main, suggestionCount);
  return {
    main: visibleMain,
    important: Math.min(Math.round(visibleMain * 1.5), suggestionCount),
  };
}

function scoreCharacterSuggestion(project: Project, suggestion: AiSuggestion): {
  score: number;
  reasons: string[];
} {
  const sources = suggestion.sources ?? [];
  const sourceChapterIds = [...new Set(sources.map((source) => source.chapterId).filter(Boolean))];
  const chapterIndexById = new Map((project.manuscript?.chapters ?? []).map((chapter, index) => [chapter.id, index]));
  const sourceIndices = sourceChapterIds
    .map((id) => chapterIndexById.get(id))
    .filter((index): index is number => index !== undefined);
  const coverage = Math.min(35, Math.sqrt(sourceChapterIds.length) * 4);
  const chapterCount = project.manuscript?.chapters.length ?? 0;
  const span = sourceIndices.length > 1 && chapterCount > 1
    ? Math.min(20, ((Math.max(...sourceIndices) - Math.min(...sourceIndices)) / (chapterCount - 1)) * 20)
    : 0;
  const changeText = (suggestion.characterChanges ?? []).map((change) => `${change.title} ${change.value}`).join(" ");
  const roleScore = Math.min(20, (changeText.match(/主角|主视角|叙述者|核心同伴|关键对手|反派|行动发起|领导者/g)?.length ?? 0) * 5);
  const relationScore = Math.min(15, (suggestion.characterChanges ?? []).filter((change) =>
    ["人物关系", "已知信息与秘密", "能力与限制"].includes(change.title),
  ).length * 5);
  const genericName = /未具名|路人|老头|男子|女子|尸体|人群|某人/.test(suggestion.targetName ?? "");
  const aliasValue = suggestion.characterChanges?.find((change) => change.title === "姓名与别名")?.value ?? "";
  const identityScore = genericName ? 0 : aliasValue.trim() ? 10 : 7;
  const reasons = [
    sourceChapterIds.length ? `出现 ${sourceChapterIds.length} 章` : "来源章节待补充",
    span >= 1 ? `跨越全书 ${Math.round((span / 20) * 100)}%` : "",
    roleScore ? "承担核心剧情功能" : "",
    relationScore ? `关联 ${relationScore / 5} 类人物资料` : "",
    genericName ? "称呼较泛，建议人工核对" : "身份称呼较明确",
  ].filter(Boolean);
  return { score: Math.round(coverage + span + roleScore + relationScore + identityScore), reasons };
}

function hasCoreCharacterRole(suggestion: AiSuggestion): boolean {
  return /主角|主视角|叙述者|核心同伴|关键对手|反派|行动发起|领导者/.test(
    (suggestion.characterChanges ?? []).map((change) => `${change.title} ${change.value}`).join(" "),
  );
}

export function classifyCharacterSuggestionImportance(
  project: Project,
  pool: AiSuggestion[],
): AiSuggestion[] {
  const candidates = pool
    .filter((suggestion) => getAiSuggestionCategory(suggestion.type) === "characters" && suggestion.status === "pending")
    .map((suggestion) => ({ suggestion, ...scoreCharacterSuggestion(project, suggestion) }))
    .sort((left, right) =>
      right.score - left.score ||
      (right.suggestion.sources?.length ?? 0) - (left.suggestion.sources?.length ?? 0) ||
      (left.suggestion.createdAt ?? "").localeCompare(right.suggestion.createdAt ?? ""),
    );
  const rankedCandidates = candidates.filter(({ suggestion }) => {
    const sourceCount = new Set((suggestion.sources ?? []).map((source) => source.chapterId).filter(Boolean)).size;
    return sourceCount > 1 || hasCoreCharacterRole(suggestion) || Boolean(suggestion.importanceOverride);
  });
  const capacity = getCharacterImportanceCapacity(project, rankedCandidates.length);
  const classifiedById = new Map<string, Pick<AiSuggestion, "importanceScore" | "importanceLevel" | "importanceReasons">>();
  candidates.forEach(({ suggestion, score, reasons }) => {
    const index = rankedCandidates.findIndex((candidate) => candidate.suggestion.id === suggestion.id);
    const defaultLevel: AiSuggestionImportanceLevel = index < 0
      ? "minor"
      : index < capacity.main
        ? "main"
        : index < capacity.main + capacity.important
          ? "important"
          : "minor";
    classifiedById.set(suggestion.id, {
      importanceScore: score,
      importanceLevel: suggestion.importanceOverride ?? defaultLevel,
      importanceReasons: reasons,
    });
  });
  return pool.map((suggestion) => ({ ...suggestion, ...(classifiedById.get(suggestion.id) ?? {}) }));
}

function filterCharacterChanges(
  changes: CharacterAnalysisAttribute[] | undefined,
): CharacterAnalysisAttribute[] | undefined {
  const filtered = (changes ?? []).filter(
    (change) => analyzedCharacterAttributeTitleSet.has(change.title) && change.value.trim(),
  );
  return filtered.length ? filtered : undefined;
}

function getCandidateCharacterChanges(
  candidate: ChapterAnalysis["candidateUpdates"]["characters"][number],
  analysis: ChapterAnalysis,
): CharacterAnalysisAttribute[] {
  return Object.entries(candidate.suggestedAttributes ?? []).flatMap(([title, value]) => {
    if (!analyzedCharacterAttributeTitleSet.has(title) || !value.trim()) {
      return [];
    }
    return [{
      title: title as CharacterAnalysisAttribute["title"],
      value,
      evidence: candidate.suggestedAttributeEvidence?.[title] ?? candidate.evidence,
      chapterId: analysis.chapterId,
    }];
  });
}

function getAnalyzedCharacterChanges(
  character: ChapterAnalysis["characters"][number],
  analysis: ChapterAnalysis,
): CharacterAnalysisAttribute[] {
  const changes: CharacterAnalysisAttribute[] = [];
  if ((character.aliases ?? []).length) {
    changes.push({
      title: "姓名与别名",
      value: [character.name, ...(character.aliases ?? [])].join(" / "),
      evidence: `${character.name}以这些称呼出现。`,
      chapterId: analysis.chapterId,
    });
  }
  if (character.role?.trim()) {
    changes.push({
      title: "剧情身份",
      value: character.role,
      evidence: `${character.name}在本章的剧情身份。`,
      chapterId: analysis.chapterId,
    });
  }
  const relationships = (character.relationshipChanges ?? [])
    .filter((item) => item.targetName.trim() && item.change.trim())
    .map((item) => `${item.targetName}：${item.change}`);
  if (relationships.length) {
    changes.push({
      title: "人物关系",
      value: relationships.join("；"),
      evidence: `${character.name}在本章出现了关系变化。`,
      chapterId: analysis.chapterId,
    });
  }
  return changes;
}

function getSuggestionTheme(type: AiSuggestionType, name: string, detail = ""): SuggestionTheme {
  if (getAiSuggestionCategory(type) === "characters") {
    return { key: normalizeName(name) };
  }

  const text = `${name} ${detail}`;
  if (/学校.{0,12}(突围|逃离)|突围行动|夜间突围/.test(text)) {
    return { key: "school-escape", label: "学校突围事件" };
  }
  if (/封城|封锁|隔离|封锁线|军营|军队.{0,8}(检查|封锁)|出口.{0,8}(检查|封锁)/.test(text)) {
    return { key: "city-lockdown", label: "魔都封锁事件" };
  }
  if (/传染|病毒|病原|瘟疫|感染源|呼吸道|血液传播/.test(text)) {
    return { key: "outbreak-origin", label: "魔都传染病真相" };
  }

  const healthSubject = name.match(/^(.{2,8}?)(?:的|.*?)(?:病情|发烧|昏迷|抗体|回光返照|死亡倒计时)/);
  if (healthSubject?.[1]) {
    return { key: `character-state:${normalizeName(healthSubject[1])}`, label: `${healthSubject[1]}的病程变化` };
  }

  return { key: normalizeName(name) };
}

function createCanonicalKey(type: AiSuggestionType, name: string, detail = ""): string {
  return `${type}:${getSuggestionTheme(type, name, detail).key}`;
}

function mergeSources(left: AiSuggestionSource[] = [], right: AiSuggestionSource[] = []): AiSuggestionSource[] {
  const byChapterId = new Map<string, AiSuggestionSource>();
  [...left, ...right].forEach((source) => {
    if (!source.chapterId || byChapterId.has(source.chapterId)) {
      return;
    }
    byChapterId.set(source.chapterId, source);
  });
  return [...byChapterId.values()];
}

function formatSources(sources: AiSuggestionSource[], fallback: string): string {
  if (!sources.length) {
    return fallback;
  }
  const chapterTitles = [...new Set(sources.map((source) => source.chapterTitle).filter(Boolean))];
  const visibleTitles = chapterTitles.slice(0, 3).join("、");
  const remainder = chapterTitles.length > 3 ? `等 ${chapterTitles.length} 章` : "";
  return `来源：${visibleTitles}${remainder ? `、${remainder}` : ""} · AI 深度解析`;
}

function normalizeExistingSuggestion(suggestion: AiSuggestion): AiSuggestion {
  const sourceName = suggestion.targetName ?? suggestion.title;
  const theme = getSuggestionTheme(suggestion.type, sourceName, suggestion.detail);
  const canonicalKey = createCanonicalKey(suggestion.type, sourceName, suggestion.detail);
  const sources = suggestion.sources ?? [];
  return {
    ...suggestion,
    canonicalKey,
    targetName: theme.label ?? suggestion.targetName,
    title:
      theme.label && suggestion.type !== "newCharacter"
        ? `${theme.label} 可能需要记录`
        : suggestion.title,
    sources,
    source: formatSources(sources, suggestion.source),
    characterChanges: filterCharacterChanges(suggestion.characterChanges),
  };
}

function createSuggestion(
  type: AiSuggestionType,
  chapterId: string,
  chapterTitle: string,
  name: string,
  detail: string,
  createdAt: string,
  characterChanges: CharacterAnalysisAttribute[] = [],
): AiSuggestion {
  const label = typeLabels[type];
  const theme = getSuggestionTheme(type, name, detail);
  return {
    id: makeId(type, chapterId, name),
    canonicalKey: createCanonicalKey(type, name, detail),
    type,
    status: "pending",
    title:
      type === "newCharacter"
        ? `${name} 可能是新登场人物`
        : `${theme.label ?? name} 可能需要记录`,
    detail: detail || `AI 在${chapterTitle}里发现了这条${label}。`,
    source: `来源：${chapterTitle} · AI 深度解析`,
    targetName: theme.label ?? name,
    chapterId,
    createdAt,
    sources: [
      {
        chapterId,
        chapterTitle,
        detail: detail || `AI 在${chapterTitle}里发现了这条${label}。`,
        createdAt,
      },
    ],
    characterChanges: characterChanges.length ? characterChanges : undefined,
  };
}

function shouldSkipKnownSuggestion(project: Project, type: AiSuggestionType, name: string, knownKeys: Set<string>): boolean {
  const key = createCanonicalKey(type, name);
  if (knownKeys.has(key)) {
    return false;
  }
  if (type === "newCharacter") {
    return getProjectCharacters(project).some((character) => normalizeName(character.name) === normalizeName(name));
  }
  if (type === "newForeshadowing") {
    return normalizeForeshadowings(project.foreshadowings, project.records).some(
      (item) => normalizeName(item.title) === normalizeName(name),
    );
  }
  return false;
}

function getSavedClueThemeStatus(
  existingClues: AiSuggestion[],
  memberIds: string[],
  sourceDetails: Set<string>,
): AiSuggestionStatus {
  const saved = existingClues.find(
    (suggestion) =>
      suggestion.status !== "pending" &&
      ((suggestion.clueDiagnosisMemberIds ?? []).some((id) => memberIds.includes(id)) ||
        (suggestion.sources ?? []).some((source) => sourceDetails.has(source.detail))),
  );
  return saved?.status ?? "pending";
}

function applyClueDiagnosisToSuggestionPool(project: Project, pool: AiSuggestion[]): AiSuggestion[] {
  const diagnosis = project.clueDiagnosis;
  if (!diagnosis) return pool;

  const candidates = buildClueDiagnosisInput(project);
  if (diagnosis.fingerprint !== getCluePoolFingerprint(candidates)) return pool;

  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const existingClues = pool.filter(
    (suggestion) => getAiSuggestionCategory(suggestion.type) === "clues",
  );
  const diagnosedMemberIds = new Set(diagnosis.themes.flatMap((theme) => theme.memberIds));
  const diagnosedEvidence = new Set(
    diagnosis.themes.flatMap((theme) =>
      theme.memberIds
        .map((id) => candidateById.get(id)?.evidence)
        .filter((evidence): evidence is string => Boolean(evidence)),
    ),
  );
  const themeSuggestions: AiSuggestion[] = diagnosis.themes
    .flatMap((theme): AiSuggestion[] => {
      const members = theme.memberIds
        .map((id) => candidateById.get(id))
        .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));
      if (!members.length) return [];
      const sources = members.map((candidate) => ({
        chapterId: candidate.chapterId,
        chapterTitle: candidate.chapterTitle,
        detail: candidate.evidence,
        createdAt: diagnosis.generatedAt,
      }));
      const uniqueSources = mergeSources([], sources);
      const sourceDetails = new Set(uniqueSources.map((source) => source.detail));
      const status = getSavedClueThemeStatus(existingClues, theme.memberIds, sourceDetails);
      return [{
        id: `ai-suggestion-newForeshadowing-${theme.id}`,
        canonicalKey: `newForeshadowing:diagnosis:${theme.id}`,
        type: "newForeshadowing" as const,
        status,
        title: `${theme.title} 可能需要记录`,
        detail: theme.mergeReason || members[0].summary,
        source: formatSources(uniqueSources, "来源：AI 深度解析"),
        targetName: theme.title,
        chapterId: members[0].chapterId,
        createdAt: diagnosis.generatedAt,
        sources: uniqueSources,
        clueDiagnosisMemberIds: theme.memberIds,
        clueDiagnosisThemeId: theme.id,
        clueDiagnosisTier: theme.tier,
        clueDiagnosisScore: theme.score,
        clueDiagnosisReasons: theme.reasons,
      }];
    })
    .sort((left, right) => (right.clueDiagnosisScore ?? 0) - (left.clueDiagnosisScore ?? 0));

  const preservedHandledClues = existingClues.filter(
    (suggestion) =>
      suggestion.status !== "pending" &&
      !(suggestion.clueDiagnosisMemberIds ?? []).some((id) => diagnosedMemberIds.has(id)) &&
      !(suggestion.sources ?? []).some((source) => diagnosedEvidence.has(source.detail)),
  );
  const nonClues = pool.filter((suggestion) => getAiSuggestionCategory(suggestion.type) !== "clues");
  return [...nonClues, ...themeSuggestions, ...preservedHandledClues];
}

export function mergeAiSuggestionPool(
  existingPool: AiSuggestion[],
  parsedSuggestions: AiSuggestion[],
): AiSuggestion[] {
  const merged: AiSuggestion[] = [];
  const positionByKey = new Map<string, number>();
  const addSuggestion = (suggestion: AiSuggestion) => {
    const existingPosition = positionByKey.get(suggestion.canonicalKey!);
    if (existingPosition === undefined) {
      positionByKey.set(suggestion.canonicalKey!, merged.length);
      merged.push(suggestion);
      return;
    }

    const existing = merged[existingPosition];
    const sources = mergeSources(existing.sources, suggestion.sources);
    merged[existingPosition] = {
      ...existing,
      sources,
      source: formatSources(sources, existing.source),
      characterChanges: mergeCharacterChanges(existing.characterChanges, suggestion.characterChanges),
    };
  };

  existingPool.map(normalizeExistingSuggestion).forEach(addSuggestion);
  parsedSuggestions.map(normalizeExistingSuggestion).forEach(addSuggestion);

  return merged;
}

export function buildAiSuggestionPool(project: Project): AiSuggestion[] {
  const legacySuggestions = mergeAiSuggestionPool(
    project.aiSuggestionPool ?? [],
    project.aiSuggestionQueue ?? [],
  );
  const projectCharacters = getProjectCharacters(project);
  const existingPool = legacySuggestions.map((suggestion) => {
    const identity = getAiSuggestionCategory(suggestion.type) === "characters"
      ? resolveProjectCharacterIdentity(
          { ...project, characters: projectCharacters },
          suggestion.targetName ?? suggestion.title,
          [suggestion.detail, ...(suggestion.sources ?? []).map((source) => source.detail)].join(" "),
        )
      : null;
    const hasMatchingCharacter = identity?.status === "resolved" && projectCharacters.some(
      (character) => character.id === identity.characterId,
    );
    const normalizedIdentitySuggestion = identity?.status === "resolved"
      ? {
          ...suggestion,
          type: "characterUpdate" as const,
          targetName: identity.canonicalName,
          title: `${identity.canonicalName} 可能需要记录`,
          canonicalKey: undefined,
          identityStatus: "resolved" as const,
          identityCandidateIds: undefined,
        }
      : identity?.status === "ambiguous"
        ? {
            ...suggestion,
            identityStatus: "ambiguous" as const,
            identityCandidateIds: identity.candidateCharacterIds,
          }
        : suggestion;
    return normalizeExistingSuggestion(
      normalizedIdentitySuggestion.type === "characterUpdate" && !hasMatchingCharacter
        ? { ...normalizedIdentitySuggestion, type: "newCharacter", canonicalKey: undefined }
        : normalizedIdentitySuggestion,
    );
  });
  const knownKeys = new Set(
    existingPool
      .map((suggestion) => suggestion.canonicalKey)
      .filter((key): key is string => Boolean(key)),
  );
  const generated: AiSuggestion[] = [];

  const add = (
    type: AiSuggestionType,
    chapterId: string,
    chapterTitle: string,
    name: string,
    detail: string,
    identityEvidence: string,
    createdAt: string,
    characterChanges: CharacterAnalysisAttribute[] = [],
    matchedCharacterId?: string | null,
  ) => {
    const identity = getAiSuggestionCategory(type) === "characters"
      ? resolveProjectCharacterIdentity(
          { ...project, characters: projectCharacters },
          name,
          identityEvidence,
          matchedCharacterId,
        )
      : null;
    const normalizedName = identity?.status === "resolved" ? identity.canonicalName : name;
    if (!normalizedName.trim() || shouldSkipKnownSuggestion(project, type, normalizedName, knownKeys)) {
      return;
    }
    const suggestion = createSuggestion(
      identity?.status === "resolved" && projectCharacters.some((character) => character.id === identity.characterId)
        ? "characterUpdate"
        : type,
      chapterId,
      chapterTitle,
      normalizedName,
      detail,
      createdAt,
      characterChanges,
    );
    if (identity) {
      suggestion.identityStatus = identity.status;
      suggestion.identityCandidateIds = identity.status === "ambiguous" ? identity.candidateCharacterIds : undefined;
    }
    const existingPosition = generated.findIndex((item) => item.canonicalKey === suggestion.canonicalKey);
    if (existingPosition < 0) {
      generated.push(suggestion);
      return;
    }
    const existing = generated[existingPosition];
    const sources = mergeSources(existing.sources, suggestion.sources);
    generated[existingPosition] = {
      ...existing,
      sources,
      source: formatSources(sources, existing.source),
      characterChanges: mergeCharacterChanges(existing.characterChanges, suggestion.characterChanges),
    };
  };

  [...(project.chapterAnalyses ?? [])]
    .sort((left, right) => left.chapterIndex - right.chapterIndex)
    .forEach((analysis) => {
      const candidateUpdates = analysis.candidateUpdates ?? { characters: [], clues: [] };
      const timeline = analysis.timeline ?? {};
      const projectCharacters = getProjectCharacters(project);
      const findKnownCharacter = (name: string, matchedCharacterId?: string | null) => {
        const identity = resolveProjectCharacterIdentity(
          { ...project, characters: projectCharacters },
          name,
          "",
          matchedCharacterId,
        );
        return identity.status === "resolved"
          ? projectCharacters.find((character) => character.id === identity.characterId)
          : undefined;
      };

      (candidateUpdates.characters ?? []).forEach((candidate) => {
        const knownCharacter = findKnownCharacter(candidate.name);
        const characterChanges = getCandidateCharacterChanges(candidate, analysis);
        if (knownCharacter && !characterChanges.length) {
          return;
        }
        add(
          knownCharacter ? "characterUpdate" : "newCharacter",
          analysis.chapterId,
          analysis.chapterTitle,
          candidate.name,
          candidate.evidence ?? "这位人物尚未出现在人物资料中。",
          [candidate.evidence, ...Object.values(candidate.suggestedAttributes ?? {})].filter(Boolean).join(" "),
          analysis.updatedAt,
          characterChanges,
        );
      });
      (analysis.characters ?? []).forEach((character) => {
        const characterChanges = getAnalyzedCharacterChanges(character, analysis);
        if (!characterChanges.length) {
          return;
        }
        const knownCharacter = findKnownCharacter(character.name, character.matchedCharacterId);
        add(
          knownCharacter ? "characterUpdate" : "newCharacter",
          analysis.chapterId,
          analysis.chapterTitle,
          character.name,
          `${character.name}的人物资料在本章出现了可确认的补充。`,
          [
            character.role,
            character.stateBefore,
            character.stateAfter,
            character.goal,
            ...(character.relationshipChanges ?? []).flatMap((item) => [item.targetName, item.change]),
          ].filter(Boolean).join(" "),
          analysis.updatedAt,
          characterChanges,
          character.matchedCharacterId,
        );
      });
      (candidateUpdates.clues ?? []).forEach((candidate) => {
        add(
          "newForeshadowing",
          analysis.chapterId,
          analysis.chapterTitle,
          candidate.name,
          candidate.evidence ?? "这条线索可能值得在伏笔资料中留档。",
          candidate.evidence ?? "",
          analysis.updatedAt,
        );
      });
      if (timeline.timeLabel || timeline.sequenceNote) {
        add(
          "timelineEvent",
          analysis.chapterId,
          analysis.chapterTitle,
          `${analysis.chapterTitle}的时间线补充`,
          [timeline.timeLabel, timeline.sequenceNote].filter(Boolean).join(" · "),
          [timeline.timeLabel, timeline.sequenceNote].filter(Boolean).join(" "),
          analysis.updatedAt,
        );
      }
    });

  return applyClueDiagnosisToSuggestionPool(
    project,
    classifyCharacterSuggestionImportance(
      project,
      consolidateGeneratedCharacterSuggestions(mergeAiSuggestionPool(existingPool, generated)),
    ),
  );
}

/** Legacy fixture helper. Runtime candidate generation uses buildAiSuggestionPool. */
export function createInitialAiSuggestionQueue(project: Project): AiSuggestion[] {
  const queue: AiSuggestion[] = [];
  const seen = new Set<string>();
  const analyses = [...(project.chapterAnalyses ?? [])].sort(
    (left, right) => left.chapterIndex - right.chapterIndex,
  );
  const add = (suggestion: AiSuggestion) => {
    if (seen.has(suggestion.id) || queue.length >= 3) {
      return;
    }
    seen.add(suggestion.id);
    queue.push(suggestion);
  };

  analyses.forEach((analysis) => {
    analysis.candidateUpdates.characters.slice(0, 1).forEach((candidate) => {
      if (candidate.name.trim()) {
        add(
          createSuggestion(
            "newCharacter",
            analysis.chapterId,
            analysis.chapterTitle,
            candidate.name,
            candidate.evidence ?? "这位人物尚未出现在人物资料中。",
            analysis.updatedAt,
          ),
        );
      }
    });
    analysis.candidateUpdates.clues.slice(0, 1).forEach((candidate) => {
      if (candidate.name.trim()) {
        add(
          createSuggestion(
            "newForeshadowing",
            analysis.chapterId,
            analysis.chapterTitle,
            candidate.name,
            candidate.evidence ?? "这条线索可能值得在伏笔资料中留档。",
            analysis.updatedAt,
          ),
        );
      }
    });
    if (analysis.timeline.timeLabel || analysis.timeline.sequenceNote) {
      add(
        createSuggestion(
          "timelineEvent",
          analysis.chapterId,
          analysis.chapterTitle,
          `${analysis.chapterTitle}的时间线补充`,
          [analysis.timeline.timeLabel, analysis.timeline.sequenceNote].filter(Boolean).join(" · "),
          analysis.updatedAt,
        ),
      );
    }
  });

  if (queue.length || !project.manuscript?.chapters.length) {
    return queue;
  }

  const chapter = project.manuscript.chapters.at(-1)!;
  const createdAt = chapter.uploadedAt;
  return [
    createSuggestion(
      "newCharacter",
      chapter.id,
      chapter.title,
      `${chapter.title}中的新人物`,
      "这是基于当前章节准备的示例，确认后可以在人物资料中继续补充。",
      createdAt,
    ),
    createSuggestion(
      "newForeshadowing",
      chapter.id,
      chapter.title,
      `${chapter.title}中的未解线索`,
      "这是基于当前章节准备的示例，确认后会进入伏笔资料。",
      createdAt,
    ),
    createSuggestion(
      "timelineEvent",
      chapter.id,
      chapter.title,
      `${chapter.title}的时间线补充`,
      "这段剧情的发生顺序可能需要在时间线中补充。",
      createdAt,
    ),
  ];
}

export function mergeAiSuggestionQueue(
  existingQueue: AiSuggestion[],
  parsedSuggestions: AiSuggestion[],
): AiSuggestion[] {
  const existingIds = new Set(existingQueue.map((suggestion) => suggestion.id));
  return [
    ...existingQueue,
    ...parsedSuggestions.filter((suggestion) => !existingIds.has(suggestion.id)),
  ];
}

export function getAiSuggestionPage<T>(items: T[], requestedPage: number, pageSize = 6) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const start = (page - 1) * pageSize;

  return {
    page,
    totalPages,
    items: items.slice(start, start + pageSize),
  };
}

export function getAiSuggestionPageNumbers(
  requestedPage: number,
  requestedTotalPages: number,
): Array<number | "ellipsis"> {
  const totalPages = Math.max(1, Math.floor(requestedTotalPages));
  const page = Math.min(Math.max(1, Math.floor(requestedPage)), totalPages);
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages: Array<number | "ellipsis"> = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);
  if (start > 2) {
    pages.push("ellipsis");
  }
  for (let candidate = start; candidate <= end; candidate += 1) {
    pages.push(candidate);
  }
  if (end < totalPages - 1) {
    pages.push("ellipsis");
  }
  pages.push(totalPages);
  return pages;
}

export function updateAiSuggestionStatus(
  queue: AiSuggestion[],
  id: string,
  status: AiSuggestionStatus,
): AiSuggestion[] {
  return queue.map((suggestion) => (suggestion.id === id ? { ...suggestion, status } : suggestion));
}

export function applyAcceptedAiSuggestion(project: Project, suggestion: AiSuggestion) {
  const targetName = suggestion.targetName?.trim();
  if (!targetName) {
    return { project, didCreate: false };
  }

  if (suggestion.type === "newCharacter" || suggestion.type === "characterUpdate") {
    const characters = getProjectCharacters(project);
    const identity = resolveProjectCharacterIdentity(
      { ...project, characters },
      targetName,
      [suggestion.detail, ...(suggestion.sources ?? []).map((source) => source.detail)].join(" "),
    );
    if (identity.status === "ambiguous") {
      return { project, didCreate: false, needsIdentityReview: true };
    }
    const existingCharacter = identity.status === "resolved"
      ? characters.find((character) => character.id === identity.characterId)
      : undefined;
    if (existingCharacter) {
      const synced = syncAnalyzedCharacterAttributes(
        characters,
        existingCharacter.id,
        suggestion.characterChanges ?? [],
      );
      return {
        project: { ...project, characters: synced.characters },
        didCreate: false,
        skippedTitles: synced.skippedTitles,
      };
    }
    const addedCharacters = addCharacter(characters);
    const createdCharacter = addedCharacters[addedCharacters.length - 1];
    const namedCharacters = updateCharacterBase(addedCharacters, createdCharacter.id, { name: targetName });
    const synced = syncAnalyzedCharacterAttributes(
      namedCharacters,
      createdCharacter.id,
      suggestion.characterChanges ?? [],
    );
    return {
      project: {
        ...project,
        characters: synced.characters,
      },
      didCreate: true,
      skippedTitles: synced.skippedTitles,
    };
  }

  if (suggestion.type === "newForeshadowing") {
    const foreshadowings = normalizeForeshadowings(project.foreshadowings, project.records);
    if (foreshadowings.some((item) => sameName(item.title, targetName))) {
      return { project, didCreate: false };
    }
    return {
      project: {
        ...project,
        foreshadowings: addForeshadowing(foreshadowings, {
          title: targetName,
          status: "unresolved",
          setupChapterIds: suggestion.chapterId ? [suggestion.chapterId] : [],
          payoffChapterIds: [],
          characterIds: [],
          summary: suggestion.detail,
          plan: "等待作者安排回收时机。",
          result: "",
          tagsText: "AI建议",
        }),
      },
      didCreate: true,
    };
  }

  return { project, didCreate: false };
}

export function getAiSuggestionTypeLabel(type: AiSuggestionType): string {
  return typeLabels[type];
}

export function getAiSuggestionSummary(project: Project) {
  const byType = Object.fromEntries(typeOrder.map((type) => [type, 0])) as Record<
    AiSuggestionType,
    number
  >;
  const queue = project.aiSuggestionPool ?? project.aiSuggestionQueue ?? [];
  const pending = queue.filter(
    (suggestion) =>
      suggestion.status === "pending" &&
      (getAiSuggestionCategory(suggestion.type) !== "clues" ||
        getClueSuggestionTier(suggestion) === "priority"),
  );
  pending.forEach((suggestion) => {
    byType[suggestion.type] += 1;
  });
  const typeLabel = typeOrder
    .filter((type) => byType[type])
    .map((type) => typeSummaryLabels[type](byType[type]))
    .join(" · ");

  return {
    byType,
    pendingCount: pending.length,
    laterCount: queue.filter((suggestion) => suggestion.status === "later").length,
    typeLabel,
  };
}
