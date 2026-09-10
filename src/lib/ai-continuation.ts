import type { CharacterProfile, Project, RelationshipGraph } from "./knowledge";
import {
  buildContinuationGrounding,
  type ContinuationGroundingReport,
} from "./continuation-grounding";
import type { RetrievalEvidence } from "./server/retrieval-service";

export type AiContinuationLength = 1000 | 3000 | 10000;

export type AiContinuationCreativeAnswers = {
  foreshadowingToPayoff: string;
  newHooks: string;
  characterHighlights: string;
  mustHaveOrAvoid: string;
  needDirectionOptions: boolean;
};

export type AiContinuationContext = {
  projectProfile: string;
  recentManuscriptText: string;
  chapterNotes: string[];
  outlineNotes: string[];
  characterNotes: string[];
  clueNotes: string[];
  foreshadowingNotes: string[];
  userInstruction: string;
  ragReferences: string[];
  grounding: ContinuationGroundingReport;
  factConstraintNotes: string[];
};

export type AiContinuationReport = {
  usedMaterials: string[];
  outlineHits: string[];
  characterHits: string[];
  foreshadowingHits: string[];
  warnings: string[];
  grounding: ContinuationGroundingReport;
  sourcePreview: ContinuationGroundingReport["factSources"];
};

export type AiContinuationSegment = {
  index: number;
  targetLength: number;
};

export type BuildAiContinuationContextInput = {
  targetLength: AiContinuationLength;
  userInstruction: string;
  creativeAnswers?: Partial<AiContinuationCreativeAnswers>;
  recentTextLimit?: number;
  retrievalEvidence?: RetrievalEvidence[];
};

const defaultRecentTextLimit = 8000;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function compactText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function getRecentManuscriptText(project: Project, limit: number) {
  const text = (project.manuscript?.chapters ?? [])
    .map((chapter) => `${chapter.title}\n${chapter.content}`)
    .join("\n\n");
  const compact = compactText(text);

  return compact.length > limit ? compact.slice(-limit) : compact;
}

function formatCharacterAttribute(character: CharacterProfile) {
  const attributes = character.attributes
    .map((attribute) => `${attribute.title}:${attribute.value}`)
    .filter(Boolean)
    .join("；");

  return attributes ? `；属性：${attributes}` : "";
}

function formatRelationshipNotes(graph: RelationshipGraph, characterNameById: Map<string, string>) {
  const nodeNameById = new Map(
    graph.nodes.map((node) => [node.id, characterNameById.get(node.characterId) ?? "未知人物"]),
  );

  return (graph.relations ?? []).map((relation) => {
    const from = nodeNameById.get(relation.fromNodeId) ?? "未知人物";
    const to = nodeNameById.get(relation.toNodeId) ?? "未知人物";
    const arrow = relation.direction === "double" ? "<->" : "->";
    return `人物关系《${graph.title}》：${from} ${arrow} ${to}，关系：${relation.label || "未命名"}`;
  });
}

function formatCreativeAnswers(input: BuildAiContinuationContextInput) {
  const answers = input.creativeAnswers;
  if (!answers) {
    return input.userInstruction.trim();
  }

  return [
    input.userInstruction.trim(),
    answers.foreshadowingToPayoff ? `需要回收的伏笔：${answers.foreshadowingToPayoff}` : "",
    answers.newHooks ? `新增铺垫或钩子：${answers.newHooks}` : "",
    answers.characterHighlights ? `人物高光：${answers.characterHighlights}` : "",
    answers.mustHaveOrAvoid ? `必须发生或禁止发生：${answers.mustHaveOrAvoid}` : "",
    answers.needDirectionOptions ? "先规划多个续写方向，再选择最适合的一条展开。" : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildAiContinuationContext(
  project: Project,
  input: BuildAiContinuationContextInput,
): AiContinuationContext {
  const characterNameById = new Map((project.characters ?? []).map((character) => [character.id, character.name]));
  const recentManuscriptText = getRecentManuscriptText(project, input.recentTextLimit ?? defaultRecentTextLimit);
  const userInstruction = formatCreativeAnswers(input);
  const grounding = buildContinuationGrounding(project, {
    recentManuscriptText,
    userInstruction,
    retrievalEvidence: input.retrievalEvidence,
  });

  return {
    projectProfile: [
      `小说：${project.title}`,
      `类型：${project.genre || "未设置"}`,
      `简介：${project.synopsis || "未设置"}`,
      `目标字数：${project.targetWordCount || 0}`,
      `本次续写目标：约${input.targetLength}字`,
    ].join("\n"),
    recentManuscriptText,
    chapterNotes: (project.manuscript?.chapters ?? []).map(
      (chapter, index) => `第${index + 1}章：${chapter.title}；片段：${compactText(chapter.content).slice(0, 120)}`,
    ),
    outlineNotes: (project.outlineParts ?? []).map(
      (part, index) =>
        `PART ${index + 1} ${part.title}：${part.summary || "暂无概要"}；关联章节数：${part.chapterIds.length}；关联人物数：${part.characterIds.length}`,
    ),
    characterNotes: (project.characters ?? []).map(
      (character) =>
        `${character.name}；性别：${character.gender || "未设置"}；口头禅：${character.catchphrase || "未设置"}${formatCharacterAttribute(character)}`,
    ),
    clueNotes: [
      ...(project.clueBoards ?? []).flatMap((board) =>
        board.nodes.map((node) => `思维导图《${board.title}》：${node.title}；${node.detail || "暂无简介"}`),
      ),
      ...(project.relationshipGraphs ?? []).flatMap((graph) => formatRelationshipNotes(graph, characterNameById)),
    ],
    foreshadowingNotes: (project.foreshadowings ?? []).map(
      (item) =>
        `${item.title}；状态：${item.status}；埋设章节数：${item.setupChapterIds.length}；回收章节数：${item.payoffChapterIds.length}；概要：${item.summary || "暂无"}；计划：${item.plan || "暂无"}`,
    ),
    userInstruction,
    ragReferences: grounding.retrievalSources.map(
      (source) => `${source.label}：${source.summary}`,
    ),
    grounding,
    factConstraintNotes: grounding.factSources.map(
      (source) => `${source.label}：${source.summary}`,
    ),
  };
}

export function createContinuationSegments(targetLength: AiContinuationLength): AiContinuationSegment[] {
  if (targetLength === 1000) {
    return [{ index: 1, targetLength: 1000 }];
  }

  if (targetLength === 3000) {
    return [
      { index: 1, targetLength: 1500 },
      { index: 2, targetLength: 1500 },
    ];
  }

  return Array.from({ length: 5 }, (_, index) => ({
    index: index + 1,
    targetLength: 2000,
  }));
}

export function appendContinuationToLastChapter(project: Project, text: string): Project {
  const chapters = project.manuscript?.chapters ?? [];
  if (!chapters.length) {
    return project;
  }

  const nextChapters = chapters.map((chapter, index) =>
    index === chapters.length - 1
      ? {
          ...chapter,
          content: `${chapter.content.trimEnd()}\n\n${text.trim()}`,
          uploadedAt: today(),
        }
      : chapter,
  );

  return {
    ...project,
    manuscript: {
      ...project.manuscript!,
      chapters: nextChapters,
      parseStatus: project.manuscript?.parseStatus ?? "parsed",
    },
  };
}

export function saveContinuationAsNextChapter(project: Project, title: string, text: string): Project {
  const chapters = project.manuscript?.chapters ?? [];
  const createdAt = today();
  const nextChapter = {
    id: `chapter-ai-${Date.now().toString(36)}`,
    title: title.trim() || `第${chapters.length + 1}章`,
    content: text.trim(),
    uploadedAt: createdAt,
  };

  return {
    ...project,
    manuscript: {
      ...(project.manuscript ?? { chapters: [], parseStatus: "parsed" as const }),
      parseStatus: "parsed",
      chapters: [...chapters, nextChapter],
    },
  };
}
