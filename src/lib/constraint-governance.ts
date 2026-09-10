import { classifyConstraintPriority } from "./constraint-selection";
import type { ConstraintMetadata, Project } from "./knowledge";

function legacyMeta(priority: ConstraintMetadata["priority"]): ConstraintMetadata {
  return { priority, evidenceLevel: "weakInference", source: "legacy" };
}

function legacyAttributeMeta(attribute: { id: string; title: string; kind: string }): ConstraintMetadata {
  if (attribute.id.startsWith("snapshot-attribute-") || attribute.title === "快照已证实事实") {
    return { priority: "p1", evidenceLevel: "weakInference", source: "snapshot" };
  }
  return legacyMeta(classifyConstraintPriority(attribute));
}

function shouldUpgradeLegacySnapshotAttribute(attribute: { id: string; title: string; constraintMeta?: ConstraintMetadata }) {
  return (attribute.id.startsWith("snapshot-attribute-") || attribute.title === "快照已证实事实")
    && attribute.constraintMeta?.source === "legacy"
    && attribute.constraintMeta.priority === "p2";
}

export function governProjectConstraintMetadata(project: Project): { project: Project; changed: boolean } {
  let changed = false;
  const records = project.records.map((record) => {
    if (record.status !== "locked" || record.constraintMeta) return record;
    changed = true;
    return { ...record, constraintMeta: legacyMeta(record.type === "worldRule" ? "p0" : "p2") };
  });
  const characters = (project.characters ?? []).map((character) => ({
    ...character,
    attributes: character.attributes.map((attribute) => {
      if (!attribute.locked || (attribute.constraintMeta && !shouldUpgradeLegacySnapshotAttribute(attribute))) return attribute;
      changed = true;
      return { ...attribute, constraintMeta: legacyAttributeMeta(attribute) };
    }),
  }));
  return { project: changed ? { ...project, records, characters } : project, changed };
}
