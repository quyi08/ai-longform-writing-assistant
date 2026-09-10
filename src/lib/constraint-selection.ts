import type { CharacterAttribute, ConstraintMetadata, ConstraintPriority, Project } from "./knowledge";

export type SelectedConstraint = {
  id: string;
  label: string;
  text: string;
  priority: ConstraintPriority;
  evidenceChapterIndexes: number[];
  reason: string;
  score: number;
};

export type ConstraintSelectionResult = {
  selected: SelectedConstraint[];
  filteredCount: number;
  futureEvidenceBlockedCount: number;
};

type AttributeLike = Pick<CharacterAttribute, "title" | "kind">;

export function classifyConstraintPriority(attribute: AttributeLike): ConstraintPriority {
  const title = attribute.title.trim();
  if (/不可违背|世界观|身份|能力与限制|能力限制/.test(title)) return "p0";
  if (/当前状态|下一步目标|人物目标|位置|伤势/.test(title)) return "p1";
  return "p2";
}

function normalizedMeta(attribute: CharacterAttribute): ConstraintMetadata {
  return { priority: attribute.constraintMeta?.priority ?? classifyConstraintPriority(attribute), ...attribute.constraintMeta };
}

function compact(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function entityOverlap(text: string, name: string) {
  return text.includes(name) ? 1 : 0;
}

function isActive(meta: ConstraintMetadata, chapterIndex: number) {
  return (!meta.effectiveFromChapter || meta.effectiveFromChapter <= chapterIndex)
    && (!meta.validUntilChapter || meta.validUntilChapter >= chapterIndex);
}

function isEvidencedAtOrBeforeCutoff(meta: ConstraintMetadata, chapterIndex: number) {
  const evidenceChapterIndexes = meta.evidenceChapterIndexes ?? [];
  return evidenceChapterIndexes.length > 0 && Math.max(...evidenceChapterIndexes) <= chapterIndex;
}

function hasFutureEvidence(meta: ConstraintMetadata, chapterIndex: number) {
  return (meta.evidenceChapterIndexes ?? []).some((index) => index > chapterIndex);
}

function evidenceScore(meta: ConstraintMetadata) {
  return meta.evidenceLevel === "explicit" ? 30 : meta.evidenceLevel === "strongInference" ? 18 : meta.evidenceLevel === "weakInference" ? 8 : 4;
}

function priorityScore(priority: ConstraintPriority) {
  return priority === "p0" ? 100 : priority === "p1" ? 60 : 0;
}

export function selectConstraintsForContinuation(project: Project, input: { chapterIndex: number; userInstruction: string; recentManuscriptText: string; retrievalEvidence?: string[] }): ConstraintSelectionResult {
  const context = compact([input.userInstruction, input.recentManuscriptText].join("\n"));
  const supersededIds = new Set((project.characters ?? []).flatMap((character) => character.attributes
    .map((attribute) => attribute.constraintMeta?.supersedesId)
    .filter((id): id is string => Boolean(id))));
  const allCharacterCandidates = (project.characters ?? []).flatMap((character) => character.attributes
    .filter((attribute) => attribute.locked && compact(attribute.value))
    .map((attribute) => ({ character, attribute, meta: normalizedMeta(attribute) })));
  const futureCharacterConstraintCount = allCharacterCandidates.filter((item) => hasFutureEvidence(item.meta, input.chapterIndex)).length;
  const characterCandidates = allCharacterCandidates
    .filter((item) => {
      if (item.meta.priority === "p2" || !isActive(item.meta, input.chapterIndex) || !isEvidencedAtOrBeforeCutoff(item.meta, input.chapterIndex) || supersededIds.has(item.attribute.id)) return false;
      const sceneMentioned = entityOverlap(context, item.character.name) > 0
        || (item.meta.scopeEntities ?? []).some((entity) => entityOverlap(context, entity) > 0);
      const recentEvidence = (item.meta.evidenceChapterIndexes ?? []).some((index) => index >= Math.max(1, input.chapterIndex - 3));
      const legacySnapshotWithoutEvidence = item.meta.source === "snapshot" && !(item.meta.evidenceChapterIndexes?.length);
      return !legacySnapshotWithoutEvidence && (sceneMentioned || recentEvidence);
    });
  const worldCandidates = project.records
    .filter((record) => record.type === "worldRule" && record.status === "locked" && record.summary.trim())
    .map((record) => {
      const meta = record.constraintMeta ?? { priority: "p0" as const, evidenceLevel: "weakInference" as const, source: "legacy" as const };
      const latestEvidence = Math.max(0, ...(meta.evidenceChapterIndexes ?? []));
      const overlap = entityOverlap(context, record.name);
      return { id: record.id, label: record.name, text: `${record.name}：${record.summary}`, priority: meta.priority, evidenceChapterIndexes: meta.evidenceChapterIndexes ?? [], reason: `世界规则；${overlap ? "与当前指令相关" : "长期不可违背设定"}${latestEvidence ? `；证据至第 ${latestEvidence} 章` : ""}`, score: priorityScore(meta.priority) + evidenceScore(meta) + overlap * 35, meta };
    });
  const futureWorldConstraintCount = worldCandidates.filter((item) => hasFutureEvidence(item.meta, input.chapterIndex)).length;
  const selected = characterCandidates
    .map(({ character, attribute, meta }) => {
      const overlap = entityOverlap(context, character.name) + (meta.scopeEntities ?? []).reduce((count, entity) => count + entityOverlap(context, entity), 0);
      const latestEvidence = Math.max(0, ...(meta.evidenceChapterIndexes ?? []));
      const recency = latestEvidence ? Math.max(0, 20 - Math.abs(input.chapterIndex - latestEvidence) * 2) : 0;
      const score = priorityScore(meta.priority) + evidenceScore(meta) + overlap * 35 + recency;
      const reason = [
        meta.priority === "p0" ? "P0 长期不可违背设定" : "P1 当前连续性状态",
        overlap ? "与当前断点人物或指令相关" : "按优先级保留",
        latestEvidence ? `证据至第 ${latestEvidence} 章` : "沿用旧锁定资料",
      ].join("；");
      return { id: attribute.id, label: character.name, text: `${character.name}·${attribute.title}：${attribute.value}`, priority: meta.priority, evidenceChapterIndexes: meta.evidenceChapterIndexes ?? [], reason, score };
    })
    .concat(worldCandidates
      .filter((item) => item.priority !== "p2" && isActive(item.meta, input.chapterIndex) && isEvidencedAtOrBeforeCutoff(item.meta, input.chapterIndex))
      .map(({ meta: _meta, ...item }) => item))
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));

  const p0 = selected.filter((item) => item.priority === "p0").slice(0, 2);
  const p1 = selected.filter((item) => item.priority === "p1").slice(0, 4);
  const chosen = [...p0, ...p1].sort((left, right) => right.score - left.score).slice(0, 6);
  return { selected: chosen, filteredCount: selected.length - chosen.length, futureEvidenceBlockedCount: futureCharacterConstraintCount + futureWorldConstraintCount };
}
