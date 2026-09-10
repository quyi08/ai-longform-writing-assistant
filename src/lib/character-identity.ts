import type {
  AiSuggestion,
  ChapterAnalysis,
  CharacterAttribute,
  CharacterIdentityMapping,
  CharacterProfile,
  Project,
} from "./knowledge";

export type CharacterSuggestionMergeChoice = {
  field: string;
  source: "suggestion" | "target" | "custom";
  value?: string;
};

export type CharacterSuggestionMergeInput = {
  suggestionId: string;
  targetCharacterId: string;
  choices: CharacterSuggestionMergeChoice[];
};

export type CharacterIdentityResolution =
  | { status: "resolved"; characterId: string; canonicalName: string }
  | { status: "unresolved" }
  | { status: "ambiguous"; candidateCharacterIds: string[] };

export type CharacterProfileMergeResult = {
  project: Project;
  addedCharacterIds: string[];
  mergedCharacterIds: string[];
  conflicts: Array<{ characterId: string; title: string }>;
};

export function normalizeCharacterIdentityTerm(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function splitAliases(value: string): string[] {
  return value
    .split(/[／/、,，;；\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getCharacterIdentityTerms(character: CharacterProfile): string[] {
  const aliases = character.attributes
    .filter((attribute) => attribute.title.trim() === "姓名与别名")
    .flatMap((attribute) => splitAliases(attribute.value));
  return [...new Set([character.name, ...aliases].map(normalizeCharacterIdentityTerm).filter(Boolean))];
}

export function resolveCharacterIdentity(
  characters: CharacterProfile[],
  name: string,
  matchedCharacterId?: string | null,
): CharacterIdentityResolution {
  if (matchedCharacterId) {
    const exact = characters.find((character) => character.id === matchedCharacterId);
    if (exact) return { status: "resolved", characterId: exact.id, canonicalName: exact.name };
  }

  const normalized = normalizeCharacterIdentityTerm(name);
  if (!normalized) return { status: "unresolved" };
  const matches = characters.filter((character) => getCharacterIdentityTerms(character).includes(normalized));
  if (matches.length === 1) {
    return { status: "resolved", characterId: matches[0].id, canonicalName: matches[0].name };
  }
  if (matches.length > 1) {
    return { status: "ambiguous", candidateCharacterIds: matches.map((character) => character.id).sort() };
  }
  return { status: "unresolved" };
}

function normalizeIdentityEvidence(value: string): string {
  return normalizeCharacterIdentityTerm(value).replace(/[，。；、：,.!?！？;:（）()【】\[\]“”"']/g, "");
}

function normalizeProjectIdentityTerm(value: string): string {
  return normalizeCharacterIdentityTerm(value.replace(/[（(][^）)]*[）)]/g, ""));
}

function mappingResolution(mapping: CharacterIdentityMapping): CharacterIdentityResolution {
  return {
    status: "resolved",
    characterId: `mapping-${normalizeProjectIdentityTerm(mapping.canonicalName)}`,
    canonicalName: mapping.canonicalName,
  };
}

function getMappingCharacterId(mapping: CharacterIdentityMapping): string {
  return `mapping-${normalizeProjectIdentityTerm(mapping.canonicalName)}`;
}

export function resolveProjectCharacterIdentity(
  project: Project,
  name: string,
  evidence = "",
  matchedCharacterId?: string | null,
): CharacterIdentityResolution {
  const profileResolution = resolveCharacterIdentity(project.characters ?? [], name, matchedCharacterId);
  if (profileResolution.status !== "unresolved") return profileResolution;

  const normalizedName = normalizeProjectIdentityTerm(name);
  if (!normalizedName) return { status: "unresolved" };
  const mappings = project.characterIdentityMappings ?? [];
  const exactMatches = mappings.filter((mapping) =>
    [mapping.canonicalName, ...mapping.aliases]
      .map(normalizeProjectIdentityTerm)
      .includes(normalizedName),
  );
  if (exactMatches.length === 1) return mappingResolution(exactMatches[0]);
  if (exactMatches.length > 1) {
    return {
      status: "ambiguous",
      candidateCharacterIds: exactMatches.map(getMappingCharacterId).sort(),
    };
  }

  const normalizedEvidence = normalizeIdentityEvidence(evidence);
  const contextMatches = mappings.filter((mapping) =>
    (mapping.contextOnlyAliases ?? []).map(normalizeProjectIdentityTerm).includes(normalizedName) &&
    (mapping.contextAliases ?? []).some((alias) => normalizedEvidence.includes(normalizeIdentityEvidence(alias))),
  );
  if (contextMatches.length === 1) return mappingResolution(contextMatches[0]);
  if (contextMatches.length > 1) {
    return {
      status: "ambiguous",
      candidateCharacterIds: contextMatches.map(getMappingCharacterId).sort(),
    };
  }
  return { status: "unresolved" };
}

export function createConfirmedDmbjIdentityMappings(): CharacterIdentityMapping[] {
  return [
    {
      canonicalName: "吴邪",
      aliases: ["我", "主角", "小三爷", "小吴"],
      contextOnlyAliases: ["老吴"],
      contextAliases: ["吴邪", "小三爷", "吴小佛爷"],
      locked: true,
    },
    {
      canonicalName: "吴三省",
      aliases: ["三叔", "吴三爷"],
      contextOnlyAliases: ["老吴"],
      contextAliases: ["吴三省", "三叔", "吴三爷"],
      locked: true,
    },
    { canonicalName: "张起灵", aliases: ["小哥", "闷油瓶"], locked: true },
    { canonicalName: "王胖子", aliases: ["胖子"], locked: true },
    { canonicalName: "解雨臣", aliases: ["小花"], locked: true },
  ];
}

export function normalizeAnalysisCharacterIdentities(
  project: Project,
  analysis: ChapterAnalysis,
): ChapterAnalysis {
  const characters = project.characters ?? [];
  const normalizeName = (name: string, evidence = "", matchedCharacterId?: string | null) => {
    const resolution = resolveProjectCharacterIdentity(
      { ...project, characters },
      name,
      evidence,
      matchedCharacterId,
    );
    return resolution.status === "resolved" ? resolution : null;
  };
  return {
    ...analysis,
    characters: analysis.characters.map((character) => {
      const resolution = normalizeName(
        character.name,
        [
          character.role,
          character.stateBefore,
          character.stateAfter,
          character.goal,
          ...(character.relationshipChanges ?? []).flatMap((item) => [item.targetName, item.change]),
        ].filter(Boolean).join(" "),
        character.matchedCharacterId,
      );
      if (!resolution) return character;
      return {
        ...character,
        name: resolution.canonicalName,
        matchedCharacterId: resolution.characterId,
        aliases: [...new Set([character.name, ...character.aliases].filter((item) => item !== resolution.canonicalName))],
      };
    }),
    candidateUpdates: {
      ...analysis.candidateUpdates,
      characters: analysis.candidateUpdates.characters.map((candidate) => {
        const resolution = normalizeName(
          candidate.name,
          [candidate.evidence, ...Object.values(candidate.suggestedAttributes ?? {})].filter(Boolean).join(" "),
        );
        return resolution ? { ...candidate, name: resolution.canonicalName, action: "update_existing" } : candidate;
      }),
    },
  };
}

function resolveCharacterProfileIdentity(
  characters: CharacterProfile[],
  candidate: CharacterProfile,
): CharacterIdentityResolution {
  const matches = new Map<string, CharacterProfile>();
  for (const term of getCharacterIdentityTerms(candidate)) {
    const resolution = resolveCharacterIdentity(characters, term);
    if (resolution.status === "resolved") {
      const character = characters.find((item) => item.id === resolution.characterId);
      if (character) matches.set(character.id, character);
    }
  }
  if (matches.size === 1) {
    const character = [...matches.values()][0];
    return { status: "resolved", characterId: character.id, canonicalName: character.name };
  }
  if (matches.size > 1) {
    return { status: "ambiguous", candidateCharacterIds: [...matches.keys()].sort() };
  }
  return { status: "unresolved" };
}

function mergeAliasValues(left: string, right: string, canonicalName: string): string {
  const aliases = [...splitAliases(left), ...splitAliases(right), canonicalName];
  return [...new Set(aliases.map((alias) => alias.trim()).filter(Boolean))].join(" / ");
}

function suggestionCharacterName(suggestion: AiSuggestion): string {
  return (suggestion.targetName ?? suggestion.title.replace(/^人物[：:]/u, "")).trim();
}

function createMergeAttributeId(characterId: string, title: string): string {
  return `merged-${characterId}-${normalizeCharacterIdentityTerm(title).replace(/[^\p{L}\p{N}]+/gu, "-") || "attribute"}`;
}

export function mergeCharacterSuggestionIntoProfile(
  project: Project,
  input: CharacterSuggestionMergeInput,
): Project {
  const suggestion = (project.aiSuggestionPool ?? []).find((item) => item.id === input.suggestionId);
  if (!suggestion || suggestion.status !== "pending" || (suggestion.type !== "newCharacter" && suggestion.type !== "characterUpdate")) {
    throw new Error("待合并的人物建议不存在或已处理。");
  }
  const target = (project.characters ?? []).find((character) => character.id === input.targetCharacterId);
  if (!target) throw new Error("目标人物不存在。");

  const changes = suggestion.characterChanges ?? [];
  const changesByTitle = new Map(changes.map((change) => [change.title.trim(), change]));
  const choiceByField = new Map(input.choices.map((choice) => [choice.field.trim(), choice]));
  for (const choice of input.choices) {
    if (!changesByTitle.has(choice.field.trim()) || (choice.source === "custom" && !choice.value?.trim())) {
      throw new Error("人物资料合并选择无效。");
    }
  }

  const aliasName = suggestionCharacterName(suggestion);
  const existingAlias = target.attributes.find((attribute) => attribute.title.trim() === "姓名与别名");
  const nextAttributes = target.attributes.map((attribute) => {
    if (attribute.title.trim() === "姓名与别名") {
      return {
        ...attribute,
        value: mergeAliasValues(attribute.value, aliasName, target.name),
      };
    }
    const change = changesByTitle.get(attribute.title.trim());
    const choice = choiceByField.get(attribute.title.trim());
    if (!change || !choice || choice.source === "target") return attribute;
    const value = choice.source === "custom" ? choice.value!.trim() : change.value.trim();
    return { ...attribute, value };
  });

  if (!existingAlias && aliasName && normalizeCharacterIdentityTerm(aliasName) !== normalizeCharacterIdentityTerm(target.name)) {
    nextAttributes.unshift({
      id: createMergeAttributeId(target.id, "姓名与别名"),
      kind: "custom",
      title: "姓名与别名",
      value: mergeAliasValues("", aliasName, target.name),
    });
  }

  for (const change of changes) {
    const title = change.title.trim();
    if (!title || nextAttributes.some((attribute) => attribute.title.trim() === title)) continue;
    const choice = choiceByField.get(title);
    if (choice?.source === "target") continue;
    const value = choice?.source === "custom" ? choice.value!.trim() : change.value.trim();
    if (!value) continue;
    nextAttributes.push({
      id: createMergeAttributeId(target.id, title),
      kind: "custom",
      title,
      value,
    });
  }

  const nextTarget: CharacterProfile = {
    ...target,
    attributes: nextAttributes,
    attributeOrder: [
      ...(target.attributeOrder ?? []).filter((token) => nextAttributes.some((attribute) => attribute.id === token)),
      ...nextAttributes
        .map((attribute) => attribute.id)
        .filter((id) => !(target.attributeOrder ?? []).includes(id)),
    ],
    updatedAt: new Date().toISOString().slice(0, 10),
  };
  return {
    ...project,
    characters: (project.characters ?? []).map((character) => character.id === target.id ? nextTarget : character),
    aiSuggestionPool: (project.aiSuggestionPool ?? []).map((item) =>
      item.id === suggestion.id
        ? {
            ...item,
            status: "accepted",
            mergedIntoCharacterId: target.id,
            mergedIntoCharacterName: target.name,
          }
        : item,
    ),
  };
}

function mergeAttributes(
  databaseAttributes: CharacterAttribute[],
  localAttributes: CharacterAttribute[],
  canonicalName: string,
  characterId: string,
  conflicts: CharacterProfileMergeResult["conflicts"],
): CharacterAttribute[] {
  const localByTitle = new Map(localAttributes.map((attribute) => [attribute.title.trim(), attribute]));
  const consumed = new Set<string>();
  const merged = databaseAttributes.map((databaseAttribute) => {
    const title = databaseAttribute.title.trim();
    const localAttribute = localByTitle.get(title);
    if (!localAttribute) return databaseAttribute;
    consumed.add(title);
    if (title === "姓名与别名") {
      return {
        ...databaseAttribute,
        value: mergeAliasValues(databaseAttribute.value, localAttribute.value, canonicalName),
        locked: Boolean(databaseAttribute.locked || localAttribute.locked),
      };
    }
    if (databaseAttribute.locked) {
      if (localAttribute.locked && localAttribute.value.trim() !== databaseAttribute.value.trim()) {
        conflicts.push({ characterId, title });
      }
      return databaseAttribute;
    }
    if (localAttribute.locked) return { ...localAttribute };
    if (!databaseAttribute.value.trim()) return { ...localAttribute };
    if (localAttribute.value.trim() && localAttribute.value.trim() !== databaseAttribute.value.trim()) {
      conflicts.push({ characterId, title });
    }
    return databaseAttribute;
  });
  return [...merged, ...localAttributes.filter((attribute) => !consumed.has(attribute.title.trim()))];
}

export function mergeProjectCharacterProfiles(
  databaseProject: Project,
  localProject?: Project,
): CharacterProfileMergeResult {
  const databaseCharacters = databaseProject.characters ?? [];
  const conflicts: CharacterProfileMergeResult["conflicts"] = [];
  const addedCharacterIds: string[] = [];
  const mergedCharacterIds: string[] = [];
  const characters = [...databaseCharacters];

  for (const localCharacter of localProject?.characters ?? []) {
    const resolution = resolveCharacterProfileIdentity(characters, localCharacter);
    if (resolution.status !== "resolved") {
      if (resolution.status === "unresolved") {
        characters.push(localCharacter);
        addedCharacterIds.push(localCharacter.id);
      }
      continue;
    }
    const index = characters.findIndex((character) => character.id === resolution.characterId);
    const databaseCharacter = characters[index];
    characters[index] = {
      ...databaseCharacter,
      gender: databaseCharacter.gender || localCharacter.gender,
      catchphrase: databaseCharacter.catchphrase || localCharacter.catchphrase,
      attributes: mergeAttributes(
        databaseCharacter.attributes,
        localCharacter.attributes,
        databaseCharacter.name,
        databaseCharacter.id,
        conflicts,
      ),
    };
    mergedCharacterIds.push(databaseCharacter.id);
  }

  return {
    project: { ...databaseProject, characters },
    addedCharacterIds,
    mergedCharacterIds: [...new Set(mergedCharacterIds)],
    conflicts,
  };
}
