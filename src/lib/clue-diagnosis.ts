import type {
  ClueDiagnosisCandidate,
  ClueDiagnosisKind,
  ClueDiagnosisResult,
  ClueDiagnosisState,
  ClueDiagnosisTheme,
  ClueDiagnosisTier,
  Project,
} from "./knowledge";

type RawTheme = {
  title?: unknown;
  memberIds?: unknown;
  kind?: unknown;
  state?: unknown;
  mergeReason?: unknown;
  needsHumanReview?: unknown;
};

export type ValidatedClueTheme = Omit<ClueDiagnosisTheme, "score" | "tier" | "reasons">;

export type ValidatedClueDiagnosis = {
  themes: ValidatedClueTheme[];
};

export type ClueScoreContext = {
  project: Project;
  candidates: ClueDiagnosisCandidate[];
};

const diagnosisKinds: ClueDiagnosisKind[] = [
  "主线谜团",
  "人物秘密",
  "危机限制",
  "待回收承诺",
  "背景细节",
];
const diagnosisStates: ClueDiagnosisState[] = ["未解", "推进中", "已回收", "仅背景"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asTrimmedString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function slug(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "clue";
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeConfidence(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? clamp(value, 0, 1) : 0.5;
}

function inferImportance(confidence: number): ClueDiagnosisCandidate["importance"] {
  if (confidence >= 0.8) return "major";
  if (confidence >= 0.6) return "medium";
  return "minor";
}

function makeCandidateId(chapterId: string, source: string, name: string, index: number): string {
  return `clue-candidate-${chapterId}-${source}-${slug(name)}-${index + 1}`;
}

function hasExistingForeshadowing(project: Project, name: string): boolean {
  const normalizedName = name.trim().toLocaleLowerCase();
  return (project.foreshadowings ?? []).some(
    (item) => item.title.trim().toLocaleLowerCase() === normalizedName,
  );
}

/** Builds the smallest traceable input accepted by the global clue diagnosis. */
export function buildClueDiagnosisInput(project: Project): ClueDiagnosisCandidate[] {
  const candidates: ClueDiagnosisCandidate[] = [];

  [...(project.chapterAnalyses ?? [])]
    .sort((left, right) => left.chapterIndex - right.chapterIndex)
    .forEach((analysis) => {
      (analysis.candidateUpdates?.clues ?? []).forEach((candidate, index) => {
        const name = candidate.name?.trim();
        if (!name || hasExistingForeshadowing(project, name)) return;
        const confidence = normalizeConfidence(candidate.confidence);
        const evidence = candidate.evidence?.trim() || "这条线索可能值得在伏笔资料中留档。";
        candidates.push({
          id: makeCandidateId(analysis.chapterId, "candidate", name, index),
          name,
          summary: evidence,
          evidence,
          chapterId: analysis.chapterId,
          chapterIndex: analysis.chapterIndex,
          chapterTitle: analysis.chapterTitle,
          relatedCharacters: [],
          importance: inferImportance(confidence),
          confidence,
        });
      });

      (analysis.clues?.mentions ?? []).forEach((mention, index) => {
        const name = mention.name?.trim();
        if (!name || hasExistingForeshadowing(project, name)) return;
        const confidence = normalizeConfidence(mention.confidence);
        candidates.push({
          id: makeCandidateId(analysis.chapterId, "mention", name, index),
          name,
          summary: mention.summary?.trim() || mention.evidence?.trim() || "章节中出现了待确认线索。",
          evidence: mention.evidence?.trim() || mention.summary?.trim() || "章节中出现了待确认线索。",
          chapterId: analysis.chapterId,
          chapterIndex: analysis.chapterIndex,
          chapterTitle: analysis.chapterTitle,
          relatedCharacters: unique(mention.relatedCharacters ?? []),
          importance: mention.importance ?? inferImportance(confidence),
          confidence,
        });
      });
    });

  return candidates;
}

function asKind(value: unknown): ClueDiagnosisKind {
  return diagnosisKinds.includes(value as ClueDiagnosisKind) ? (value as ClueDiagnosisKind) : "主线谜团";
}

function asState(value: unknown): ClueDiagnosisState {
  return diagnosisStates.includes(value as ClueDiagnosisState) ? (value as ClueDiagnosisState) : "未解";
}

function makeThemeId(memberIds: string[]): string {
  return `clue-theme-${slug([...memberIds].sort().join("-"))}`;
}

function makeFallbackTheme(candidate: ClueDiagnosisCandidate): ValidatedClueTheme {
  return {
    id: makeThemeId([candidate.id]),
    title: candidate.name,
    memberIds: [candidate.id],
    kind: "主线谜团",
    state: "未解",
    mergeReason: "尚未与其他章节的候选可靠合并，保留为独立记录。",
    needsHumanReview: true,
    sourceChapterIds: [candidate.chapterId],
  };
}

/** Removes invented or duplicate IDs while preserving every ungrouped local candidate. */
export function validateClueDiagnosis(
  candidates: ClueDiagnosisCandidate[],
  response: unknown,
): ValidatedClueDiagnosis {
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const usedIds = new Set<string>();
  const rawThemes = isRecord(response) && Array.isArray(response.themes) ? response.themes : [];
  const themes: ValidatedClueTheme[] = [];

  rawThemes.forEach((rawTheme) => {
    if (!isRecord(rawTheme)) return;
    const raw = rawTheme as RawTheme;
    const themeIds = new Set<string>();
    const memberIds = (Array.isArray(raw.memberIds) ? raw.memberIds : [])
      .filter((id): id is string => {
        if (
          typeof id !== "string" ||
          !candidateById.has(id) ||
          usedIds.has(id) ||
          themeIds.has(id)
        ) {
          return false;
        }
        themeIds.add(id);
        return true;
      });
    if (!memberIds.length) return;
    memberIds.forEach((id) => usedIds.add(id));
    const members = memberIds.map((id) => candidateById.get(id)!);
    const title = asTrimmedString(raw.title, members[0].name);
    themes.push({
      id: makeThemeId(memberIds),
      title,
      memberIds,
      kind: asKind(raw.kind),
      state: asState(raw.state),
      mergeReason: asTrimmedString(raw.mergeReason, "已根据跨章内容归并为同一主题。"),
      needsHumanReview: raw.needsHumanReview !== false,
      sourceChapterIds: unique(members.map((member) => member.chapterId)),
    });
  });

  candidates.forEach((candidate) => {
    if (!usedIds.has(candidate.id)) themes.push(makeFallbackTheme(candidate));
  });

  return { themes };
}

export function getClueThemeTier(score: number): ClueDiagnosisTier {
  if (score >= 70) return "priority";
  if (score >= 45) return "watch";
  return "record";
}

function isBackgroundText(value: string): boolean {
  return /(灯光|天气|雨声|风声|走廊|街景|气氛|情绪|普通|桌子|杯子)/.test(value);
}

function isUnresolvedText(value: string): boolean {
  return /(未知|未解|真相|来源|秘密|危险|威胁|承诺|线索|疑问|失踪|异常|感染|病毒|谜)/.test(value);
}

function scoreOneTheme(
  theme: ValidatedClueTheme,
  context: ClueScoreContext,
): ClueDiagnosisTheme {
  const candidateById = new Map(context.candidates.map((candidate) => [candidate.id, candidate]));
  const members = theme.memberIds.map((id) => candidateById.get(id)).filter(Boolean) as ClueDiagnosisCandidate[];
  const chapterCount = unique(members.map((member) => member.chapterId)).length;
  const allText = `${theme.title} ${theme.mergeReason} ${members.map((member) => `${member.name} ${member.summary} ${member.evidence}`).join(" ")}`;
  const reasons: string[] = [];
  let score = 0;

  if (chapterCount >= 3) {
    score += 28;
    reasons.push(`跨 ${chapterCount} 章出现`);
  } else if (chapterCount === 2) {
    score += 18;
    reasons.push("跨 2 章出现");
  }

  if (theme.state === "未解" || theme.state === "推进中" || isUnresolvedText(allText)) {
    score += 18;
    reasons.push(theme.state === "推进中" ? "仍在推进" : "尚未解释");
  }

  const relatedCharacters = unique(members.flatMap((member) => member.relatedCharacters));
  if (relatedCharacters.length >= 2) {
    score += 14;
    reasons.push("关联多位关键人物");
  }

  const lastChapterIndex = Math.max(0, ...(context.project.chapterAnalyses ?? []).map((analysis) => analysis.chapterIndex));
  const recent = members.some((member) => member.chapterIndex >= lastChapterIndex - 2);
  const goal = context.project.currentChapterGoal;
  const goalText = goal ? `${goal.plot} ${goal.characterChange} ${goal.conflict} ${goal.foreshadowing} ${goal.endingHook}` : "";
  if (recent || (goalText && allText.includes(goalText.slice(0, 8)))) {
    score += 12;
    reasons.push(recent ? "与最近剧情相关" : "与本章目标相关");
  }

  const averageConfidence = members.length
    ? members.reduce((total, member) => total + member.confidence, 0) / members.length
    : 0;
  const evidenceScore = Math.round(averageConfidence * 12);
  score += evidenceScore;
  if (evidenceScore >= 8) reasons.push("证据较充分");

  if (theme.kind !== "背景细节" && theme.state !== "仅背景") {
    score += 16;
  }

  if (theme.state === "已回收") score -= 40;
  if (chapterCount === 1 && !/(后续|回收|将会|继续|再次)/.test(allText)) score -= 10;
  if (theme.kind === "背景细节" || theme.state === "仅背景" || isBackgroundText(allText)) score -= 20;
  if (averageConfidence < 0.55 || !members.some((member) => member.evidence.trim())) score -= 15;

  const finalScore = clamp(Math.round(score), 0, 100);
  return {
    ...theme,
    score: finalScore,
    tier: getClueThemeTier(finalScore),
    reasons,
  };
}

/** Scores themes locally so a model cannot decide which author task is important. */
export function scoreClueThemes(
  themes: ValidatedClueTheme[],
  context: ClueScoreContext,
): ClueDiagnosisTheme[] {
  const scored = themes.map((theme) => scoreOneTheme(theme, context));
  const priority = scored
    .filter((theme) => theme.tier === "priority")
    .sort((left, right) => right.score - left.score);
  priority.slice(15).forEach((theme) => {
    theme.tier = "watch";
    theme.reasons = [...theme.reasons, "优先确认区已满，暂列继续观察"];
  });
  return scored.sort((left, right) => right.score - left.score);
}

function ruleKey(candidate: ClueDiagnosisCandidate): string {
  const text = `${candidate.name} ${candidate.summary}`;
  if (/(传染|病毒|病原|感染源|瘟疫)/.test(text)) return "outbreak-origin";
  if (/(封城|封锁|隔离|封锁线|出口检查)/.test(text)) return "city-lockdown";
  return slug(candidate.name);
}

/** Deterministic fallback used when AI_DIAGNOSIS is unavailable. */
export function createRuleBasedClueDiagnosis(project: Project): ClueDiagnosisResult {
  const candidates = buildClueDiagnosisInput(project);
  const groups = new Map<string, ClueDiagnosisCandidate[]>();
  candidates.forEach((candidate) => {
    const key = ruleKey(candidate);
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  });
  const validated = validateClueDiagnosis(candidates, {
    themes: [...groups.values()].map((members) => ({
      title: members[0].name,
      memberIds: members.map((member) => member.id),
      kind: isBackgroundText(`${members[0].name} ${members[0].summary}`) ? "背景细节" : "主线谜团",
      state: "未解",
      mergeReason: members.length > 1 ? "根据相近主题和跨章证据自动合并。" : "规则整理保留为独立主题。",
      needsHumanReview: true,
    })),
  });
  return {
    fingerprint: getCluePoolFingerprint(candidates),
    generatedAt: new Date().toISOString(),
    mode: "fallback",
    themes: scoreClueThemes(validated.themes, { project, candidates }),
  };
}

export function getCluePoolFingerprint(candidates: ClueDiagnosisCandidate[]): string {
  const input = candidates
    .map((candidate) => `${candidate.id}|${candidate.name}|${candidate.summary}|${candidate.confidence}`)
    .sort()
    .join("\n");
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `clue-${(hash >>> 0).toString(36)}`;
}
