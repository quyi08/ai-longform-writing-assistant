export type KnowledgeType =
  | "character"
  | "location"
  | "item"
  | "faction"
  | "worldRule"
  | "foreshadowing"
  | "timeline";

export type KnowledgeStatus = "active" | "inactive" | "open" | "resolved" | "locked";

export type KnowledgeRelation = {
  targetId: string;
  label: string;
};

export type KnowledgeImage = {
  id: string;
  name: string;
  url: string;
};

export type ManuscriptFileType = "txt" | "doc" | "docx";

export type ManuscriptSource = {
  id: string;
  fileName: string;
  fileType: ManuscriptFileType;
  mode: "whole" | "chapter";
  uploadedAt: string;
  storedFileUrl?: string;
};

export type ManuscriptChapter = {
  id: string;
  title: string;
  displayLabel?: string;
  sectionTitle?: string;
  content: string;
  uploadedAt: string;
};

export type Manuscript = {
  source?: ManuscriptSource;
  chapters: ManuscriptChapter[];
  parseStatus: "parsed" | "stored";
  parseNote?: string;
};

export type ChapterAnalysisImportance = "minor" | "medium" | "major";

export type ChapterAnalysisCandidateAction = "create_candidate" | "merge_or_create" | "update_existing";

export type ChapterAnalysisParseMode = "structured" | "repaired" | "degraded";

export const analyzedCharacterAttributeTitles = [
  "姓名与别名",
  "剧情身份",
  "人物关系",
  "已知信息与秘密",
  "能力与限制",
] as const;

export type AnalyzedCharacterAttributeTitle =
  (typeof analyzedCharacterAttributeTitles)[number];

export type CharacterAnalysisAttribute = {
  title: AnalyzedCharacterAttributeTitle;
  value: string;
  evidence?: string;
  chapterId?: string;
};

export type ChapterAnalysisCandidate = {
  name: string;
  action: ChapterAnalysisCandidateAction;
  confidence: number;
  evidence?: string;
  suggestedAttributes?: Record<string, string>;
  suggestedAttributeEvidence?: Record<string, string>;
};

export type ChapterAnalysisClueMention = {
  name: string;
  summary: string;
  evidence: string;
  relatedCharacters: string[];
  importance: ChapterAnalysisImportance;
  confidence: number;
};

export type ChapterAnalysis = {
  schemaVersion: 1;
  parseMode?: ChapterAnalysisParseMode;
  projectId: string;
  chapterId: string;
  chapterIndex: number;
  chapterTitle: string;
  contentHash: string;
  wordCount: number;
  summary: {
    short: string;
    detailed: string;
  };
  plot: {
    mainEvents: Array<{
      title: string;
      summary: string;
      importance: ChapterAnalysisImportance;
      type?: string;
    }>;
    turningPoint: string;
    chapterEnding: string;
  };
  characters: Array<{
    name: string;
    matchedCharacterId: string | null;
    aliases: string[];
    role: string;
    stateBefore: string;
    stateAfter: string;
    emotion: string[];
    goal: string;
    traitsShown: string[];
    relationshipChanges: Array<{
      targetName: string;
      change: string;
    }>;
  }>;
  entities: {
    locations: Array<{ name: string; description: string; importance: ChapterAnalysisImportance }>;
    items: Array<{ name: string; description: string; importance: ChapterAnalysisImportance }>;
    factions: Array<{ name: string; description: string; importance: ChapterAnalysisImportance }>;
    worldRules: Array<{ name: string; description: string; importance: ChapterAnalysisImportance }>;
  };
  foreshadowings: {
    setups: Array<{
      title: string;
      evidence: string;
      possiblePayoff: string;
      relatedCharacters: string[];
      confidence: number;
    }>;
    payoffs: Array<{
      title: string;
      evidence: string;
      relatedCharacters: string[];
      confidence: number;
    }>;
    updates: Array<{
      title: string;
      evidence: string;
      status: string;
      confidence: number;
    }>;
  };
  clues: {
    mentions: ChapterAnalysisClueMention[];
  };
  timeline: {
    timeLabel: string;
    sequenceNote: string;
    duration: string;
  };
  craft: {
    pov: string;
    tone: string[];
    conflictTypes: string[];
    chapterHook: string;
    styleNotes: string[];
  };
  continuationHints: {
    openQuestions: string[];
    nextLeads: string[];
    warnings: string[];
  };
  candidateUpdates: {
    characters: ChapterAnalysisCandidate[];
    clues: ChapterAnalysisCandidate[];
    foreshadowings: ChapterAnalysisCandidate[];
    locations: ChapterAnalysisCandidate[];
    items: ChapterAnalysisCandidate[];
    factions: ChapterAnalysisCandidate[];
    worldRules: ChapterAnalysisCandidate[];
  };
  quality: {
    confidence: number;
    needsHumanReview: boolean;
    issues: string[];
  };
  updatedAt: string;
};

export type OutlineBoard = {
  id: string;
  title: string;
  chapterIds: string[];
  summary: string;
  updatedAt: string;
};

export type OutlinePart = {
  id: string;
  title: string;
  chapterIds: string[];
  characterIds: string[];
  summary: string;
  updatedAt: string;
};

export type TimelineEventLane = "story" | "world";

export type TimelineEvent = {
  id: string;
  lane: TimelineEventLane;
  title: string;
  image?: KnowledgeImage;
  timeLabel: string;
  summary: string;
  relatedChapterIds: string[];
  relatedCharacterIds: string[];
  relatedLocationIds: string[];
  relatedOrganizationIds: string[];
  impact: string;
  updatedAt: string;
};

export type ClueNode = {
  id: string;
  title: string;
  detail: string;
  x: number;
  y: number;
  parentId?: string;
  collapsed?: boolean;
  tags?: string[];
  mentionCharacterIds: string[];
  updatedAt: string;
};

export type ClueRelationLineKind = "single" | "double";

export type ClueRelationLine = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  kind: ClueRelationLineKind;
  label: string;
  updatedAt: string;
};

export type ClueSummary = {
  id: string;
  rootNodeId: string;
  nodeIds: string[];
  text: string;
  updatedAt: string;
};

export type ClueBoard = {
  id: string;
  title: string;
  nodes: ClueNode[];
  relations?: ClueRelationLine[];
  summaries?: ClueSummary[];
  selectedNodeId?: string;
  zoom: number;
  updatedAt: string;
};

export type RelationshipNode = {
  id: string;
  characterId: string;
  x: number;
  y: number;
  updatedAt: string;
};

export type RelationshipLineDirection = "single" | "double";

export type RelationshipLine = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  direction: RelationshipLineDirection;
  label: string;
  updatedAt: string;
};

export type RelationshipGraph = {
  id: string;
  title: string;
  nodes: RelationshipNode[];
  relations?: RelationshipLine[];
  selectedNodeId?: string;
  zoom: number;
  updatedAt: string;
};

export type ForeshadowingStatus = "unresolved" | "inProgress" | "resolved" | "abandoned";

export type ForeshadowingItem = {
  id: string;
  title: string;
  status: ForeshadowingStatus;
  setupChapterIds: string[];
  payoffChapterIds: string[];
  characterIds: string[];
  summary: string;
  plan: string;
  result: string;
  tags: string[];
  updatedAt: string;
};

export type ClueMention = {
  characterId: string;
  name: string;
  text: string;
  start: number;
  end: number;
};

export type MapBaseCategory = "western" | "xianxia" | "cosmic" | "city" | "custom";

export type MapMarker = {
  id: string;
  title: string;
  x: number;
  y: number;
  note: string;
};

export type MapTextColor =
  | "white"
  | "black"
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "cyan"
  | "blue"
  | "purple"
  | "pink";

export type MapTextFont = "sans" | "serif" | "mono" | "kai" | "hei";

export type MapTextOverlay = {
  id: string;
  text: string;
  x: number;
  y: number;
  color: MapTextColor;
  font: MapTextFont;
  fontSize: number;
};

export type MapImageOverlay = {
  id: string;
  name: string;
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type StoryMap = {
  id: string;
  title: string;
  baseId?: string;
  baseImageUrl: string;
  baseImageName: string;
  category: MapBaseCategory;
  markers: MapMarker[];
  texts?: MapTextOverlay[];
  images?: MapImageOverlay[];
  zoom: number;
  createdAt: string;
  updatedAt: string;
};

export type CharacterAttributeKind =
  | "weapon"
  | "hometown"
  | "goal"
  | "faction"
  | "summary"
  | "ending"
  | "custom";

export type ConstraintPriority = "p0" | "p1" | "p2";
export type ConstraintEvidenceLevel = "explicit" | "strongInference" | "weakInference";
export type ConstraintSource = "manual" | "analysis" | "snapshot" | "legacy";

export type ConstraintMetadata = {
  priority: ConstraintPriority;
  evidenceLevel?: ConstraintEvidenceLevel;
  evidenceChapterIndexes?: number[];
  effectiveFromChapter?: number;
  validUntilChapter?: number;
  scopeEntities?: string[];
  supersedesId?: string;
  source?: ConstraintSource;
};

export type CharacterAttribute = {
  id: string;
  kind: CharacterAttributeKind;
  title: string;
  value: string;
  locked?: boolean;
};

export type CharacterProfile = {
  id: string;
  name: string;
  gender: string;
  catchphrase: string;
  portrait?: KnowledgeImage;
  gallery?: KnowledgeImage[];
  attributes: CharacterAttribute[];
  attributeOrder?: string[];
  updatedAt: string;
};

export type CharacterIdentityMapping = {
  canonicalName: string;
  aliases: string[];
  contextOnlyAliases?: string[];
  contextAliases?: string[];
  locked?: boolean;
  constraintMeta?: ConstraintMetadata;
};

export type KnowledgeRecord = {
  id: string;
  type: KnowledgeType;
  name: string;
  summary: string;
  status: KnowledgeStatus;
  tags: string[];
  relations: KnowledgeRelation[];
  images?: KnowledgeImage[];
  updatedAt: string;
  constraintMeta?: ConstraintMetadata;
};

export type CurrentChapterGoal = {
  chapterNumber: number;
  plot: string;
  characterChange: string;
  conflict: string;
  foreshadowing: string;
  endingHook: string;
  lockedRules: string;
  updatedAt: string;
};

export type WritingReferenceRequest = {
  mustHappen: string;
  mustAvoid: string;
  atmosphere: string;
  other: string;
};

export type WritingReferencePreparation = {
  selectedIds: string[];
  lockedIds: string[];
  nextChapterCharacterIds?: string[];
  temporaryRequest: WritingReferenceRequest;
};

export type AiSuggestionType =
  | "newCharacter"
  | "characterUpdate"
  | "newForeshadowing"
  | "timelineEvent"
  | "worldRule";

export type AiSuggestionStatus = "pending" | "accepted" | "later" | "ignored";
export type ContinuationFeedbackDecision = "adopted" | "edited" | "rejected";
export type ContinuationFeedbackReason = "constraint" | "plot" | "style" | "information" | "pacing" | "other";
export type ContinuationRun = {
  id: string;
  createdAt: string;
  writerModel: string;
  plannerModel?: string;
  diagnosisModel?: string;
  targetLength: 1000 | 3000 | 10000;
  groundingMode: "grounded" | "limited";
  groundingScore: number;
  authorInstruction: string;
  sourceRefs: Array<{ kind: string; sourceId?: string; label: string }>;
  riskSummary: { high: number; medium: number; low: number; status: string };
  outputHash: string;
  outputPreview: string;
  feedback?: { decision: ContinuationFeedbackDecision; reason?: ContinuationFeedbackReason; updatedAt: string };
};
export type AiSuggestionImportanceLevel = "main" | "important" | "minor";
export type CharacterAuditRiskFlag =
  | "genericName"
  | "aliasAmbiguous"
  | "evidenceMissing"
  | "constraintConflict"
  | "mentionedOnly";

export type CharacterAuditItem = {
  suggestionId: string;
  recommendedLevel: AiSuggestionImportanceLevel;
  mainScore: number;
  evidenceSufficiency: number;
  reasons: string[];
  counterEvidence: string[];
  riskFlags: CharacterAuditRiskFlag[];
  needsHumanReview: boolean;
};

export type CharacterAuditResult = {
  fingerprint: string;
  generatedAt: string;
  rulesVersion: string;
  status: "succeeded" | "failed";
  model?: string;
  items: CharacterAuditItem[];
  reviewQueue: string[];
  lastError?: string;
};

export type ClueDiagnosisKind =
  | "主线谜团"
  | "人物秘密"
  | "危机限制"
  | "待回收承诺"
  | "背景细节";

export type ClueDiagnosisState = "未解" | "推进中" | "已回收" | "仅背景";

export type ClueDiagnosisTier = "priority" | "watch" | "record";

export type ClueDiagnosisCandidate = {
  id: string;
  name: string;
  summary: string;
  evidence: string;
  chapterId: string;
  chapterIndex: number;
  chapterTitle: string;
  relatedCharacters: string[];
  importance: ChapterAnalysisImportance;
  confidence: number;
};

export type ClueDiagnosisTheme = {
  id: string;
  title: string;
  memberIds: string[];
  kind: ClueDiagnosisKind;
  state: ClueDiagnosisState;
  mergeReason: string;
  needsHumanReview: boolean;
  sourceChapterIds: string[];
  score: number;
  tier: ClueDiagnosisTier;
  reasons: string[];
};

export type ClueDiagnosisResult = {
  fingerprint: string;
  generatedAt: string;
  mode: "diagnosis" | "fallback";
  themes: ClueDiagnosisTheme[];
};

export type AiSuggestionSource = {
  chapterId: string;
  chapterTitle: string;
  detail: string;
  createdAt: string;
};

export type AiSuggestion = {
  id: string;
  type: AiSuggestionType;
  status: AiSuggestionStatus;
  title: string;
  detail: string;
  source: string;
  targetName?: string;
  identityStatus?: "resolved" | "unresolved" | "ambiguous";
  identityCandidateIds?: string[];
  importanceScore?: number;
  importanceLevel?: AiSuggestionImportanceLevel;
  importanceReasons?: string[];
  importanceOverride?: AiSuggestionImportanceLevel;
  mergedIntoCharacterId?: string;
  mergedIntoCharacterName?: string;
  auditScore?: number;
  auditEvidenceSufficiency?: number;
  auditReasons?: string[];
  auditCounterEvidence?: string[];
  auditRiskFlags?: CharacterAuditRiskFlag[];
  auditNeedsHumanReview?: boolean;
  chapterId?: string;
  createdAt: string;
  canonicalKey?: string;
  sources?: AiSuggestionSource[];
  characterChanges?: CharacterAnalysisAttribute[];
  clueDiagnosisMemberIds?: string[];
  clueDiagnosisThemeId?: string;
  clueDiagnosisTier?: ClueDiagnosisTier;
  clueDiagnosisScore?: number;
  clueDiagnosisReasons?: string[];
};

export type SnapshotEvidence = {
  chapterId: string;
  chapterIndex: number;
  quote: string;
  sourceType: "chapter" | "retrieval";
};

export type SnapshotFactKind =
  | "identity"
  | "relationship"
  | "abilityLimit"
  | "secretConflict"
  | "recentState"
  | "nextGoal"
  | "transient";

export type SnapshotCharacterDirectoryEntry = {
  id: string;
  canonicalName: string;
  aliases: string[];
  firstChapterIndex: number;
  lastChapterIndex: number;
  chapterIds: string[];
  stableFacts: Array<{ kind?: SnapshotFactKind; value: string; evidence: SnapshotEvidence[] }>;
  lastKnownState?: { value: string; evidence: SnapshotEvidence[] };
  needsIdentityReview?: boolean;
};

export type SnapshotConstraintCandidate = {
  id: string;
  group: "active" | "latent" | "world";
  title: string;
  value: string;
  confidence: number;
  kind?: Exclude<SnapshotFactKind, "transient"> | "clue";
  importance?: "main" | "important";
  evidence: SnapshotEvidence[];
  status: "pending" | "locked" | "reference" | "ignored";
};

export type SnapshotAnalysisFailureKind = "network" | "truncated" | "json_syntax" | "schema_invalid" | "evidence_invalid" | "provider_format_unsupported" | "unknown";

export type SnapshotRecoveryChild = {
  id: string;
  chapterIds: string[];
  status: "pending" | "completed" | "failed";
  error?: string;
};

export type SnapshotRecoveryBatch = {
  parentBatchId: string;
  children: SnapshotRecoveryChild[];
};

export type SnapshotAnalysisState = {
  version: 1;
  status: "idle" | "indexing" | "recent_analysis" | "candidate_review" | "completed" | "failed";
  completedBatchIds: string[];
  failedBatches: Array<{ batchId: string; error: string; kind?: SnapshotAnalysisFailureKind; recoveryStage?: "primary" | "json_repair" | "compact" }>;
  recoveryBatches?: SnapshotRecoveryBatch[];
  directory: SnapshotCharacterDirectoryEntry[];
  recentChapterIds: string[];
  candidates: SnapshotConstraintCandidate[];
};

export type EvaluationSnapshotMetadata = {
  sourceProjectId: string;
  sourceTitle: string;
  retainedChapterCount: number;
  createdAt: string;
  analysis: SnapshotAnalysisState;
};

export type Project = {
  id: string;
  title: string;
  coverImage?: {
    name: string;
    url: string;
  };
  genre: string;
  synopsis: string;
  targetWordCount: number;
  updateFrequency: string;
  manuscript?: Manuscript;
  outlineBoards?: OutlineBoard[];
  outlineParts?: OutlinePart[];
  characters?: CharacterProfile[];
  characterIdentityMappings?: CharacterIdentityMapping[];
  timelineEvents?: TimelineEvent[];
  maps?: StoryMap[];
  clueBoards?: ClueBoard[];
  relationshipGraphs?: RelationshipGraph[];
  foreshadowings?: ForeshadowingItem[];
  chapterAnalyses?: ChapterAnalysis[];
  currentChapterGoal?: CurrentChapterGoal;
  writingReferencePreparation?: WritingReferencePreparation;
  aiSuggestionQueue?: AiSuggestion[];
  aiSuggestionPool?: AiSuggestion[];
  aiSuggestionsInitialized?: boolean;
  characterAudit?: CharacterAuditResult;
  clueDiagnosis?: ClueDiagnosisResult;
  continuationRuns?: ContinuationRun[];
  evaluationSnapshot?: EvaluationSnapshotMetadata;
  records: KnowledgeRecord[];
};

export type KnowledgeStats = {
  totalRecords: number;
  byType: Record<KnowledgeType, number>;
  openForeshadowing: number;
};

export type KnowledgeRecordInput = {
  type: KnowledgeType;
  name: string;
  summary: string;
  status: KnowledgeStatus;
  tagsText: string;
};

const emptyTypeCounts = (): Record<KnowledgeType, number> => ({
  character: 0,
  location: 0,
  item: 0,
  faction: 0,
  worldRule: 0,
  foreshadowing: 0,
  timeline: 0,
});

const normalizeTags = (tagsText: string): string[] =>
  tagsText
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean);

const createRecordId = (type: KnowledgeType, name: string, count: number): string => {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}-]/gu, "");

  return `${type}-${slug || "record"}-${count + 1}-${Date.now().toString(36)}`;
};

export function getKnowledgeStats(project: Project): KnowledgeStats {
  const byType = emptyTypeCounts();

  for (const record of project.records) {
    byType[record.type] += 1;
  }

  return {
    totalRecords: project.records.length,
    byType,
    openForeshadowing: project.records.filter(
      (record) => record.type === "foreshadowing" && record.status === "open",
    ).length,
  };
}

export function searchKnowledge(
  project: Project,
  query: string,
  type?: KnowledgeType,
): KnowledgeRecord[] {
  const normalizedQuery = query.trim().toLowerCase();

  return project.records.filter((record) => {
    if (type && record.type !== type) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    const searchable = [record.name, record.summary, ...record.tags]
      .join(" ")
      .toLowerCase();

    return searchable.includes(normalizedQuery);
  });
}

export function getRelatedRecords(
  project: Project,
  record: KnowledgeRecord,
): KnowledgeRecord[] {
  const ids = new Set(record.relations.map((relation) => relation.targetId));
  return project.records.filter((candidate) => ids.has(candidate.id));
}

export function addKnowledgeRecord(
  project: Project,
  input: KnowledgeRecordInput,
): Project {
  const record: KnowledgeRecord = {
    id: createRecordId(input.type, input.name, project.records.length),
    type: input.type,
    name: input.name.trim() || "未命名资料",
    summary: input.summary.trim() || "暂无说明。",
    status: input.status,
    tags: normalizeTags(input.tagsText),
    relations: [],
    images: [],
    updatedAt: new Date().toISOString().slice(0, 10),
  };

  return {
    ...project,
    records: [...project.records, record],
  };
}

export function updateKnowledgeRecord(
  project: Project,
  recordId: string,
  input: Pick<KnowledgeRecordInput, "name" | "summary" | "tagsText">,
): Project {
  return {
    ...project,
    records: project.records.map((record) =>
      record.id === recordId
        ? {
            ...record,
            name: input.name.trim() || "未命名资料",
            summary: input.summary.trim() || "暂无说明。",
            tags: normalizeTags(input.tagsText),
            updatedAt: new Date().toISOString().slice(0, 10),
          }
        : record,
    ),
  };
}

export function deleteKnowledgeRecord(project: Project, recordId: string): Project {
  return {
    ...project,
    records: project.records.filter((record) => record.id !== recordId),
  };
}

export function addRecordImage(
  project: Project,
  recordId: string,
  image: KnowledgeImage,
): Project {
  return {
    ...project,
    records: project.records.map((record) =>
      record.id === recordId
        ? { ...record, images: [...(record.images ?? []), image] }
        : record,
    ),
  };
}

export function deleteRecordImage(
  project: Project,
  recordId: string,
  imageId: string,
): Project {
  return {
    ...project,
    records: project.records.map((record) =>
      record.id === recordId
        ? {
            ...record,
            images: (record.images ?? []).filter((image) => image.id !== imageId),
          }
        : record,
    ),
  };
}
