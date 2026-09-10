import type {
  CharacterAnalysisAttribute,
  CharacterAttributeKind,
  CharacterProfile,
  KnowledgeImage,
  Project,
} from "./knowledge";

export type CharacterAttributeSyncResult = {
  characters: CharacterProfile[];
  skippedTitles: string[];
  updatedTitles: string[];
  addedTitles: string[];
};

const attributeTitles: Record<CharacterAttributeKind, string> = {
  faction: "\u6240\u5c5e\u52bf\u529b",
  summary: "\u7b80\u4ecb",
  ending: "\u4eba\u7269\u7ed3\u5c40",
  weapon: "人物武器",
  hometown: "人物家乡",
  goal: "人物目标",
  custom: "自定义属性",
};

export const coreCharacterAttributeTokens = [
  "core:name",
  "core:gender",
  "core:catchphrase",
] as const;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getCharacterAttributeOrder(character: CharacterProfile): string[] {
  const dynamicTokens = character.attributes.map((attribute) => attribute.id);
  const validTokens = new Set<string>([...coreCharacterAttributeTokens, ...dynamicTokens]);
  const existingTokens = (character.attributeOrder ?? []).filter((token) =>
    validTokens.has(token),
  );
  const missingTokens = [...coreCharacterAttributeTokens, ...dynamicTokens].filter(
    (token) => !existingTokens.includes(token),
  );

  return [...existingTokens, ...missingTokens];
}

export function addCharacter(characters: CharacterProfile[]): CharacterProfile[] {
  return [
    ...characters,
    {
      id: createId("character"),
      name: "新人物",
      gender: "",
      catchphrase: "",
      attributes: [],
      updatedAt: today(),
    },
  ];
}

export function deleteCharacter(
  characters: CharacterProfile[],
  characterId: string,
): CharacterProfile[] {
  return characters.filter((character) => character.id !== characterId);
}

export function updateCharacterBase(
  characters: CharacterProfile[],
  characterId: string,
  input: Partial<Pick<CharacterProfile, "name" | "gender" | "catchphrase">>,
): CharacterProfile[] {
  return characters.map((character) =>
    character.id === characterId
      ? {
          ...character,
          ...input,
          updatedAt: today(),
        }
      : character,
  );
}

export function clearCharacterCoreField(
  characters: CharacterProfile[],
  characterId: string,
  field: "gender" | "catchphrase",
): CharacterProfile[] {
  return updateCharacterBase(characters, characterId, { [field]: "" });
}

export function updateCharacterPortrait(
  characters: CharacterProfile[],
  characterId: string,
  portrait: KnowledgeImage,
): CharacterProfile[] {
  return characters.map((character) =>
    character.id === characterId ? { ...character, portrait, updatedAt: today() } : character,
  );
}

export function addCharacterAttribute(
  characters: CharacterProfile[],
  characterId: string,
  kind: CharacterAttributeKind,
  title?: string,
): CharacterProfile[] {
  const normalizedTitle = title?.trim();

  return characters.map((character) => {
    if (character.id !== characterId) {
      return character;
    }

    const attribute = {
      id: createId("character-attribute"),
      kind,
      title: normalizedTitle || attributeTitles[kind],
      value: "",
    };

    return {
      ...character,
      attributes: [...character.attributes, attribute],
      attributeOrder: [...getCharacterAttributeOrder(character), attribute.id],
      updatedAt: today(),
    };
  });
}

export function updateCharacterAttribute(
  characters: CharacterProfile[],
  characterId: string,
  attributeId: string,
  input: { title?: string; value?: string; locked?: boolean },
): CharacterProfile[] {
  return characters.map((character) =>
    character.id === characterId
      ? {
          ...character,
          attributes: character.attributes.map((attribute) =>
            attribute.id === attributeId ? { ...attribute, ...input } : attribute,
          ),
          updatedAt: today(),
        }
      : character,
  );
}

export function syncAnalyzedCharacterAttributes(
  characters: CharacterProfile[],
  characterId: string,
  attributes: CharacterAnalysisAttribute[],
): CharacterAttributeSyncResult {
  const skippedTitles: string[] = [];
  const updatedTitles: string[] = [];
  const addedTitles: string[] = [];
  const nextCharacters = characters.map((character) => {
    if (character.id !== characterId) {
      return character;
    }

    const nextAttributes = [...character.attributes];
    attributes.forEach((change) => {
      const value = change.value.trim();
      if (!value) {
        return;
      }
      const existingIndex = nextAttributes.findIndex((attribute) => attribute.title === change.title);
      if (existingIndex >= 0) {
        if (nextAttributes[existingIndex].locked) {
          skippedTitles.push(change.title);
          return;
        }
        nextAttributes[existingIndex] = { ...nextAttributes[existingIndex], value };
        updatedTitles.push(change.title);
        return;
      }
      const id = createId("character-attribute");
      nextAttributes.push({ id, kind: "custom", title: change.title, value });
      addedTitles.push(change.title);
    });

    return {
      ...character,
      attributes: nextAttributes,
      attributeOrder: [...getCharacterAttributeOrder(character), ...nextAttributes.slice(character.attributes.length).map((attribute) => attribute.id)],
      updatedAt: today(),
    };
  });

  return { characters: nextCharacters, skippedTitles, updatedTitles, addedTitles };
}

export function deleteCharacterAttribute(
  characters: CharacterProfile[],
  characterId: string,
  attributeId: string,
): CharacterProfile[] {
  return characters.map((character) =>
    character.id === characterId
      ? {
          ...character,
          attributes: character.attributes.filter((attribute) => attribute.id !== attributeId),
          attributeOrder: getCharacterAttributeOrder(character).filter(
            (token) => token !== attributeId,
          ),
          updatedAt: today(),
        }
      : character,
  );
}

export function moveCharacterAttribute(
  characters: CharacterProfile[],
  characterId: string,
  sourceToken: string,
  targetToken: string,
): CharacterProfile[] {
  return characters.map((character) => {
    if (character.id !== characterId || sourceToken === targetToken) {
      return character;
    }

    const order = getCharacterAttributeOrder(character);
    if (!order.includes(sourceToken) || !order.includes(targetToken)) {
      return character;
    }

    const nextOrder = order.filter((token) => token !== sourceToken);
    const targetIndex = nextOrder.indexOf(targetToken);
    nextOrder.splice(targetIndex, 0, sourceToken);

    return {
      ...character,
      attributeOrder: nextOrder,
      updatedAt: today(),
    };
  });
}

export function addCharacterGalleryImage(
  characters: CharacterProfile[],
  characterId: string,
  image: KnowledgeImage,
): CharacterProfile[] {
  return characters.map((character) =>
    character.id === characterId
      ? {
          ...character,
          gallery: [...(character.gallery ?? []), image],
          updatedAt: today(),
        }
      : character,
    );
}

export function getProjectCharacters(project: Project): CharacterProfile[] {
  const modernCharacters = project.characters ?? [];
  const existingNames = new Set(modernCharacters.map((character) => character.name.trim()));
  const legacyCharacters: CharacterProfile[] = project.records
    .filter((record) => record.type === "character" && !existingNames.has(record.name.trim()))
    .map((record) => ({
      id: `legacy-${record.id}`,
      name: record.name,
      gender: "",
      catchphrase: "",
      attributes: record.summary.trim()
        ? [
            {
              id: `legacy-${record.id}-summary`,
              kind: "summary",
              title: attributeTitles.summary,
              value: record.summary,
            },
          ]
        : [],
      updatedAt: record.updatedAt,
    }));

  return [...modernCharacters, ...legacyCharacters];
}

export function updateProjectCharacters(
  projects: Project[],
  projectId: string,
  characters: CharacterProfile[],
): Project[] {
  return projects.map((project) =>
    project.id === projectId ? { ...project, characters } : project,
  );
}
