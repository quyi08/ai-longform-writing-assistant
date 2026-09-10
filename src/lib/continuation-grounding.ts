import type { Project } from "./knowledge";
import { selectConstraintsForContinuation } from "./constraint-selection";
import type { RetrievalEvidence } from "./server/retrieval-service";

export type ContinuationGroundingMode = "grounded" | "limited";

export type ContinuationGroundingSource = {
  kind: "author" | "recent" | "locked" | "confirmed" | "retrieval";
  label: string;
  summary: string;
  sourceId?: string;
};

export type ContinuationGroundingReport = {
  mode: ContinuationGroundingMode;
  score: number;
  coverage: {
    recentManuscript: boolean;
    authorInstruction: boolean;
    lockedConstraints: boolean;
    retrievalEvidence: boolean;
  };
  gaps: string[];
  factSources: ContinuationGroundingSource[];
  retrievalSources: ContinuationGroundingSource[];
};

export type ContinuationGroundingInput = {
  recentManuscriptText: string;
  userInstruction: string;
  retrievalEvidence?: RetrievalEvidence[];
};

const retrievalScoreFloor = 0.4;

function compact(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function getFactSources(project: Project, input: ContinuationGroundingInput): ContinuationGroundingSource[] {
  const selected = selectConstraintsForContinuation(project, {
    chapterIndex: project.manuscript?.chapters.length ?? 1,
    userInstruction: input.userInstruction,
    recentManuscriptText: input.recentManuscriptText,
    retrievalEvidence: (input.retrievalEvidence ?? []).map((item) => item.content),
  });
  return selected.selected.map((item) => ({ kind: "locked" as const, label: item.label, summary: item.text, sourceId: item.id }));
}

function getRetrievalSources(evidence: RetrievalEvidence[]): ContinuationGroundingSource[] {
  return evidence
    .filter((item) => item.score >= retrievalScoreFloor && compact(item.content))
    .map((item) => ({
      kind: "retrieval" as const,
      label: `第 ${item.chapterIndex} 章 · ${item.chapterTitle}`,
      summary: compact(item.content).slice(0, 280),
      sourceId: item.chunkId,
    }));
}

export function buildContinuationGrounding(
  project: Project,
  input: ContinuationGroundingInput,
): ContinuationGroundingReport {
  const factSources = getFactSources(project, input);
  const retrievalSources = getRetrievalSources(input.retrievalEvidence ?? []);
  const coverage = {
    recentManuscript: Boolean(compact(input.recentManuscriptText)),
    authorInstruction: Boolean(compact(input.userInstruction)),
    lockedConstraints: factSources.some((source) => source.kind === "locked"),
    retrievalEvidence: retrievalSources.length >= 2,
  };
  const score = Math.min(
    100,
    (coverage.recentManuscript ? 25 : 0)
      + (coverage.authorInstruction ? 10 : 0)
      + (coverage.lockedConstraints ? 25 : 0)
      + (coverage.retrievalEvidence ? 40 : 0),
  );
  const gaps = [
    !coverage.recentManuscript ? "缺少近期正文，无法可靠承接上一段剧情。" : "",
    !coverage.authorInstruction ? "没有额外作者要求，将按现有资料保守推进。" : "",
    !coverage.lockedConstraints ? "没有已锁定的世界观规则，长期设定约束较弱。" : "",
    !coverage.retrievalEvidence ? "缺少至少两条可信的长期检索证据，不能把长期信息当作确定事实。" : "",
  ].filter(Boolean);

  return {
    mode: score >= 60 && coverage.retrievalEvidence ? "grounded" : "limited",
    score,
    coverage,
    gaps,
    factSources,
    retrievalSources,
  };
}
