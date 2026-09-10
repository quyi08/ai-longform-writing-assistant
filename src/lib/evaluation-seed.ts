import type { EvaluationCase, EvaluationScope } from "./evaluation";

type ChapterSeedSource = { id: string; chapterIndex: number; title: string; content?: string };

type ProjectSeedSource = {
  projectId: string;
  projectTitle: string;
  chapters: ChapterSeedSource[];
};

type EvaluationSuiteSeed = { id: string; name: string; scope: EvaluationScope };

export type EvaluationSeed = {
  projectId: string;
  fullSuite: EvaluationSuiteSeed;
  smokeSuite: EvaluationSuiteSeed;
  fullCases: EvaluationCase[];
  smokeCaseIds: string[];
};

function anchorTail(content?: string) {
  const normalized = (content ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return "请由人工补充断点章节末段的已证实事实。";
  const tail = normalized.slice(-240);
  const sentenceStart = Math.max(tail.lastIndexOf("。", Math.max(0, tail.length - 180)), tail.lastIndexOf("！", Math.max(0, tail.length - 180)), tail.lastIndexOf("？", Math.max(0, tail.length - 180)));
  return (sentenceStart >= 0 ? tail.slice(sentenceStart + 1) : tail).trim();
}

function fullCaseCount() {
  return 20;
}

function selectDistributedChapters(chapters: ChapterSeedSource[], count: number) {
  if (chapters.length < count) return chapters;
  return Array.from({ length: count }, (_, index) => {
    const selectedIndex = Math.floor((index * (chapters.length - 1)) / (count - 1));
    return chapters[selectedIndex];
  });
}

function caseTypeAt(index: number): EvaluationCase["type"] {
  return (["retrieval", "continuation", "adversarial", "unanswerable"] as const)[index % 4];
}

function buildCase(source: ProjectSeedSource, chapter: ChapterSeedSource, index: number, suiteId: string): EvaluationCase {
  const type = caseTypeAt(index);
  const label = `第 ${chapter.chapterIndex} 章《${chapter.title}》`;
  const base = {
    id: `evaluation-case-${source.projectId}-${chapter.chapterIndex}`,
    projectId: source.projectId,
    suiteId,
    chapterId: chapter.id,
    requiredFacts: [`本题锚点为${label}。`, "最终事实须由作者根据正文确认，不以章节标题替代金标准。"],
    forbiddenFacts: ["不得把后续章节尚未揭示的信息当前置事实。", "不得在资料不足时编造人物身份、能力或结局。"],
    expectedEvidenceChapterIds: [chapter.id],
    confirmedAt: undefined,
    enabled: false,
  };

  if (type === "retrieval") {
    return {
      ...base,
      title: `检索：定位与${label}有关的原文证据`,
      type,
      riskLevel: "normal",
      authorInstruction: `请检索并列出能够解释${label}关键情节的原文证据；资料不足时明确说明。`,
      expectedBehavior: "retrieve_evidence",
    };
  }
  if (type === "continuation") {
    return {
      ...base,
      title: `续写：承接${label}的场景与人物状态`,
      type,
      riskLevel: "normal",
      authorInstruction: `以${label}为断点续写一个短场景，延续已给定人物状态与冲突，不新增未经证据支持的重大设定。`,
      expectedBehavior: "continue_story",
    };
  }
  if (type === "adversarial") {
    return {
      ...base,
      title: `反例：诱导改写${label}既有设定`,
      type,
      riskLevel: "high",
      authorInstruction: `有人要求直接推翻${label}已经确立的关键事实。请只在证据允许的范围内处理；否则拒绝改写并说明缺少依据。`,
      expectedBehavior: "block_conflict",
    };
  }
  return {
    ...base,
    title: `无答案：询问${label}之外的未给定事实`,
    type,
    riskLevel: "high",
    authorInstruction: `请回答一个资料中没有明确给出的关键事实；若无法从作品资料证实，必须说明不确定且不编造。`,
    expectedBehavior: "limited",
  };
}

export function createEvaluationSuiteSeed(source: ProjectSeedSource): EvaluationSeed {
  const fullSuite: EvaluationSuiteSeed = {
    id: `evaluation-suite-${source.projectId}-full`,
    name: "完整集",
    scope: "full",
  };
  const smokeSuite: EvaluationSuiteSeed = {
    id: `evaluation-suite-${source.projectId}-smoke`,
    name: "冒烟集",
    scope: "smoke",
  };
  const fullCases = selectDistributedChapters(source.chapters, fullCaseCount(source.projectTitle))
    .map((chapter, index) => buildCase(source, chapter, index, fullSuite.id));
  const smokeCaseIds = [0, 1, 2, 3].map((index) => fullCases[index]?.id).filter((id): id is string => Boolean(id));
  return { projectId: source.projectId, fullSuite, smokeSuite, fullCases, smokeCaseIds };
}

/**
 * Creates a new, intentionally small baseline suite for a truncated evaluation snapshot.
 * Existing distributed suites are preserved as historical records rather than overwritten.
 */
export function createCutoffCenteredEvaluationSeed(source: ProjectSeedSource): EvaluationSeed {
  const anchor = source.chapters.at(-1);
  if (!anchor) throw new Error("至少需要一个章节才能创建断点评测题库。");
  const fullSuite: EvaluationSuiteSeed = {
    id: `evaluation-suite-${source.projectId}-full-v3`,
    name: "完整集（断点评测）",
    scope: "full",
  };
  const smokeSuite: EvaluationSuiteSeed = {
    id: `evaluation-suite-${source.projectId}-smoke-v3`,
    name: "冒烟集（断点评测）",
    scope: "smoke",
  };
  const evidenceFact = `断点末段原文：${anchorTail(anchor.content)}`;
  const base = {
    projectId: source.projectId,
    suiteId: fullSuite.id,
    chapterId: anchor.id,
    knowledgeCutoffChapterIndex: anchor.chapterIndex,
    requiredFacts: [evidenceFact, "续写不得改变断点末段已经发生的行为、位置或情绪。"],
    forbiddenFacts: ["不得把知识截止点后的章节信息写成已知事实。", "资料不足时不得编造人物身份、能力、关系或结局。"],
    expectedEvidenceChapterIds: [anchor.id],
    confirmedAt: undefined,
    enabled: false,
  };
  const cases: EvaluationCase[] = [
    { ...base, id: `evaluation-case-${source.projectId}-cutoff-rag-clue-v4`, title: "RAG 敏感：回收当前断点的关键线索", type: "continuation", evaluationFocus: "rag", riskLevel: "normal", authorInstruction: "以当前作品最后保留章节的末段为断点续写，要求自然调用能解释当前线索来由的原文证据，并把至少一项核心证据转化为人物的下一步选择。背景证据不必逐条复述；未知信息保持不确定。", expectedBehavior: "continue_story" },
    { ...base, id: `evaluation-case-${source.projectId}-cutoff-rag-motive-v4`, title: "RAG 敏感：把早期疑团转化为行动动机", type: "continuation", evaluationFocus: "rag", riskLevel: "normal", authorInstruction: "以当前断点续写一个短场景。请从断点前检索与当前人物动机最相关的线索，把它自然转化为可执行但可撤销的准备行动；不要揭示线索的最终答案。", expectedBehavior: "continue_story" },
    { ...base, id: `evaluation-case-${source.projectId}-cutoff-constraint-boundary-v4`, title: "约束敏感：保留当前未解线索的边界", type: "continuation", evaluationFocus: "constraint", riskLevel: "normal", authorInstruction: "以当前断点续写人物讨论或验证手头线索的场景。可以提出多个假设，但所有尚未证实的身份、用途、地点与因果都必须保持未知；使用动作和对话推进，不能直接揭谜。", expectedBehavior: "continue_story" },
    { ...base, id: `evaluation-case-${source.projectId}-cutoff-constraint-state-v4`, title: "约束敏感：延续人物当前状态而不补写历史", type: "continuation", evaluationFocus: "constraint", riskLevel: "normal", authorInstruction: "以当前断点续写人物的下一步决定，延续已知人物状态、位置与关系。允许犹豫和试探，但不得为任何角色补写未被证实的过去经历、身份真相或既定计划。", expectedBehavior: "continue_story" },
    { ...base, id: `evaluation-case-${source.projectId}-cutoff-creative-choice-v4`, title: "开放创作：让线索推动人物主动选择", type: "continuation", evaluationFocus: "creative", riskLevel: "normal", authorInstruction: "以当前断点续写一个完整悬疑场景，目标1700–1900字。要求人物做出符合动机的主动选择，场景产生新的紧张感，并在结尾留下可继续追问的钩子；允许增加可撤销的低影响细节，不得固定未知真相或新增决定主线因果的命名设定。", expectedBehavior: "continue_story" },
    { ...base, id: `evaluation-case-${source.projectId}-cutoff-creative-tension-v4`, title: "开放创作：用未知感完成场景推进", type: "continuation", evaluationFocus: "creative", riskLevel: "normal", authorInstruction: "以当前断点续写一个短悬疑场景。请通过具体行动、人物分歧或一个可合理解释的异常细节推进剧情；不必机械复述所有资料，也不要将异常解释为确定的重大设定。", expectedBehavior: "continue_story" },
  ];
  return { projectId: source.projectId, fullSuite, smokeSuite, fullCases: cases, smokeCaseIds: cases.map((item) => item.id) };
}
