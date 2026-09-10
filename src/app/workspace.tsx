"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createAiTaskDescriptor, type AiTaskType } from "@/lib/ai";
import {
  flightIntroEndTime,
  flightIntroFallbackDelayMs,
  getDestinationWheelDirection,
  shouldPauseFlightIntro,
  shouldRevealFlightDestinationOnFallback,
} from "@/lib/flight";
import {
  appendContinuationToLastChapter,
  buildAiContinuationContext,
  saveContinuationAsNextChapter,
  type AiContinuationContext,
  type AiContinuationLength,
  type AiContinuationReport,
} from "@/lib/ai-continuation";
import {
  continuationStrategies,
  estimateContinuationStrategy,
  getContinuationStrategy,
  type ContinuationStrategyId,
} from "@/lib/continuation-strategy";
import type { ContinuationConsistencyReport } from "@/lib/continuation-consistency";
import {
  createContinuationRun,
  getProjectReliabilityMetrics,
  recordContinuationFeedback,
  updateContinuationRunRiskSummary,
} from "@/lib/continuation-runs";
import {
  deleteAnalysisClue,
  getAnalysisClueGroups,
  getAnalysisClueRows,
  getCandidateAnalysisCharacters,
  getMatchedAnalysisCharacters,
  updateAnalysisClue,
} from "@/lib/ai-analysis-report";
import {
  clearChapterAnalyses,
  getChapterAnalysisProgressState,
  getChapterAnalysisStats,
  getRecentChapterPreview,
  upsertChapterAnalysis,
} from "@/lib/chapter-analysis";
import {
  applyAcceptedAiSuggestion,
  buildAiSuggestionPool,
  getAiSuggestionCategory,
  getClueSuggestionTier,
  getAiSuggestionSummary,
  getAiSuggestionPage,
  getAiSuggestionPageNumbers,
  getAiSuggestionTypeLabel,
  type AiSuggestionCategory,
  updateAiSuggestionStatus,
} from "@/lib/ai-suggestions";
import {
  addKnowledgeRecord,
  addRecordImage,
  deleteRecordImage,
  deleteKnowledgeRecord,
  getKnowledgeStats,
  getRelatedRecords,
  searchKnowledge,
  updateKnowledgeRecord,
  type KnowledgeRecord,
  type CharacterAttributeKind,
  type CurrentChapterGoal,
  type KnowledgeImage,
  type ManuscriptFileType,
  type KnowledgeType,
  type AiSuggestion,
  type AiSuggestionImportanceLevel,
  type Project,
  type WritingReferencePreparation,
} from "@/lib/knowledge";
import {
  addManuscriptChapter,
  clearManuscriptChapters,
  createWholeManuscript,
  decodeManuscriptText,
  deleteManuscriptChapter,
  getManuscriptWordCount,
  hasUnsavedManuscriptChapterContent,
  manuscriptModeTabs,
  renameManuscriptChapter,
  updateManuscriptChapterContent,
  updateProjectManuscript,
  type ManuscriptMode,
} from "@/lib/manuscript";
import {
  addProject,
  assignProjectToMirror as assignProjectToDestination,
  deleteProject,
  getMirrorProject as getDestinationProject,
  renameProject,
  removeProjectFromMirrorLinks as removeProjectFromDestinationLinks,
  resolveActiveProject,
  updateProjectCover,
  updateProjectCurrentChapterGoal,
  updateProjectWritingReferencePreparation,
  updateProjectSynopsis,
  type MirrorProjectLinks as DestinationLinks,
} from "@/lib/projects";
import {
  clearLegacyWorkspaceStorage,
} from "@/lib/workspace-storage";
import {
  deleteServerProject,
  auditProjectCharacters,
  indexProject,
  loadIndexStatus,
  loadServerProjects,
  rebuildProjectSuggestions,
  retrieveProjectEvidence,
  saveServerProject,
  type IndexStatus,
  type RetrievalEvidence,
} from "@/lib/workspace-api";
import {
  addOutlinePart,
  deleteOutlineParts,
  ensureOutlineParts,
  moveOutlinePart,
  searchOutlineOptions,
  updateOutlinePart,
  updateProjectOutlineParts,
} from "@/lib/outline";
import {
  addCharacter,
  addCharacterAttribute,
  addCharacterGalleryImage,
  clearCharacterCoreField,
  deleteCharacter,
  deleteCharacterAttribute,
  getCharacterAttributeOrder,
  getProjectCharacters,
  moveCharacterAttribute,
  updateCharacterAttribute,
  updateCharacterBase,
  updateCharacterPortrait,
  updateProjectCharacters,
} from "@/lib/characters";
import {
  mergeCharacterSuggestionIntoProfile,
  type CharacterSuggestionMergeChoice,
} from "@/lib/character-identity";
import {
  addTimelineEvent,
  calculateTimelineCanvasHeight,
  calculateTimelineFlightLayout,
  calculateTimelineFlightPath,
  calculateTimelineOrbitCount,
  clampTimelineZoom,
  deleteTimelineEvent,
  moveTimelineEventToIndex,
  updateTimelineEventRelationIds,
  updateProjectTimelineEvents,
  updateTimelineEvent,
  type TimelineRelationKind,
} from "@/lib/timeline";
import type { TimelineEvent, TimelineEventLane } from "@/lib/knowledge";
import {
  addStoryMapImage,
  addStoryMapMarker,
  addStoryMapText,
  BUILT_IN_MAP_BASES,
  calculateMapContextMenuPlacement,
  createStoryMap,
  deleteStoryMap,
  MAP_TEXT_COLORS,
  MAP_TEXT_FONTS,
  updateStoryMapImage,
  updateStoryMapText,
  updateStoryMapTitle,
  updateStoryMapZoom,
} from "@/lib/maps";
import {
  addClueRelation,
  addClueNodeAt,
  addClueBoard,
  addClueNode,
  addClueSummary,
  createUniqueClueBoardTitle,
  deleteClueBoardWithoutFallback,
  deleteClueNode,
  deleteClueNodeOnly,
  deleteClueRelation,
  deleteClueSummary,
  extractCharacterMentions,
  getClueMcpSnapshot,
  getVisibleClueNodes,
  normalizeClueBoards,
  reparentClueNode,
  renameClueBoard,
  selectClueNode,
  toggleClueNodeCollapsed,
  updateClueBoardZoom,
  updateClueNode,
  updateProjectClueBoards,
  updateClueRelationLabel,
  updateClueSummary,
  upsertClueBoard,
} from "@/lib/clues";
import {
  addRelationshipCharacterNode,
  addRelationshipGraph,
  addRelationshipLine,
  deleteRelationshipCharacterNode,
  deleteRelationshipGraph,
  deleteRelationshipLine,
  normalizeRelationshipGraphs,
  renameRelationshipGraph,
  selectRelationshipNode,
  updateProjectRelationshipGraphs,
  updateRelationshipGraphZoom,
  updateRelationshipLine,
  updateRelationshipNodePosition,
} from "@/lib/relationships";
import {
  addForeshadowing,
  deleteForeshadowing,
  filterForeshadowings,
  getForeshadowingStats,
  getWritingReferenceForeshadowingCount,
  mergeForeshadowingItems,
  normalizeForeshadowings,
  updateForeshadowing,
  updateProjectForeshadowings,
  type ForeshadowingInput,
  type ForeshadowingStatusFilter,
} from "@/lib/foreshadowings";
import {
  getWorldModuleTitleLines,
  WORKBENCH_TOOL_DETAILS,
  WORLD_CONSOLE_MODULES,
} from "@/lib/world-modules";
import type {
  ClueBoard,
  ClueNode,
  ClueRelationLineKind,
  ForeshadowingItem,
  ForeshadowingStatus,
  MapImageOverlay,
  MapTextColor,
  MapTextFont,
  MapTextOverlay,
  RelationshipGraph,
  RelationshipLineDirection,
  ChapterAnalysis,
} from "@/lib/knowledge";

const typeLabels: Record<KnowledgeType, string> = {
  character: "人物",
  location: "地点",
  item: "物品",
  faction: "势力",
  worldRule: "世界观",
  foreshadowing: "伏笔",
  timeline: "时间线",
};

const foreshadowingStatusLabels: Record<ForeshadowingStatus, string> = {
  unresolved: "未回收",
  inProgress: "回收中",
  resolved: "已回收",
  abandoned: "废弃",
};

const foreshadowingStatusOptions: ForeshadowingStatus[] = [
  "unresolved",
  "inProgress",
  "resolved",
  "abandoned",
];

const aiTasks: AiTaskType[] = [
  "extractKnowledge",
  "generateOutline",
  "continueChapter",
  "consistencyCheck",
  "rewriteSelection",
];

const characterAuditRiskLabels: Record<string, string> = {
  genericName: "泛称",
  aliasAmbiguous: "别名歧义",
  evidenceMissing: "证据不足",
  constraintConflict: "设定冲突",
  mentionedOnly: "仅被提及",
};

type ChapterAnalysisFailure = {
  chapterId?: string;
  chapterTitle: string;
  error: string;
};

type ChapterAnalysisRecovery = {
  chapterId?: string;
  chapterTitle: string;
  mode: "repaired" | "degraded";
  reason: string;
};

type ChapterAnalysisMode = "fast" | "full";

type ChapterAnalysisStreamEvent = {
  type?: string;
  status?: string;
  progress?: number;
  total?: number;
  skippedCount?: number;
  mode?: ChapterAnalysisMode;
  concurrency?: number;
  chapterId?: string;
  chapterTitle?: string;
  analysis?: ChapterAnalysis;
  recovery?: ChapterAnalysisRecovery | null;
  analyzedCount?: number;
  repairedCount?: number;
  degradedCount?: number;
  failedCount?: number;
  recoveries?: ChapterAnalysisRecovery[];
  failures?: ChapterAnalysisFailure[];
  analyses?: ChapterAnalysis[];
  error?: string;
};

type AiSuggestionReviewStatus =
  | "pending"
  | "later"
  | "resolved"
  | "priority"
  | "watch"
  | "record";

type CharacterSuggestionMergeDialogState = {
  suggestionId: string;
  targetCharacterId: string;
  query: string;
  choices: Record<string, CharacterSuggestionMergeChoice>;
};

type WritingReferenceDialogSection =
  | "memory"
  | "recent"
  | "knowledge"
  | "foreshadowings"
  | "request"
  | null;

type RecordDialogState =
  | {
      mode: "add";
      type: KnowledgeType;
      name: string;
      summary: string;
      tagsText: string;
    }
  | {
      mode: "edit";
      record: KnowledgeRecord;
      name: string;
      summary: string;
      tagsText: string;
    };

type MapContextMenuState = {
  menuX: number;
  menuY: number;
  mapX: number;
  mapY: number;
};

type ClueContextMenuState =
  | {
      kind: "canvas";
      menuX: number;
      menuY: number;
      mapX: number;
      mapY: number;
    }
  | {
      kind: "node";
      menuX: number;
      menuY: number;
      nodeId: string;
    };

type ClueSection = "mindMap" | "relationships" | "foreshadowing";

type ClueBoardManagerDialogState =
  | {
      mode: "create";
      titleDraft: string;
    }
  | {
      mode: "open" | "delete";
      selectedBoardId: string;
    }
  | {
      mode: "rename";
      selectedBoardId: string;
      titleDraft: string;
    };

type RelationshipGraphManagerDialogState =
  | {
      mode: "create";
      titleDraft: string;
    }
  | {
      mode: "open" | "delete" | "rename";
      selectedGraphId: string;
      titleDraft?: string;
    };

type RelationshipContextMenuState = {
  menuX: number;
  menuY: number;
  nodeId: string;
};

type ForeshadowingDraft = ForeshadowingInput;

type ForeshadowingDialogState =
  | {
      mode: "add";
      draft: ForeshadowingDraft;
    }
  | {
      mode: "edit";
      foreshadowingId: string;
      draft: ForeshadowingDraft;
    };

type MapImageGesture = {
  imageId: string;
  mode: "move" | "resize";
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
};

type MapTextEditState = {
  textId: string;
  draft: Pick<MapTextOverlay, "text" | "color" | "font" | "fontSize">;
};

type TimelineRelationSortMode = "time" | "name";

type TimelineRelationPickerState = {
  kind: TimelineRelationKind;
  selectedIds: string[];
  sortMode: TimelineRelationSortMode;
};

type TimelineRelationOption = {
  id: string;
  title: string;
  meta: string;
  order: number;
};

const flightDestinationSlots = [
  { id: "flight-destination-1", label: "航班终点 01" },
  { id: "flight-destination-2", label: "航班终点 02" },
  { id: "flight-destination-3", label: "航班终点 03" },
  { id: "flight-destination-4", label: "航班终点 04" },
  { id: "flight-destination-5", label: "航班终点 05" },
  { id: "flight-destination-6", label: "航班终点 06" },
];

function createProjectSignatures(projects: Project[]): Map<string, string> {
  return new Map(projects.map((project) => [project.id, JSON.stringify(project)]));
}

function projectSignaturesMatch(left: Map<string, string>, right: Map<string, string>): boolean {
  return left.size === right.size && [...left.entries()].every(([id, value]) => right.get(id) === value);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file: File): Promise<string> {
  return file.arrayBuffer().then(decodeManuscriptText);
}

function getManuscriptFileType(file: File): ManuscriptFileType | undefined {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "txt" || extension === "doc" || extension === "docx") {
    return extension;
  }

  return undefined;
}

function getMapPointFromPointer(
  element: HTMLElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  const x = rect.width ? ((clientX - rect.left) / rect.width) * 100 : 0;
  const y = rect.height ? ((clientY - rect.top) / rect.height) * 100 : 0;

  return {
    x: Math.min(100, Math.max(0, x)),
    y: Math.min(100, Math.max(0, y)),
  };
}

function getMapTextColorHex(color: MapTextColor): string {
  return MAP_TEXT_COLORS.find((item) => item.value === color)?.hex ?? "#f8fff7";
}

function getMapTextFontFamily(font: MapTextFont): string {
  return MAP_TEXT_FONTS.find((item) => item.value === font)?.family ?? "sans-serif";
}

function formatLoginMetric(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function normalizeDestinationLinks(
  links: DestinationLinks | undefined,
  projects: Project[],
): DestinationLinks {
  const nextLinks: DestinationLinks = {};
  for (const slot of flightDestinationSlots) {
    if (links?.[slot.id] && projects.some((project) => project.id === links?.[slot.id])) {
      nextLinks[slot.id] = links[slot.id];
    }
  }

  const linkedProjectIds = new Set(Object.values(nextLinks));
  const unassignedProjects = projects.filter((project) => !linkedProjectIds.has(project.id));
  for (const project of unassignedProjects) {
    const nextEmptySlot = flightDestinationSlots.find((slot) => !nextLinks[slot.id]);
    if (!nextEmptySlot) break;
    nextLinks[nextEmptySlot.id] = project.id;
  }

  return nextLinks;
}

function RecordDialog({
  dialog,
  images,
  onChange,
  onClose,
  onDeleteImage,
  onSave,
}: {
  dialog: RecordDialogState;
  images: KnowledgeRecord["images"];
  onChange: (dialog: RecordDialogState) => void;
  onClose: () => void;
  onDeleteImage: (imageId: string) => void;
  onSave: () => void;
}) {
  const type = dialog.mode === "add" ? dialog.type : dialog.record.type;
  const title =
    dialog.mode === "add"
      ? `新增${typeLabels[type]}`
      : `编辑${typeLabels[type]}：${dialog.record.name}`;

  return (
    <div className="modalBackdrop" role="presentation">
      <section aria-modal="true" className="recordDialog" role="dialog">
        <div className="dialogHeader">
          <div>
            <span className="eyebrow">资料任务</span>
            <h2>{title}</h2>
          </div>
          <button onClick={onClose} type="button">
            关闭
          </button>
        </div>

        <label className="fieldGroup">
          <span>名称</span>
          <input
            autoFocus
            onChange={(event) =>
              onChange({ ...dialog, name: event.target.value } as RecordDialogState)
            }
            placeholder="例如：林照、旧钟楼、余烬怀表"
            value={dialog.name}
          />
        </label>

        <label className="fieldGroup">
          <span>说明</span>
          <textarea
            onChange={(event) =>
              onChange({ ...dialog, summary: event.target.value } as RecordDialogState)
            }
            placeholder="写下这条资料的设定、状态、限制或剧情作用"
            rows={7}
            value={dialog.summary}
          />
        </label>

        <label className="fieldGroup">
          <span>标签</span>
          <input
            onChange={(event) =>
              onChange({ ...dialog, tagsText: event.target.value } as RecordDialogState)
            }
            placeholder="用逗号分隔，例如：主角, 调查员, 失忆"
            value={dialog.tagsText}
          />
        </label>

        <section className="dialogImages">
          <div className="sectionHeader">
            <h3>已上传图</h3>
            <span>{images?.length ?? 0} </span>
          </div>
          {(images ?? []).length === 0 ? (
            <div className="emptyState">这条资料还没有上传图片</div>
          ) : (
            <div className="imageGallery compact">
              {images?.map((image) => (
                <figure
                  key={image.id}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    onDeleteImage(image.id);
                  }}
                  title="右键删除图片"
                >
                  <img alt={image.name} src={image.url} />
                  <figcaption>{image.name}</figcaption>
                </figure>
              ))}
            </div>
          )}
        </section>

        <div className="dialogFooter">
          <button onClick={onClose} type="button">
            取消
          </button>
          <button onClick={onSave} type="button">
            保存资料
          </button>
        </div>
      </section>
    </div>
  );
}

function RecordList({
  title,
  type,
  records,
  selectedRecordId,
  onAdd,
  onDelete,
  onEdit,
  onSelect,
  onUploadImage,
}: {
  title: string;
  type: KnowledgeType;
  records: KnowledgeRecord[];
  selectedRecordId?: string;
  onAdd: (type: KnowledgeType) => void;
  onDelete: (record: KnowledgeRecord) => void;
  onEdit: (record: KnowledgeRecord) => void;
  onSelect: (record: KnowledgeRecord) => void;
  onUploadImage: (record: KnowledgeRecord, file: File) => void;
}) {
  return (
    <section className="panel">
      <div className="sectionHeader">
        <h2>{title}</h2>
        <div className="sectionActions">
          <span>{records.length} </span>
          <button onClick={() => onAdd(type)} type="button">
            新增
          </button>
        </div>
      </div>
      <div className="recordList">
        {records.length === 0 ? (
          <div className="emptyState">这类资料还没有内容，可以先从右侧 AI 预留能力或手动编辑入口扩展</div>
        ) : (
          records.map((record) => (
            <article
              className={record.id === selectedRecordId ? "recordRow selected" : "recordRow"}
              key={record.id}
              onClick={() => onSelect(record)}
            >
              <div className="recordMain">
                <div className="recordMeta">
                  <span>{typeLabels[record.type]}</span>
                  <span>{record.status}</span>
                  <span>{record.images?.length ?? 0} </span>
                </div>
                <h3>{record.name}</h3>
                <p>{record.summary}</p>
              </div>
              <div className="recordTools">
                <div className="tagRow">
                  {record.tags.map((tag) => (
                    <span className="tag" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="recordActions">
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      onEdit(record);
                    }}
                    type="button"
                  >
                    编辑
                  </button>
                  <label onClick={(event) => event.stopPropagation()}>
                    上传图片
                    <input
                      accept="image/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          onUploadImage(record, file);
                          event.target.value = "";
                        }
                      }}
                      type="file"
                    />
                  </label>
                  <button
                    aria-label={`删除资料 ${record.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete(record);
                    }}
                    type="button"
                  >
                    <DeleteIcon />
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function createForeshadowingDraft(): ForeshadowingDraft {
  return {
    title: "未命名伏笔",
    status: "unresolved",
    setupChapterIds: [],
    payoffChapterIds: [],
    characterIds: [],
    summary: "",
    plan: "",
    result: "",
    tagsText: "",
  };
}

function foreshadowingToDraft(item: ForeshadowingItem): ForeshadowingDraft {
  return {
    title: item.title,
    status: item.status,
    setupChapterIds: item.setupChapterIds,
    payoffChapterIds: item.payoffChapterIds,
    characterIds: item.characterIds,
    summary: item.summary,
    plan: item.plan,
    result: item.result,
    tagsText: item.tags.join("，"),
  };
}

function DeleteIcon() {
  return <img alt="" aria-hidden="true" className="deleteIconImage" src="/delete-icon.png" />;
}

function EditIcon() {
  return <span aria-hidden="true" />;
}

function sortCharacterSuggestionsForReview(suggestions: AiSuggestion[]): AiSuggestion[] {
  return [...suggestions].sort((left, right) => {
    const manual = (left.importanceOverride ? 0 : 1) - (right.importanceOverride ? 0 : 1);
    if (manual) return manual;

    const score =
      (right.auditScore ?? right.importanceScore ?? 0) -
      (left.auditScore ?? left.importanceScore ?? 0);
    if (score) return score;

    const evidence = (right.sources?.length ?? 0) - (left.sources?.length ?? 0);
    if (evidence) return evidence;

    return (left.targetName ?? left.title).localeCompare(
      right.targetName ?? right.title,
      "zh-CN",
    );
  });
}

export function Workspace({ initialProjects }: { initialProjects: Project[] }) {
  const loginVideoRef = useRef<HTMLVideoElement | null>(null);
  const isContinuingFlightRef = useRef(false);
  const pendingDestinationProjectRef = useRef<string | null>(null);
  const destinationWheelLockRef = useRef(false);
  const chapterPreviewRefs = useRef<Record<string, HTMLElement | null>>({});
  const manuscriptReaderRef = useRef<HTMLDivElement | null>(null);
  const manuscriptEditorTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const manuscriptEditorScrollRatioRef = useRef(0);
  const databaseProjectSignaturesRef = useRef(new Map<string, string>());
  const currentProjectsRef = useRef(initialProjects);
  const mapCanvasFrameRef = useRef<HTMLDivElement | null>(null);
  const mapCanvasRef = useRef<HTMLDivElement | null>(null);
  const [projects, setProjects] = useState(initialProjects);
  const [activeProjectId, setActiveProjectId] = useState(initialProjects[0]?.id ?? "");
  const [view, setView] = useState<
    | "login"
    | "library"
    | "workspace"
    | "outline"
    | "characters"
    | "timeline"
    | "maps"
    | "clues"
    | "aiContinuation"
  >("login");
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [selectedRecordId, setSelectedRecordId] = useState(
    initialProjects[0]?.records[0]?.id ?? "",
  );
  const [recordDialog, setRecordDialog] = useState<RecordDialogState | null>(null);
  const [loginVideoEnded, setLoginVideoEnded] = useState(false);
  const [destinationLinks, setDestinationLinks] = useState<DestinationLinks>({
    "flight-destination-1": initialProjects[0]?.id,
  });
  const [storageReady, setStorageReady] = useState(false);
  const [databaseStatus, setDatabaseStatus] = useState<"checking" | "backup" | "ready" | "unavailable">("checking");
  const [databaseSyncStatus, setDatabaseSyncStatus] = useState<"synced" | "syncing" | "error">("synced");
  const [databaseSyncRetry, setDatabaseSyncRetry] = useState(0);
  const [isDatabaseRefreshing, setIsDatabaseRefreshing] = useState(false);
  const [isProjectIndexing, setIsProjectIndexing] = useState(false);
  const [isSuggestionRebuilding, setIsSuggestionRebuilding] = useState(false);
  const [isCharacterAuditing, setIsCharacterAuditing] = useState(false);
  const [indexingStatus, setIndexingStatus] = useState("");
  const [indexStatus, setIndexStatus] = useState<IndexStatus | null>(null);
  const [retrievalQuery, setRetrievalQuery] = useState("");
  const [isRetrieving, setIsRetrieving] = useState(false);
  const [retrievalEvidence, setRetrievalEvidence] = useState<RetrievalEvidence[]>([]);
  const [retrievalStatus, setRetrievalStatus] = useState("");
  const [destinationCreateTarget, setDestinationCreateTarget] = useState<string | null>(null);
  const [destinationOffset, setDestinationOffset] = useState(0);
  const [isDeletingWorld, setIsDeletingWorld] = useState(false);
  const [isDeleteWorldDialogOpen, setIsDeleteWorldDialogOpen] = useState(false);
  const [isContinuingFlight, setIsContinuingFlight] = useState(false);
  const [worldProjectTitle, setWorldProjectTitle] = useState("");
  const [worldCoverImage, setWorldCoverImage] = useState<Project["coverImage"]>();
  const [isEditingWorldTitle, setIsEditingWorldTitle] = useState(false);
  const [worldTitleDraft, setWorldTitleDraft] = useState(initialProjects[0]?.title ?? "");
  const [isWorldSynopsisDialogOpen, setIsWorldSynopsisDialogOpen] = useState(false);
  const [worldSynopsisDraft, setWorldSynopsisDraft] = useState(
    initialProjects[0]?.synopsis ?? "",
  );
  const [writingReferenceDialogSection, setWritingReferenceDialogSection] =
    useState<WritingReferenceDialogSection>(null);
  const [writingReferenceRequestDraft, setWritingReferenceRequestDraft] = useState({
    mustHappen: "",
    mustAvoid: "",
    atmosphere: "",
    other: "",
  });
  const [isAiSuggestionReviewDialogOpen, setIsAiSuggestionReviewDialogOpen] = useState(false);
  const [characterSuggestionMergeDialog, setCharacterSuggestionMergeDialog] =
    useState<CharacterSuggestionMergeDialogState | null>(null);
  const [aiSuggestionReviewStatus, setAiSuggestionReviewStatus] =
    useState<AiSuggestionReviewStatus>("pending");
  const [aiSuggestionReviewCategory, setAiSuggestionReviewCategory] =
    useState<AiSuggestionCategory>("characters");
  const [aiSuggestionReviewPage, setAiSuggestionReviewPage] = useState(1);
  const [aiSuggestionReviewPageDraft, setAiSuggestionReviewPageDraft] = useState("1");
  const [writingReferenceCharacterQuery, setWritingReferenceCharacterQuery] = useState("");
  const [isWritingReferenceCharacterPickerOpen, setIsWritingReferenceCharacterPickerOpen] =
    useState(false);
  const [workbenchNotice, setWorkbenchNotice] = useState("");
  const [todayWritingDialog, setTodayWritingDialog] = useState<"choices" | "goal" | null>(
    null,
  );
  const [currentChapterGoalDraft, setCurrentChapterGoalDraft] = useState({
    plot: "",
    characterChange: "",
    conflict: "",
    foreshadowing: "",
    endingHook: "",
    lockedRules: "",
  });
  const aiContinuationAbortRef = useRef<AbortController | null>(null);
  const [aiContinuationLength, setAiContinuationLength] = useState<AiContinuationLength>(1000);
  const [aiContinuationInstruction, setAiContinuationInstruction] = useState("");
  const [aiContinuationOutput, setAiContinuationOutput] = useState("");
  const [aiContinuationProgress, setAiContinuationProgress] = useState(0);
  const [aiContinuationStatus, setAiContinuationStatus] = useState("待生成");
  const [aiContinuationError, setAiContinuationError] = useState("");
  const [aiContinuationHomeHint, setAiContinuationHomeHint] = useState("");
  const [aiAnalysisHomeHint, setAiAnalysisHomeHint] = useState("");
  const [isAiContinuationRunning, setIsAiContinuationRunning] = useState(false);
  const [aiFeatureMode, setAiFeatureMode] = useState<"continuation" | "analysis">(
    "continuation",
  );
  const [aiAnalysisCharacterDialog, setAiAnalysisCharacterDialog] = useState<
    "matched" | "candidate" | "candidateClue" | null
  >(null);
  const [selectedAiAnalysisCharacterNames, setSelectedAiAnalysisCharacterNames] = useState<
    string[]
  >([]);
  const [selectedAiAnalysisForeshadowingKey, setSelectedAiAnalysisForeshadowingKey] =
    useState("");
  const [aiAnalysisForeshadowingEditDraft, setAiAnalysisForeshadowingEditDraft] =
    useState<{
      chapterId: string;
      index: number;
      title: string;
      detail: string;
    } | null>(null);
  const [aiContinuationReport, setAiContinuationReport] = useState<AiContinuationReport | null>(
    null,
  );
  const [aiContinuationContext, setAiContinuationContext] = useState<AiContinuationContext | null>(null);
  const [aiContinuationConsistencyReport, setAiContinuationConsistencyReport] =
    useState<ContinuationConsistencyReport | null>(null);
  const [isAiContinuationChecking, setIsAiContinuationChecking] = useState(false);
  const [aiContinuationCheckError, setAiContinuationCheckError] = useState("");
  const [aiContinuationRunId, setAiContinuationRunId] = useState("");
  const [aiContinuationFeedbackReason, setAiContinuationFeedbackReason] = useState("");
  const [aiNextChapterTitle, setAiNextChapterTitle] = useState("");
  const [aiCreativeAnswers, setAiCreativeAnswers] = useState({
    foreshadowingToPayoff: "",
    newHooks: "",
    characterHighlights: "",
    mustHaveOrAvoid: "",
    needDirectionOptions: false,
  });
  const chapterAnalysisAbortRef = useRef<AbortController | null>(null);
  const [isChapterAnalysisRunning, setIsChapterAnalysisRunning] = useState(false);
  const [isClueDiagnosisRunning, setIsClueDiagnosisRunning] = useState(false);
  const [chapterAnalysisProgress, setChapterAnalysisProgress] = useState(0);
  const [chapterAnalysisStatus, setChapterAnalysisStatus] = useState("未解析");
  const [chapterAnalysisRunMode, setChapterAnalysisRunMode] = useState<ChapterAnalysisMode>("fast");
  const [chapterAnalysisRunTotal, setChapterAnalysisRunTotal] = useState(0);
  const [chapterAnalysisRunCompleted, setChapterAnalysisRunCompleted] = useState(0);
  const [chapterAnalysisRunActive, setChapterAnalysisRunActive] = useState(0);
  const [chapterAnalysisRunSkipped, setChapterAnalysisRunSkipped] = useState(0);
  const [chapterAnalysisError, setChapterAnalysisError] = useState("");
  const [chapterAnalysisRecoveries, setChapterAnalysisRecoveries] = useState<
    ChapterAnalysisRecovery[]
  >([]);
  const [chapterAnalysisFailures, setChapterAnalysisFailures] = useState<ChapterAnalysisFailure[]>([]);
  const [isChapterAnalysisFailureDialogOpen, setIsChapterAnalysisFailureDialogOpen] =
    useState(false);
  const [isManuscriptUploadOpen, setIsManuscriptUploadOpen] = useState(false);
  const [manuscriptUploadMode, setManuscriptUploadMode] = useState<"whole" | "chapter" | null>(
    null,
  );
  const [chapterTitleDraft, setChapterTitleDraft] = useState("");
  const [chapterContentDraft, setChapterContentDraft] = useState("");
  const [outlineMode, setOutlineMode] = useState<ManuscriptMode>("preview");
  const [selectedManuscriptChapterId, setSelectedManuscriptChapterId] = useState("");
  const [editingChapterId, setEditingChapterId] = useState("");
  const [chapterTitleEditDraft, setChapterTitleEditDraft] = useState("");
  const [editingManuscriptChapterId, setEditingManuscriptChapterId] = useState("");
  const [manuscriptContentEditDraft, setManuscriptContentEditDraft] = useState("");
  const [isManuscriptDiscardDialogOpen, setIsManuscriptDiscardDialogOpen] = useState(false);
  const [selectedOutlinePartIds, setSelectedOutlinePartIds] = useState<string[]>([]);
  const [editingOutlinePartId, setEditingOutlinePartId] = useState("");
  const [outlinePartDraft, setOutlinePartDraft] = useState({
    title: "",
    chapterIds: [] as string[],
    characterIds: [] as string[],
    summary: "",
  });
  const [outlinePartChapterQuery, setOutlinePartChapterQuery] = useState("");
  const [outlinePartCharacterQuery, setOutlinePartCharacterQuery] = useState("");
  const [draggedOutlinePartId, setDraggedOutlinePartId] = useState("");
  const [selectedCharacterId, setSelectedCharacterId] = useState("");
  const [draggedCharacterAttributeKind, setDraggedCharacterAttributeKind] =
    useState<CharacterAttributeKind | "">("");
  const [draggedCharacterAttributeToken, setDraggedCharacterAttributeToken] = useState("");
  const [editingCharacterAttributeId, setEditingCharacterAttributeId] = useState("");
  const [characterAttributeTitleDraft, setCharacterAttributeTitleDraft] = useState("");
  const [isCustomCharacterAttributeDialogOpen, setIsCustomCharacterAttributeDialogOpen] =
    useState(false);
  const [customCharacterAttributeTitleDraft, setCustomCharacterAttributeTitleDraft] =
    useState("\u81ea\u5b9a\u4e49\u5c5e\u6027");
  const [isCharacterGalleryOpen, setIsCharacterGalleryOpen] = useState(false);
  const [selectedTimelineEventId, setSelectedTimelineEventId] = useState("");
  const [timelineDetailEventId, setTimelineDetailEventId] = useState("");
  const [timelineDraftEvent, setTimelineDraftEvent] = useState<TimelineEvent | null>(null);
  const [timelineRelationPicker, setTimelineRelationPicker] =
    useState<TimelineRelationPickerState | null>(null);
  const [draggedTimelineEventId, setDraggedTimelineEventId] = useState("");
  const [timelineZoom, setTimelineZoom] = useState<Record<TimelineEventLane, number>>({
    story: 100,
    world: 100,
  });
  const [selectedMapId, setSelectedMapId] = useState("");
  const [isMapBasePickerOpen, setIsMapBasePickerOpen] = useState(false);
  const [mapContextMenu, setMapContextMenu] = useState<MapContextMenuState | null>(null);
  const [mapTextDraft, setMapTextDraft] = useState<{
    text: string;
    color: MapTextColor;
    font: MapTextFont;
    fontSize: number;
  }>({
    text: "新文本",
    color: "white",
    font: "sans",
    fontSize: 24,
  });
  const [mapTextEdit, setMapTextEdit] = useState<MapTextEditState | null>(null);
  const [mapImageGesture, setMapImageGesture] = useState<MapImageGesture | null>(null);
  const clueCanvasRef = useRef<HTMLDivElement | null>(null);
  const [clueSection, setClueSection] = useState<ClueSection>("mindMap");
  const [draftClueBoards, setDraftClueBoards] = useState<ClueBoard[]>([]);
  const [draftRelationshipGraphs, setDraftRelationshipGraphs] = useState<RelationshipGraph[]>([]);
  const [draftForeshadowings, setDraftForeshadowings] = useState<ForeshadowingItem[]>([]);
  const [clueDraftProjectId, setClueDraftProjectId] = useState("");
  const [savedClueBoardsJson, setSavedClueBoardsJson] = useState("[]");
  const [savedRelationshipGraphsJson, setSavedRelationshipGraphsJson] = useState("[]");
  const [savedForeshadowingsJson, setSavedForeshadowingsJson] = useState("[]");
  const [selectedClueBoardId, setSelectedClueBoardId] = useState("");
  const [selectedRelationshipGraphId, setSelectedRelationshipGraphId] = useState("");
  const [foreshadowingStatusFilter, setForeshadowingStatusFilter] =
    useState<ForeshadowingStatusFilter>("all");
  const [foreshadowingSearchQuery, setForeshadowingSearchQuery] = useState("");
  const [foreshadowingDialog, setForeshadowingDialog] =
    useState<ForeshadowingDialogState | null>(null);
  const [foreshadowingSetupChapterQuery, setForeshadowingSetupChapterQuery] = useState("");
  const [foreshadowingPayoffChapterQuery, setForeshadowingPayoffChapterQuery] = useState("");
  const [foreshadowingCharacterQuery, setForeshadowingCharacterQuery] = useState("");
  const [isClueBoardManagerMenuOpen, setIsClueBoardManagerMenuOpen] = useState(false);
  const [isRelationshipGraphManagerMenuOpen, setIsRelationshipGraphManagerMenuOpen] = useState(false);
  const [clueBoardManagerDialog, setClueBoardManagerDialog] =
    useState<ClueBoardManagerDialogState | null>(null);
  const [relationshipGraphManagerDialog, setRelationshipGraphManagerDialog] =
    useState<RelationshipGraphManagerDialogState | null>(null);
  const [isRelationshipCharacterPickerOpen, setIsRelationshipCharacterPickerOpen] = useState(false);
  const [relationshipCharacterQuery, setRelationshipCharacterQuery] = useState("");
  const [relationshipLineDraft, setRelationshipLineDraft] = useState<{
    sourceNodeId: string;
    direction: RelationshipLineDirection;
  } | null>(null);
  const [relationshipContextMenu, setRelationshipContextMenu] =
    useState<RelationshipContextMenuState | null>(null);
  const [editingRelationshipLineId, setEditingRelationshipLineId] = useState("");
  const [relationshipLineLabelDraft, setRelationshipLineLabelDraft] = useState("");
  const [editingClueNodeId, setEditingClueNodeId] = useState("");
  const [clueMentionCharacterId, setClueMentionCharacterId] = useState("");
  const [clueLinkDragNodeId, setClueLinkDragNodeId] = useState("");
  const [clueContextMenu, setClueContextMenu] = useState<ClueContextMenuState | null>(null);
  const [clueRelationDraft, setClueRelationDraft] = useState<{
    sourceNodeId: string;
    kind: ClueRelationLineKind;
  } | null>(null);
  const [editingClueRelationId, setEditingClueRelationId] = useState("");
  const [clueRelationLabelDraft, setClueRelationLabelDraft] = useState("");
  const [editingClueSummaryId, setEditingClueSummaryId] = useState("");
  const [clueSummaryTextDraft, setClueSummaryTextDraft] = useState("");
  const [clueMcpStatus, setClueMcpStatus] = useState("");

  function applyDatabaseProjects(serverProjects: Project[]) {
    databaseProjectSignaturesRef.current = createProjectSignatures(serverProjects);
    const currentUrl = new URL(window.location.href);
    const requestedProjectId = currentUrl.searchParams.get("projectId");
    const requestedProject = requestedProjectId
      ? serverProjects.find((item) => item.id === requestedProjectId)
      : undefined;

    if (requestedProjectId) {
      currentUrl.searchParams.delete("projectId");
      window.history.replaceState(null, "", `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
    }

    setProjects(serverProjects);
    setDestinationLinks((links) => normalizeDestinationLinks(links, serverProjects));
    setActiveProjectId((current) =>
      requestedProject?.id ?? (serverProjects.some((item) => item.id === current) ? current : serverProjects[0]?.id ?? ""),
    );
    setSelectedRecordId((current) =>
      requestedProject
        ? requestedProject.records[0]?.id ?? ""
        : serverProjects.some((item) => item.records.some((record) => record.id === current))
        ? current
        : serverProjects[0]?.records[0]?.id ?? "",
    );
    if (requestedProject) setView("workspace");
    try {
      clearLegacyWorkspaceStorage(window.localStorage);
    } catch {
      // The database load remains authoritative even when the browser disallows storage cleanup.
    }
  }

  async function refreshProjectsFromDatabase() {
    const serverProjects = await loadServerProjects();
    if (!serverProjects.length) {
      throw new Error("数据库中尚未找到作品。");
    }
    applyDatabaseProjects(serverProjects);
    setDatabaseStatus("ready");
    setDatabaseSyncStatus("synced");
  }

  useEffect(() => {
    setStorageReady(true);
    let cancelled = false;
    void refreshProjectsFromDatabase().catch(() => {
      if (!cancelled) setDatabaseStatus("unavailable");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (view !== "login" || loginVideoEnded || isContinuingFlight) {
      return;
    }

    const fallbackTimer = window.setTimeout(() => {
      if (
        shouldRevealFlightDestinationOnFallback(
          isContinuingFlightRef.current,
          loginVideoEnded,
        )
      ) {
        setLoginVideoEnded(true);
      }
    }, flightIntroFallbackDelayMs);

    return () => window.clearTimeout(fallbackTimer);
  }, [isContinuingFlight, loginVideoEnded, view]);

  useEffect(() => {
    currentProjectsRef.current = projects;
  }, [projects]);

  useEffect(() => {
    if (!storageReady || databaseStatus !== "ready") return;
    const projectsToPersist = projects;
    const nextSignatures = createProjectSignatures(projectsToPersist);
    const savedSignatures = databaseProjectSignaturesRef.current;
    if (projectSignaturesMatch(nextSignatures, savedSignatures)) return;

    const timer = window.setTimeout(async () => {
      setDatabaseSyncStatus("syncing");
      const changedProjects = projectsToPersist.filter((item) => savedSignatures.get(item.id) !== nextSignatures.get(item.id));
      const deletedProjectIds = [...savedSignatures.keys()].filter((id) => !nextSignatures.has(id));
      try {
        await Promise.all([
          ...changedProjects.map((item) => saveServerProject(item)),
          ...deletedProjectIds.map((projectId) => deleteServerProject(projectId)),
        ]);
        databaseProjectSignaturesRef.current = nextSignatures;
        setDatabaseSyncStatus("synced");
      } catch {
        setDatabaseSyncStatus("error");
        window.setTimeout(() => setDatabaseSyncRetry((value) => value + 1), 5000);
      }
    }, 800);

    return () => window.clearTimeout(timer);
  }, [databaseStatus, databaseSyncRetry, projects, storageReady]);

  useEffect(() => {
    if (!storageReady || databaseStatus !== "ready") return;
    let cancelled = false;
    const pollServerProjects = async () => {
      if (!projectSignaturesMatch(createProjectSignatures(currentProjectsRef.current), databaseProjectSignaturesRef.current)) return;
      try {
        const serverProjects = await loadServerProjects();
        if (!serverProjects.length) return;
        const serverSignatures = createProjectSignatures(serverProjects);
        if (cancelled || projectSignaturesMatch(serverSignatures, databaseProjectSignaturesRef.current)) return;
        applyDatabaseProjects(serverProjects);
        setDatabaseSyncStatus("synced");
      } catch {
        if (!cancelled) setDatabaseSyncStatus("error");
      }
    };
    const timer = window.setInterval(pollServerProjects, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [databaseStatus, storageReady]);

  async function handleRefreshProjectsFromDatabase() {
    setIsDatabaseRefreshing(true);
    setDatabaseSyncStatus("syncing");
    try {
      await refreshProjectsFromDatabase();
      setWorkbenchNotice("已立即从数据库刷新作品列表；其他浏览器将看到同一份数据。");
    } catch (error) {
      setDatabaseStatus("unavailable");
      setDatabaseSyncStatus("error");
      setWorkbenchNotice(error instanceof Error ? error.message : "数据库刷新失败，请检查服务后重试。");
    } finally {
      setIsDatabaseRefreshing(false);
    }
  }

  async function handleIndexProject() {
    setIsProjectIndexing(true);
    setIndexingStatus("正在准备章节切块与向量索引…");
    try {
      const result = await indexProject(project.id);
      const latestStatus = await loadIndexStatus(project.id);
      setIndexStatus(latestStatus);
      setIndexingStatus(
        result.indexedChapters
          ? `本次完成 ${result.indexedChapters} 章、${result.indexedChunks} 个文本块；仍待处理 ${latestStatus.pendingChapters} 章。`
          : "无需更新：所有章节索引均为最新。",
      );
    } catch {
      setIndexingStatus("建立索引失败，请检查本机数据库与 Embedding 配置后重试。");
    } finally {
      setIsProjectIndexing(false);
    }
  }

  async function handleCanonicalCharacterCleanup() {
    setIsSuggestionRebuilding(true);
    try {
      const nextProject = await rebuildProjectSuggestions(project.id, true);
      setProjects((currentProjects) => currentProjects.map((item) => item.id === nextProject.id ? nextProject : item));
      setWorkbenchNotice("已按确认的称呼表重整人物建议；“老吴”等无明确语境的称呼仍保留待确认。");
      setDatabaseSyncStatus("synced");
    } catch {
      setWorkbenchNotice("人物称呼整理失败，原有建议未被修改。");
    } finally {
      setIsSuggestionRebuilding(false);
    }
  }

  async function handleCharacterAudit(force = false) {
    setIsCharacterAuditing(true);
    try {
      const result = await auditProjectCharacters(project.id, force);
      setProjects((currentProjects) => currentProjects.map((item) => item.id === result.project.id ? result.project : item));
      setWorkbenchNotice(result.cached ? "人物重要度复核未发现变化，已使用上次结果。" : "人物重要度已由独立模型复核；含风险或临界分数的项目已标记为人工重点确认。");
      setDatabaseSyncStatus("synced");
    } catch (error) {
      setWorkbenchNotice(error instanceof Error ? error.message : "人物重要度复核失败，原有建议未修改。");
    } finally {
      setIsCharacterAuditing(false);
    }
  }

  async function handleRetrievalValidation() {
    const query = retrievalQuery.trim();
    if (!query) return;
    setIsRetrieving(true);
    setRetrievalStatus("正在检索本书已建立的向量索引…");
    try {
      const evidence = await retrieveProjectEvidence(project.id, query);
      setRetrievalEvidence(evidence);
      setRetrievalStatus(evidence.length ? `已返回 ${evidence.length} 条候选证据。` : "没有命中可用的章节文本。");
    } catch {
      setRetrievalEvidence([]);
      setRetrievalStatus("检索验证失败，请检查数据库与 Embedding 配置后重试。");
    } finally {
      setIsRetrieving(false);
    }
  }

  const project = useMemo(
    () => resolveActiveProject(projects, activeProjectId) ?? projects[0],
    [activeProjectId, projects],
  );
  const aiContinuationFeedback = project?.continuationRuns?.find(
    (run) => run.id === aiContinuationRunId,
  )?.feedback;
  const reliabilityMetrics = getProjectReliabilityMetrics(project);
  const lockedWorldRuleCount = project.records.filter(
    (record) => record.type === "worldRule" && record.status === "locked",
  ).length;
  const pendingAiSuggestionCount = (project.aiSuggestionPool ?? []).filter(
    (suggestion) => suggestion.status === "pending",
  ).length;
  useEffect(() => {
    if (databaseStatus !== "ready" || !project?.id) return;
    loadIndexStatus(project.id).then(setIndexStatus).catch(() => setIndexStatus(null));
  }, [databaseStatus, project?.id]);

  useEffect(() => {
    if (!project?.chapterAnalyses?.length) {
      return;
    }

    const nextPool = buildAiSuggestionPool(project);
    const currentPool = project.aiSuggestionPool ?? [];
    if (
      project.aiSuggestionsInitialized &&
      JSON.stringify(currentPool) === JSON.stringify(nextPool)
    ) {
      return;
    }

    setProjects((currentProjects) =>
      currentProjects.map((item) =>
        item.id === project.id
          ? {
              ...item,
              aiSuggestionPool: buildAiSuggestionPool(item),
              aiSuggestionsInitialized: true,
            }
          : item,
      ),
    );
  }, [project]);
  const characters = getProjectCharacters(project);
  const timelineEvents = project.timelineEvents ?? [];
  const storyMaps = project.maps ?? [];
  const persistedClueBoards = normalizeClueBoards(project.clueBoards);
  const persistedRelationshipGraphs = normalizeRelationshipGraphs(project.relationshipGraphs);
  const persistedForeshadowings = normalizeForeshadowings(project.foreshadowings, project.records);
  const clueBoards =
    view === "clues" && clueDraftProjectId === project.id ? draftClueBoards : persistedClueBoards;
  const relationshipGraphs =
    view === "clues" && clueDraftProjectId === project.id
      ? draftRelationshipGraphs
      : persistedRelationshipGraphs;
  const foreshadowings =
    view === "clues" && clueDraftProjectId === project.id
      ? draftForeshadowings
      : persistedForeshadowings;
  const isClueDraftDirty =
    view === "clues" &&
    clueDraftProjectId === project.id &&
    (JSON.stringify(draftClueBoards) !== savedClueBoardsJson ||
      JSON.stringify(draftRelationshipGraphs) !== savedRelationshipGraphsJson ||
      JSON.stringify(draftForeshadowings) !== savedForeshadowingsJson);
  const isMindMapDraftDirty =
    view === "clues" &&
    clueDraftProjectId === project.id &&
    JSON.stringify(draftClueBoards) !== savedClueBoardsJson;
  const isRelationshipDraftDirty =
    view === "clues" &&
    clueDraftProjectId === project.id &&
    JSON.stringify(draftRelationshipGraphs) !== savedRelationshipGraphsJson;
  const isForeshadowingDraftDirty =
    view === "clues" &&
    clueDraftProjectId === project.id &&
    JSON.stringify(draftForeshadowings) !== savedForeshadowingsJson;
  const foreshadowingStats = getForeshadowingStats(foreshadowings);
  const filteredForeshadowings = filterForeshadowings(foreshadowings, {
    status: foreshadowingStatusFilter,
    query: foreshadowingSearchQuery,
  });
  const selectedMap = storyMaps.find((map) => map.id === selectedMapId) ?? storyMaps[0];
  const selectedClueBoard =
    clueBoards.find((board) => board.id === selectedClueBoardId) ?? clueBoards[0];
  const selectedRelationshipGraph =
    relationshipGraphs.find((graph) => graph.id === selectedRelationshipGraphId) ??
    relationshipGraphs[0];
  const selectedRelationshipNode =
    selectedRelationshipGraph?.nodes.find((node) => node.id === selectedRelationshipGraph.selectedNodeId) ??
    selectedRelationshipGraph?.nodes[0];
  const selectedClueNode =
    selectedClueBoard?.nodes.find((node) => node.id === selectedClueBoard.selectedNodeId) ??
    selectedClueBoard?.nodes[0];
  const clueMentionCharacter = characters.find(
    (character) => character.id === clueMentionCharacterId,
  );
  const selectedCharacter =
    characters.find((character) => character.id === selectedCharacterId) ?? characters[0];
  const timelineDetailEvent = timelineEvents.find((event) => event.id === timelineDetailEventId);

  useEffect(() => {
    if (!isWorldSynopsisDialogOpen) {
      setWorldSynopsisDraft(project.synopsis ?? "");
    }
  }, [isWorldSynopsisDialogOpen, project.synopsis]);

  useEffect(() => {
    setTimelineDraftEvent(timelineDetailEvent ? { ...timelineDetailEvent } : null);
  }, [timelineDetailEvent]);

  useEffect(() => {
    if (!timelineDetailEventId) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleCloseTimelineDetail();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [timelineDetailEventId]);

  useEffect(() => {
    if (view === "characters" && characters.length && !selectedCharacterId) {
      setSelectedCharacterId(characters[0].id);
    }
  }, [characters, selectedCharacterId, view]);

  useEffect(() => {
    if (view === "maps" && storyMaps.length && !selectedMapId) {
      setSelectedMapId(storyMaps[0].id);
    }
  }, [selectedMapId, storyMaps, view]);

  useEffect(() => {
    if (view !== "clues") {
      return;
    }

    if (clueDraftProjectId !== project.id) {
      const nextClueBoards = normalizeClueBoards(project.clueBoards);
      const nextRelationshipGraphs = normalizeRelationshipGraphs(project.relationshipGraphs);
      const nextForeshadowings = normalizeForeshadowings(project.foreshadowings, project.records);
      setDraftClueBoards(nextClueBoards);
      setDraftRelationshipGraphs(nextRelationshipGraphs);
      setDraftForeshadowings(nextForeshadowings);
      setClueDraftProjectId(project.id);
      setSavedClueBoardsJson(JSON.stringify(nextClueBoards));
      setSavedRelationshipGraphsJson(JSON.stringify(nextRelationshipGraphs));
      setSavedForeshadowingsJson(JSON.stringify(nextForeshadowings));
      setSelectedClueBoardId(nextClueBoards[0]?.id ?? "");
      setSelectedRelationshipGraphId(nextRelationshipGraphs[0]?.id ?? "");
      setForeshadowingDialog(null);
      setEditingClueNodeId("");
      setClueMentionCharacterId("");
      setClueContextMenu(null);
      setClueRelationDraft(null);
      setEditingClueRelationId("");
      setEditingClueSummaryId("");
      setRelationshipLineDraft(null);
      setEditingRelationshipLineId("");
      return;
    }

    if (!selectedClueBoardId || !clueBoards.some((board) => board.id === selectedClueBoardId)) {
      setSelectedClueBoardId(clueBoards[0]?.id ?? "");
    }

    if (
      !selectedRelationshipGraphId ||
      !relationshipGraphs.some((graph) => graph.id === selectedRelationshipGraphId)
    ) {
      setSelectedRelationshipGraphId(relationshipGraphs[0]?.id ?? "");
    }
  }, [
    clueBoards,
    clueDraftProjectId,
    project.clueBoards,
    project.foreshadowings,
    project.id,
    project.records,
    project.relationshipGraphs,
    relationshipGraphs,
    selectedClueBoardId,
    selectedRelationshipGraphId,
    view,
  ]);

  useEffect(() => {
    if (view !== "clues") {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!selectedClueBoard) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const isTextInput =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        Boolean(target?.isContentEditable);

      if ((event.ctrlKey || event.metaKey) && !event.altKey && (event.key === "+" || event.key === "=")) {
        event.preventDefault();
        updateActiveClueBoards(
          updateClueBoardZoom(clueBoards, selectedClueBoard.id, selectedClueBoard.zoom + 10),
        );
        return;
      }

      if ((event.ctrlKey || event.metaKey) && !event.altKey && (event.key === "-" || event.key === "_")) {
        event.preventDefault();
        updateActiveClueBoards(
          updateClueBoardZoom(clueBoards, selectedClueBoard.id, selectedClueBoard.zoom - 10),
        );
        return;
      }

      if (isTextInput || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      if (event.key === "Tab") {
        event.preventDefault();
        handleAddClueNode("child");
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        handleAddClueNode("sibling");
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        handleDeleteSelectedClueNode();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [clueBoards, selectedClueBoard, selectedClueNode, view]);

  useEffect(() => {
    if (!isEditingWorldTitle) {
      setWorldTitleDraft(project.title);
    }
  }, [isEditingWorldTitle, project.title]);

  useEffect(() => {
    if (outlineMode !== "preview" || !selectedManuscriptChapterId) {
      return;
    }

    window.requestAnimationFrame(() => {
      chapterPreviewRefs.current[selectedManuscriptChapterId]?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, [outlineMode, selectedManuscriptChapterId]);

  useEffect(() => {
    if (!editingManuscriptChapterId) {
      return;
    }

    window.requestAnimationFrame(() => {
      const textarea = manuscriptEditorTextareaRef.current;
      if (!textarea) {
        return;
      }

      const maxScroll = textarea.scrollHeight - textarea.clientHeight;
      textarea.scrollTop = maxScroll > 0 ? maxScroll * manuscriptEditorScrollRatioRef.current : 0;
      textarea.focus();
    });
  }, [editingManuscriptChapterId]);

  const stats = getKnowledgeStats(project);
  const openClues = searchKnowledge(project, "", "foreshadowing").filter(
    (record) => record.status === "open",
  );
  const timeline = searchKnowledge(project, "", "timeline");
  const selectedRecord =
    project.records.find((record) => record.id === selectedRecordId) ??
    project.records[0];
  const relatedRecords = selectedRecord
    ? getRelatedRecords(project, selectedRecord)
    : [];
  const reservedAiTasks = aiTasks.map((task) =>
    createAiTaskDescriptor(task, project.id),
  );
  const projectIds = new Set(projects.map((item) => item.id));
  const orderedDestinationSlots = [...flightDestinationSlots].sort((first, second) => {
    const firstProjectId = destinationLinks[first.id];
    const secondProjectId = destinationLinks[second.id];
    const firstHasProject = firstProjectId ? projectIds.has(firstProjectId) : false;
    const secondHasProject = secondProjectId ? projectIds.has(secondProjectId) : false;

    if (firstHasProject === secondHasProject) {
      return 0;
    }

    return firstHasProject ? -1 : 1;
  });
  const visibleDestinationSlots = orderedDestinationSlots.map((_, index) => {
    const slotIndex =
      (index + destinationOffset + orderedDestinationSlots.length) %
      orderedDestinationSlots.length;
    return orderedDestinationSlots[slotIndex];
  });

  function handleAddProject() {
    const nextProjects = addProject(projects, newProjectTitle);
    const createdProject = nextProjects[nextProjects.length - 1];
    setProjects(nextProjects);
    setActiveProjectId(createdProject.id);
    setNewProjectTitle("");
  }

  function handleOpenProject(projectId: string) {
    setActiveProjectId(projectId);
    setSelectedRecordId(
      projects.find((item) => item.id === projectId)?.records[0]?.id ?? "",
    );
    setView("workspace");
  }

  function continueFlightToProject(projectId: string) {
    pendingDestinationProjectRef.current = projectId;
    isContinuingFlightRef.current = true;
    setIsContinuingFlight(true);
    setLoginVideoEnded(false);
    setDestinationCreateTarget(null);

    window.requestAnimationFrame(() => {
      const video = loginVideoRef.current;
      if (!video) {
        handleOpenProject(projectId);
        return;
      }

      void video.play();
    });
  }

  function handleDestinationClick(destinationId: string) {
    const linkedProject = getDestinationProject(projects, destinationLinks, destinationId);
    if (isDeletingWorld) {
      if (linkedProject) {
        handleDeleteWorld(linkedProject.id);
      }
      setIsDeletingWorld(false);
      return;
    }

    if (linkedProject) {
      continueFlightToProject(linkedProject.id);
      return;
    }

    setDestinationCreateTarget(destinationId);
    setWorldProjectTitle("");
    setWorldCoverImage(undefined);
  }

  function handleStartCreateWorld() {
    const emptySlot =
      flightDestinationSlots.find((slot) => !destinationLinks[slot.id]) ??
      flightDestinationSlots[0];
    setDestinationCreateTarget(emptySlot.id);
    setWorldProjectTitle("");
    setWorldCoverImage(undefined);
    setIsDeletingWorld(false);
  }

  function shiftDestination(direction: -1 | 1) {
    setDestinationOffset(
      (current) =>
        (current + direction + flightDestinationSlots.length) %
        flightDestinationSlots.length,
    );
  }

  function handleDestinationWheel(event: React.WheelEvent<HTMLElement>) {
    const direction = getDestinationWheelDirection(event.deltaY);
    if (direction === 0 || destinationWheelLockRef.current) {
      return;
    }

    event.preventDefault();
    destinationWheelLockRef.current = true;
    shiftDestination(direction);
    window.setTimeout(() => {
      destinationWheelLockRef.current = false;
    }, 320);
  }

  function handleDeleteWorld(projectId: string) {
    if (projects.length <= 1) {
      window.alert("至少需要保留一个世界。");
      return;
    }

    const targetProject = projects.find((item) => item.id === projectId);
    const confirmed = window.confirm(`确认删除世界「${targetProject?.title ?? "未命名"}」吗？`);
    if (!confirmed) {
      return;
    }

    const remaining = deleteProject(projects, projectId);
    setProjects(remaining);
    setDestinationLinks(removeProjectFromDestinationLinks(destinationLinks, projectId));
    setIsDeleteWorldDialogOpen(false);
    setIsDeletingWorld(false);
    setActiveProjectId(resolveActiveProject(remaining, activeProjectId)?.id ?? "");
    setSelectedRecordId(resolveActiveProject(remaining, activeProjectId)?.records[0]?.id ?? "");
  }

  function handleCreateDestinationProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!destinationCreateTarget) {
      return;
    }

    const nextProjects = addProject(projects, worldProjectTitle, worldCoverImage);
    const createdProject = nextProjects[nextProjects.length - 1];
    setProjects(nextProjects);
    setDestinationLinks(
      assignProjectToDestination(destinationLinks, destinationCreateTarget, createdProject.id),
    );
    setDestinationCreateTarget(null);
    setWorldProjectTitle("");
    setWorldCoverImage(undefined);
    setActiveProjectId(createdProject.id);
    setSelectedRecordId(createdProject.records[0]?.id ?? "");
    continueFlightToProject(createdProject.id);
  }

  async function handleWorldCoverUpload(file: File) {
    const coverUrl = await readFileAsDataUrl(file);
    setWorldCoverImage({
      name: file.name,
      url: coverUrl,
    });
  }

  function handleRenameProject() {
    const nextTitle = window.prompt("修改小说标题", project.title);
    if (nextTitle === null) {
      return;
    }

    setProjects(renameProject(projects, project.id, nextTitle));
  }

  function handleSaveWorldTitle() {
    setProjects(renameProject(projects, project.id, worldTitleDraft));
    setIsEditingWorldTitle(false);
  }

  function handleOpenWorldSynopsisDialog() {
    setWorldSynopsisDraft((project.synopsis ?? "").slice(0, 80));
    setIsWorldSynopsisDialogOpen(true);
  }

  function handleSaveWorldSynopsis() {
    setProjects(updateProjectSynopsis(projects, project.id, worldSynopsisDraft));
    setIsWorldSynopsisDialogOpen(false);
  }

  function handleDeleteProject() {
    if (projects.length <= 1) {
      window.alert("至少需要保留一本小说。");
      return;
    }

    const confirmed = window.confirm(`确定删除《${project.title}》吗？`);
    if (!confirmed) {
      return;
    }

    const remaining = deleteProject(projects, project.id);
    setProjects(remaining);
    setDestinationLinks(removeProjectFromDestinationLinks(destinationLinks, project.id));
    setActiveProjectId(resolveActiveProject(remaining, project.id)?.id ?? "");
    setSelectedRecordId(resolveActiveProject(remaining, project.id)?.records[0]?.id ?? "");
  }

  function updateActiveProject(nextProject: Project | ((currentProject: Project) => Project)) {
    const targetProjectId = typeof nextProject === "function" ? project?.id : nextProject.id;
    setProjects((currentProjects) =>
      currentProjects.map((item) => {
        if (item.id !== targetProjectId) {
          return item;
        }
        return typeof nextProject === "function" ? nextProject(item) : nextProject;
      }),
    );
  }

  async function handleStartAiContinuation(strategyId: ContinuationStrategyId = "deep") {
    if (!project) {
      return;
    }

    aiContinuationAbortRef.current?.abort();
    const controller = new AbortController();
    aiContinuationAbortRef.current = controller;
    setAiContinuationOutput("");
    setAiContinuationReport(null);
    setAiContinuationContext(null);
    setAiContinuationConsistencyReport(null);
    setAiContinuationCheckError("");
    setAiContinuationRunId("");
    setAiContinuationError("");
    setAiContinuationProgress(0);
    setAiContinuationStatus("整理资料中");
    setIsAiContinuationRunning(true);

    try {
      const strategy = getContinuationStrategy(strategyId);
      const lastChapter = project.manuscript?.chapters.at(-1);
      const retrievalQuery = aiContinuationInstruction.trim()
        || `${lastChapter?.title ?? ""} ${lastChapter?.content.slice(-240) ?? ""}`.trim();
      let retrievalEvidence: RetrievalEvidence[] = [];
      if (strategy.usesRetrieval && retrievalQuery) {
        try {
          retrievalEvidence = await retrieveProjectEvidence(project.id, retrievalQuery);
        } catch {
          retrievalEvidence = [];
        }
      }
      const continuationContext = buildAiContinuationContext(project, {
        targetLength: aiContinuationLength,
        userInstruction: aiContinuationInstruction,
        creativeAnswers: aiCreativeAnswers,
        retrievalEvidence,
      });
      setAiContinuationContext(continuationContext);

      const response = await fetch("/api/ai/continue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project,
          targetLength: aiContinuationLength,
          userInstruction: aiContinuationInstruction,
          creativeAnswers: aiCreativeAnswers,
          retrievalEvidence,
          strategy: strategyId,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "AI 续写请求失败。");
      }

      if (!response.body) {
        throw new Error("AI 续写没有返回内容。");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";

      const handleEvent = (event: {
        type?: string;
        status?: string;
        progress?: number;
        token?: string;
        text?: string;
        report?: AiContinuationReport;
        error?: string;
      }) => {
        if (event.type === "status") {
          setAiContinuationProgress(event.progress ?? 0);
          if (event.status === "buildingContext") {
            setAiContinuationStatus("整理资料中");
          } else if (event.status === "planning") {
            setAiContinuationStatus("规划剧情中");
          } else if (event.status === "generating") {
            setAiContinuationStatus("正文生成中");
          }
          return;
        }

        if (event.type === "token" && event.token) {
          setAiContinuationOutput((current) => current + event.token);
          return;
        }

        if (event.type === "done") {
          setAiContinuationProgress(100);
          setAiContinuationStatus("生成完成");
          setAiContinuationOutput(event.text ?? "");
          setAiContinuationReport(event.report ?? null);
          if (event.text?.trim()) {
            let createdRunId = "";
            if (event.report) {
              const nextProject = createContinuationRun(project, {
                context: continuationContext,
                report: event.report,
                text: event.text,
                writerModel: "当前 Writer 模型",
              });
              createdRunId = nextProject.continuationRuns?.[0]?.id ?? "";
              setAiContinuationRunId(createdRunId);
              updateActiveProject(nextProject);
            }
            void handleCheckAiContinuation(false, event.text, continuationContext, createdRunId);
          }
          return;
        }

        if (event.type === "error") {
          setAiContinuationStatus("生成失败");
          setAiContinuationError(event.error || "AI 续写失败，请稍后重试。");
          if (event.text) {
            setAiContinuationOutput(event.text);
          }
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        pending += decoder.decode(value, { stream: true });
        const lines = pending.split(/\r?\n/);
        pending = lines.pop() ?? "";
        for (const line of lines) {
          if (line.trim()) {
            handleEvent(JSON.parse(line));
          }
        }
      }

      pending += decoder.decode();
      if (pending.trim()) {
        handleEvent(JSON.parse(pending));
      }
    } catch (error) {
      if (controller.signal.aborted) {
        setAiContinuationStatus("已停止");
        return;
      }
      setAiContinuationStatus("生成失败");
      setAiContinuationError(error instanceof Error ? error.message : "AI 续写失败，请稍后重试。");
    } finally {
      if (aiContinuationAbortRef.current === controller) {
        aiContinuationAbortRef.current = null;
      }
      setIsAiContinuationRunning(false);
    }
  }

  function handleStopAiContinuation() {
    aiContinuationAbortRef.current?.abort();
  }

  async function handleCheckAiContinuation(
    force = true,
    text = aiContinuationOutput,
    context = aiContinuationContext,
    runId = aiContinuationRunId,
  ) {
    if (!project || !text.trim() || !context) return;
    setIsAiContinuationChecking(true);
    setAiContinuationCheckError("");
    try {
      const response = await fetch("/api/ai/continuation-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project, text, context, force }),
      });
      const payload = await response.json() as { report?: ContinuationConsistencyReport; error?: string };
      if (!response.ok || !payload.report) {
        throw new Error(payload.error || "一致性检查暂不可用。");
      }
      setAiContinuationConsistencyReport(payload.report);
      if (runId) {
        const riskSummary = payload.report.findings.reduce(
          (summary, finding) => ({ ...summary, [finding.severity]: summary[finding.severity] + 1 }),
          { high: 0, medium: 0, low: 0 },
        );
        updateActiveProject((currentProject) => updateContinuationRunRiskSummary(currentProject, runId, {
          ...riskSummary,
          status: payload.report.status,
        }));
      }
    } catch (error) {
      setAiContinuationCheckError(error instanceof Error ? error.message : "一致性检查暂不可用。");
    } finally {
      setIsAiContinuationChecking(false);
    }
  }

  function handleContinuationFeedback(
    decision: "adopted" | "edited" | "rejected",
    reason?: "constraint" | "plot" | "style" | "information" | "pacing" | "other",
  ) {
    if (!project || !aiContinuationRunId) return;
    updateActiveProject((currentProject) => recordContinuationFeedback(currentProject, aiContinuationRunId, { decision, reason }));
  }

  async function handleCopyAiContinuation() {
    if (!aiContinuationOutput.trim()) {
      window.alert("当前还没有可复制的续写正文。");
      return;
    }

    await navigator.clipboard.writeText(aiContinuationOutput);
    setAiContinuationStatus("正文已复制");
  }

  function handleAppendAiContinuationToLastChapter() {
    if (!aiContinuationOutput.trim()) {
      window.alert("当前还没有可保存的续写正文。");
      return;
    }
    if (!project.manuscript?.chapters.length) {
      window.alert("当前小说还没有章节，请保存为下一章。");
      return;
    }
    if (
      aiContinuationConsistencyReport?.findings.some((item) => item.severity === "high")
      && !window.confirm("检测到高风险设定矛盾，仍保存这段正文吗？")
    ) return;

    updateActiveProject(appendContinuationToLastChapter(project, aiContinuationOutput));
    setAiContinuationStatus("已保存到最后一章末尾");
  }

  function handleSaveAiContinuationAsNextChapter() {
    if (!aiContinuationOutput.trim()) {
      window.alert("当前还没有可保存的续写正文。");
      return;
    }
    if (!aiNextChapterTitle.trim()) {
      window.alert("请先填写下一章标题。");
      return;
    }
    if (
      aiContinuationConsistencyReport?.findings.some((item) => item.severity === "high")
      && !window.confirm("检测到高风险设定矛盾，仍保存这段正文吗？")
    ) return;

    updateActiveProject(saveContinuationAsNextChapter(project, aiNextChapterTitle, aiContinuationOutput));
    setAiContinuationStatus("已保存为下一章");
  }

  function handleOpenAiAnalysisCharacterDialog(
    mode: "matched" | "candidate" | "candidateClue",
  ) {
    setSelectedAiAnalysisCharacterNames([]);
    setAiAnalysisCharacterDialog(mode);
  }

  function handleCloseAiAnalysisCharacterDialog() {
    setSelectedAiAnalysisCharacterNames([]);
    setAiAnalysisCharacterDialog(null);
  }

  function handleToggleAiAnalysisCharacter(name: string) {
    setSelectedAiAnalysisCharacterNames((currentNames) =>
      currentNames.includes(name)
        ? currentNames.filter((item) => item !== name)
        : [...currentNames, name],
    );
  }

  function handleDeleteAiAnalysisForeshadowing(chapterId: string, index: number) {
    setSelectedAiAnalysisForeshadowingKey("");
    setProjects((currentProjects) =>
      currentProjects.map((item) =>
        item.id === project.id
          ? {
              ...item,
              chapterAnalyses: (item.chapterAnalyses ?? []).map((analysis) =>
                analysis.chapterId === chapterId
                  ? deleteAnalysisClue(analysis, index)
                  : analysis,
              ),
            }
          : item,
      ),
    );
  }

  function handleOpenAiAnalysisForeshadowingEdit(
    chapterId: string,
    index: number,
    label: string,
    detail: string,
  ) {
    setAiAnalysisForeshadowingEditDraft({
      chapterId,
      index,
      title: label,
      detail,
    });
  }

  function handleSaveAiAnalysisForeshadowingEdit() {
    if (!aiAnalysisForeshadowingEditDraft) {
      return;
    }
    if (!aiAnalysisForeshadowingEditDraft.title.trim()) {
      window.alert("请填写线索标题。");
      return;
    }

    setProjects((currentProjects) =>
      currentProjects.map((item) =>
        item.id === project.id
          ? {
              ...item,
              chapterAnalyses: (item.chapterAnalyses ?? []).map((analysis) =>
                analysis.chapterId === aiAnalysisForeshadowingEditDraft.chapterId
                  ? updateAnalysisClue(
                      analysis,
                      aiAnalysisForeshadowingEditDraft.index,
                      {
                        title: aiAnalysisForeshadowingEditDraft.title,
                        detail: aiAnalysisForeshadowingEditDraft.detail,
                      },
                    )
                  : analysis,
              ),
            }
          : item,
      ),
    );
    setAiAnalysisForeshadowingEditDraft(null);
  }

  function handleClearChapterAnalyses() {
    const analysisCount = project.chapterAnalyses?.length ?? 0;
    if (!analysisCount) {
      return;
    }
    const confirmed = window.confirm(
      "确认清空当前 AI 解析数据和报告吗？小说正文、章节划分、人物和手动线索不会被删除。",
    );
    if (!confirmed) {
      return;
    }

    chapterAnalysisAbortRef.current?.abort();
    chapterAnalysisAbortRef.current = null;
    setProjects((currentProjects) =>
      currentProjects.map((item) =>
        item.id === project.id
          ? { ...clearChapterAnalyses(item), clueDiagnosis: undefined }
          : item,
      ),
    );
    setChapterAnalysisProgress(0);
    setChapterAnalysisStatus("未解析");
    setChapterAnalysisError("");
    setChapterAnalysisRecoveries([]);
    setChapterAnalysisFailures([]);
    setSelectedAiAnalysisCharacterNames([]);
    setSelectedAiAnalysisForeshadowingKey("");
    setAiAnalysisCharacterDialog(null);
    setAiAnalysisForeshadowingEditDraft(null);
  }

  async function handleRunClueDiagnosis(force = false, sourceProject: Project = project) {
    if (!sourceProject.chapterAnalyses?.length || isClueDiagnosisRunning) {
      return;
    }

    setIsClueDiagnosisRunning(true);
    try {
      const response = await fetch("/api/ai/diagnose-clues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project: sourceProject, force }),
      });
      const payload = (await response.json().catch(() => null)) as {
        diagnosis?: Project["clueDiagnosis"];
        reused?: boolean;
        error?: string;
      } | null;
      if (!response.ok || !payload?.diagnosis) {
        throw new Error(payload?.error || "线索整理暂时不可用。");
      }

      setProjects((currentProjects) =>
        currentProjects.map((item) => {
          if (item.id !== sourceProject.id) return item;
          const diagnosedProject: Project = { ...item, clueDiagnosis: payload.diagnosis };
          return {
            ...diagnosedProject,
            aiSuggestionPool: buildAiSuggestionPool(diagnosedProject),
            aiSuggestionsInitialized: true,
          };
        }),
      );
      setWorkbenchNotice(
        payload.reused
          ? "线索整理结果已是最新。"
          : force
            ? "已按全书证据重新整理线索。"
            : "已按全书证据整理线索，优先项目已放到待确认区。",
      );
    } catch (error) {
      setWorkbenchNotice(
        error instanceof Error ? `${error.message} 已保留原有建议。` : "线索整理失败，已保留原有建议。",
      );
    } finally {
      setIsClueDiagnosisRunning(false);
    }
  }

  async function handleStartChapterAnalysis(mode: ChapterAnalysisMode = "fast") {
    if (!project.manuscript?.chapters.length) {
      window.alert("请先上传小说正文，再启动深度解析。");
      return;
    }
    if (mode === "full" && !selectedManuscriptChapterId) {
      window.alert("请先在章节列表中选择要完整解析的章节。");
      return;
    }

    chapterAnalysisAbortRef.current?.abort();
    const controller = new AbortController();
    chapterAnalysisAbortRef.current = controller;
    setChapterAnalysisError("");
    setChapterAnalysisRecoveries([]);
    setChapterAnalysisFailures([]);
    setIsChapterAnalysisFailureDialogOpen(false);
    setChapterAnalysisProgress(0);
    setChapterAnalysisRunMode(mode);
    setChapterAnalysisRunTotal(0);
    setChapterAnalysisRunCompleted(0);
    setChapterAnalysisRunActive(0);
    setChapterAnalysisRunSkipped(0);
    setChapterAnalysisStatus(mode === "fast" ? "快速整理章节中" : "完整解析当前章节中");
    setIsChapterAnalysisRunning(true);

    try {
      const response = await fetch("/api/ai/analyze-chapters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "full"
            ? { project, force: true, chapterIds: [selectedManuscriptChapterId], mode }
            : { project, force: false, mode },
        ),
        signal: controller.signal,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "章节深度解析请求失败。");
      }

      if (!response.body) {
        throw new Error("章节深度解析没有返回内容。");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";

      const handleEvent = (event: ChapterAnalysisStreamEvent) => {
        if (typeof event.progress === "number") {
          setChapterAnalysisProgress(event.progress);
        }

        if (event.type === "status") {
          setChapterAnalysisRunMode(event.mode ?? mode);
          setChapterAnalysisRunTotal(event.total ?? 0);
          setChapterAnalysisRunSkipped(event.skippedCount ?? 0);
          setChapterAnalysisStatus(
            event.total === 0 && event.skippedCount
              ? "当前解析已是最新"
              : event.mode === "full"
                ? "完整解析当前章节中"
                : "快速整理章节中",
          );
          return;
        }

        if (event.type === "chapterStart") {
          setChapterAnalysisRunActive((current) => current + 1);
          setChapterAnalysisStatus(event.chapterTitle ? `解析：${event.chapterTitle}` : "解析章节中");
          return;
        }

        if (event.type === "chapterDone" && event.analysis) {
          setChapterAnalysisRunCompleted((current) => current + 1);
          setChapterAnalysisRunActive((current) => Math.max(0, current - 1));
          setProjects((currentProjects) =>
            currentProjects.map((item) =>
              item.id === event.analysis!.projectId ? upsertChapterAnalysis(item, event.analysis!) : item,
            ),
          );
          if (event.recovery) {
            setChapterAnalysisRecoveries((currentRecoveries) => [
              ...currentRecoveries,
              event.recovery!,
            ]);
            setChapterAnalysisStatus(
              event.recovery.mode === "repaired"
                ? `已修复解析：${event.recovery.chapterTitle}`
                : `已降级解析：${event.recovery.chapterTitle}`,
            );
          } else {
            setChapterAnalysisStatus(event.chapterTitle ? `已解析：${event.chapterTitle}` : "章节已解析");
          }
          return;
        }

        if (event.type === "chapterError") {
          setChapterAnalysisRunCompleted((current) => current + 1);
          setChapterAnalysisRunActive((current) => Math.max(0, current - 1));
          const failure = {
            chapterId: event.chapterId,
            chapterTitle: event.chapterTitle || "未知章节",
            error: event.error || "未知错误。",
          };
          setChapterAnalysisFailures((currentFailures) => [...currentFailures, failure]);
          setChapterAnalysisStatus(
            event.chapterTitle ? `已跳过：${event.chapterTitle}` : "已跳过失败章节",
          );
          return;
        }

        if (event.type === "done") {
          setChapterAnalysisProgress(100);
          setChapterAnalysisRunActive(0);
          setChapterAnalysisRunCompleted((event.analyzedCount ?? 0) + (event.failedCount ?? 0));
          setChapterAnalysisRunSkipped(event.skippedCount ?? 0);
          const failures = event.failures ?? [];
          const recoveries = event.recoveries ?? [];
          if (recoveries.length || failures.length || event.analyzedCount) {
            setChapterAnalysisRecoveries(recoveries);
            setChapterAnalysisFailures(failures);
            setIsChapterAnalysisFailureDialogOpen(true);
          }
          if (event.analyzedCount || recoveries.length || failures.length) {
            const repairedCount = event.repairedCount ?? recoveries.filter((item) => item.mode === "repaired").length;
            const degradedCount = event.degradedCount ?? recoveries.filter((item) => item.mode === "degraded").length;
            setChapterAnalysisStatus(
              `解析完成：${event.analyzedCount ?? 0} 章，修复 ${repairedCount} 章，降级 ${degradedCount} 章，失败 ${failures.length} 章`,
            );
          } else {
            setChapterAnalysisStatus("当前解析已是最新");
          }
          if ((event.analyzedCount ?? 0) > 0) {
            const analyzedProject = (event.analyses ?? []).reduce(
              (currentProject, analysis) => upsertChapterAnalysis(currentProject, analysis),
              project,
            );
            void handleRunClueDiagnosis(false, analyzedProject);
          }
          return;
        }

        if (event.type === "error") {
          setChapterAnalysisStatus("解析失败");
          setChapterAnalysisError(
            event.error ||
              (event.chapterTitle
                ? `章节深度解析失败：${event.chapterTitle}`
                : "章节深度解析失败，请稍后重试。"),
          );
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        pending += decoder.decode(value, { stream: true });
        const lines = pending.split(/\r?\n/);
        pending = lines.pop() ?? "";
        for (const line of lines) {
          if (line.trim()) {
            handleEvent(JSON.parse(line));
          }
        }
      }

      pending += decoder.decode();
      if (pending.trim()) {
        handleEvent(JSON.parse(pending));
      }
    } catch (error) {
      if (controller.signal.aborted) {
        setChapterAnalysisStatus("已停止");
        return;
      }
      setChapterAnalysisStatus("解析失败");
      setChapterAnalysisError(error instanceof Error ? error.message : "章节深度解析失败，请稍后重试。");
    } finally {
      if (chapterAnalysisAbortRef.current === controller) {
        chapterAnalysisAbortRef.current = null;
      }
      setIsChapterAnalysisRunning(false);
    }
  }

  function handleStopChapterAnalysis() {
    chapterAnalysisAbortRef.current?.abort();
  }

  function handleAddRecord(type: KnowledgeType) {
    setRecordDialog({
      mode: "add",
      type,
      name: "",
      summary: "",
      tagsText: "",
    });
  }

  function handleEditRecord(record: KnowledgeRecord) {
    setRecordDialog({
      mode: "edit",
      record,
      name: record.name,
      summary: record.summary,
      tagsText: record.tags.join(", "),
    });
  }

  function handleSaveRecordDialog() {
    if (!recordDialog) {
      return;
    }

    if (recordDialog.mode === "add") {
      const nextProject = addKnowledgeRecord(project, {
        type: recordDialog.type,
        name: recordDialog.name,
        summary: recordDialog.summary,
        status: recordDialog.type === "foreshadowing" ? "open" : "active",
        tagsText: recordDialog.tagsText,
      });
      const createdRecord = nextProject.records[nextProject.records.length - 1];
      updateActiveProject(nextProject);
      setSelectedRecordId(createdRecord.id);
      setRecordDialog(null);
      return;
    }

    updateActiveProject(
      updateKnowledgeRecord(project, recordDialog.record.id, {
        name: recordDialog.name,
        summary: recordDialog.summary,
        tagsText: recordDialog.tagsText,
      }),
    );
    setSelectedRecordId(recordDialog.record.id);
    setRecordDialog(null);
  }

  function handleDeleteRecord(record: KnowledgeRecord) {
    const confirmed = window.confirm(`确定删除资料「${record.name}」吗？`);
    if (!confirmed) {
      return;
    }

    const nextProject = deleteKnowledgeRecord(project, record.id);
    updateActiveProject(nextProject);
    setSelectedRecordId(nextProject.records[0]?.id ?? "");
  }

  async function handleUploadImage(record: KnowledgeRecord, file: File) {
    const imageUrl = await readFileAsDataUrl(file);
    const nextProject = addRecordImage(project, record.id, {
      id: `image-${record.id}-${Date.now()}`,
      name: file.name,
      url: imageUrl,
    });

    updateActiveProject(nextProject);
    setSelectedRecordId(record.id);
  }

  function handleDeleteImage(recordId: string, imageId: string) {
    const confirmed = window.confirm("删除这张图片吗？");
    if (!confirmed) {
      return;
    }

    updateActiveProject(deleteRecordImage(project, recordId, imageId));
    setSelectedRecordId(recordId);
  }

  async function handleUploadCover(projectId: string, file: File) {
    const coverUrl = await readFileAsDataUrl(file);
    setProjects(
      updateProjectCover(projects, projectId, {
        name: file.name,
        url: coverUrl,
      }),
    );
  }

  function updateActiveCharacters(nextCharacters: NonNullable<Project["characters"]>) {
    setProjects(updateProjectCharacters(projects, project.id, nextCharacters));
  }

  function handleAddCharacter() {
    const nextCharacters = addCharacter(characters);
    updateActiveCharacters(nextCharacters);
    setSelectedCharacterId(nextCharacters[nextCharacters.length - 1].id);
  }

  function handleDeleteCharacter(characterId: string) {
    const targetCharacter = characters.find((character) => character.id === characterId);
    const confirmed = window.confirm(
      `确定删除人物「${targetCharacter?.name || "未命名"}」吗？`,
    );

    if (!confirmed) {
      return;
    }

    const nextCharacters = deleteCharacter(characters, characterId);
    updateActiveCharacters(nextCharacters);

    if (selectedCharacterId === characterId) {
      setSelectedCharacterId(nextCharacters[0]?.id ?? "");
      setIsCharacterGalleryOpen(false);
      setEditingCharacterAttributeId("");
      setCharacterAttributeTitleDraft("");
    }
  }

  function handleUpdateCharacterBase(
    field: "name" | "gender" | "catchphrase",
    value: string,
  ) {
    if (!selectedCharacter) {
      return;
    }

    updateActiveCharacters(
      updateCharacterBase(characters, selectedCharacter.id, {
        [field]: value,
      }),
    );
  }

  function handleClearCharacterCoreField(field: "gender" | "catchphrase") {
    if (!selectedCharacter) {
      return;
    }

    updateActiveCharacters(
      clearCharacterCoreField(characters, selectedCharacter.id, field),
    );
  }

  async function handleUploadCharacterPortrait(file: File) {
    if (!selectedCharacter) {
      return;
    }

    const portraitUrl = await readFileAsDataUrl(file);
    updateActiveCharacters(
      updateCharacterPortrait(characters, selectedCharacter.id, {
        id: `portrait-${selectedCharacter.id}-${Date.now()}`,
        name: file.name,
        url: portraitUrl,
      }),
    );
  }

  async function handleUploadCharacterGalleryImage(file: File) {
    if (!selectedCharacter) {
      return;
    }

    const imageUrl = await readFileAsDataUrl(file);
    updateActiveCharacters(
      addCharacterGalleryImage(characters, selectedCharacter.id, {
        id: `character-gallery-${selectedCharacter.id}-${Date.now()}`,
        name: file.name,
        url: imageUrl,
      }),
    );
  }

  function handleUseCharacterGalleryImage(image: NonNullable<Project["characters"]>[number]["portrait"]) {
    if (!selectedCharacter || !image) {
      return;
    }

    updateActiveCharacters(updateCharacterPortrait(characters, selectedCharacter.id, image));
  }

  function handleAddCharacterAttribute(kind: CharacterAttributeKind) {
    if (!selectedCharacter) {
      return;
    }

    if (kind === "custom") {
      setCustomCharacterAttributeTitleDraft("\u81ea\u5b9a\u4e49\u5c5e\u6027");
      setIsCustomCharacterAttributeDialogOpen(true);
      setDraggedCharacterAttributeKind("");
      return;
    }

    updateActiveCharacters(
      addCharacterAttribute(characters, selectedCharacter.id, kind),
    );
    setDraggedCharacterAttributeKind("");
  }

  function handleCloseCustomCharacterAttributeDialog() {
    setIsCustomCharacterAttributeDialogOpen(false);
    setCustomCharacterAttributeTitleDraft("\u81ea\u5b9a\u4e49\u5c5e\u6027");
    setDraggedCharacterAttributeKind("");
  }

  function handleConfirmCustomCharacterAttribute(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCharacter) {
      handleCloseCustomCharacterAttributeDialog();
      return;
    }

    const normalizedTitle =
      customCharacterAttributeTitleDraft.trim() || "\u81ea\u5b9a\u4e49\u5c5e\u6027";
    updateActiveCharacters(
      addCharacterAttribute(characters, selectedCharacter.id, "custom", normalizedTitle),
    );
    handleCloseCustomCharacterAttributeDialog();
  }

  function handleUpdateCharacterAttribute(
    attributeId: string,
    input: { title?: string; value?: string; locked?: boolean },
  ) {
    if (!selectedCharacter) {
      return;
    }

    updateActiveCharacters(
      updateCharacterAttribute(characters, selectedCharacter.id, attributeId, input),
    );
  }

  function handleStartEditCharacterAttributeTitle(attributeId: string, title: string) {
    setEditingCharacterAttributeId(attributeId);
    setCharacterAttributeTitleDraft(title);
  }

  function handleSaveCharacterAttributeTitle(attributeId: string) {
    const normalizedTitle = characterAttributeTitleDraft.trim();
    if (normalizedTitle) {
      handleUpdateCharacterAttribute(attributeId, { title: normalizedTitle });
    }
    setEditingCharacterAttributeId("");
    setCharacterAttributeTitleDraft("");
  }

  function handleDeleteCharacterAttribute(attributeId: string) {
    if (!selectedCharacter) {
      return;
    }

    updateActiveCharacters(
      deleteCharacterAttribute(characters, selectedCharacter.id, attributeId),
    );
    if (editingCharacterAttributeId === attributeId) {
      setEditingCharacterAttributeId("");
      setCharacterAttributeTitleDraft("");
    }
  }

  function handleMoveCharacterAttribute(sourceToken: string, targetToken: string) {
    if (!selectedCharacter) {
      return;
    }

    updateActiveCharacters(
      moveCharacterAttribute(characters, selectedCharacter.id, sourceToken, targetToken),
    );
    setDraggedCharacterAttributeToken("");
  }

  function updateActiveTimelineEvents(nextTimelineEvents: TimelineEvent[]) {
    setProjects(updateProjectTimelineEvents(projects, project.id, nextTimelineEvents));
  }

  function updateActiveClueBoards(nextClueBoards: ClueBoard[]) {
    setDraftClueBoards(normalizeClueBoards(nextClueBoards));
  }

  function updateActiveRelationshipGraphs(nextRelationshipGraphs: RelationshipGraph[]) {
    setDraftRelationshipGraphs(normalizeRelationshipGraphs(nextRelationshipGraphs));
  }

  function updateActiveForeshadowings(nextForeshadowings: ForeshadowingItem[]) {
    setDraftForeshadowings(normalizeForeshadowings(nextForeshadowings, project.records));
  }

  function resetClueTransientState() {
    setEditingClueNodeId("");
    setClueMentionCharacterId("");
    setClueContextMenu(null);
    setClueRelationDraft(null);
    setEditingClueRelationId("");
    setClueRelationLabelDraft("");
    setEditingClueSummaryId("");
    setClueSummaryTextDraft("");
    setClueMcpStatus("");
    setIsRelationshipGraphManagerMenuOpen(false);
    setIsRelationshipCharacterPickerOpen(false);
    setRelationshipCharacterQuery("");
    setRelationshipLineDraft(null);
    setRelationshipContextMenu(null);
    setEditingRelationshipLineId("");
    setRelationshipLineLabelDraft("");
    setForeshadowingDialog(null);
    setForeshadowingSetupChapterQuery("");
    setForeshadowingPayoffChapterQuery("");
    setForeshadowingCharacterQuery("");
  }

  function handleSaveClueBoards() {
    if (clueSection === "foreshadowing") {
      const normalizedForeshadowings = normalizeForeshadowings(draftForeshadowings, project.records);
      setProjects(updateProjectForeshadowings(projects, project.id, normalizedForeshadowings));
      setDraftForeshadowings(normalizedForeshadowings);
      setSavedForeshadowingsJson(JSON.stringify(normalizedForeshadowings));
      setClueMcpStatus("已保存当前重要伏笔。");
      return;
    }

    if (clueSection === "relationships") {
      const normalizedGraphs = normalizeRelationshipGraphs(draftRelationshipGraphs).map((graph) => ({
        ...graph,
        title: graph.title.trim() || "主线人物关系",
      }));
      setProjects(updateProjectRelationshipGraphs(projects, project.id, normalizedGraphs));
      setDraftRelationshipGraphs(normalizedGraphs);
      setSavedRelationshipGraphsJson(JSON.stringify(normalizedGraphs));
      setClueMcpStatus("已保存当前人物关系图。");
      return;
    }

    const normalizedBoards = normalizeClueBoards(draftClueBoards).map((board) => ({
      ...board,
      title: board.title.trim() || "新线索图",
    }));
    setProjects(updateProjectClueBoards(projects, project.id, normalizedBoards));
    setDraftClueBoards(normalizedBoards);
    setSavedClueBoardsJson(JSON.stringify(normalizedBoards));
    setClueMcpStatus("已保存当前思维导图。");
  }

  function handleLeaveClues() {
    if (isClueDraftDirty && !window.confirm("当前线索导图有未保存修改，确定丢弃并返回吗？")) {
      return;
    }

    const nextClueBoards = normalizeClueBoards(project.clueBoards);
    const nextRelationshipGraphs = normalizeRelationshipGraphs(project.relationshipGraphs);
    const nextForeshadowings = normalizeForeshadowings(project.foreshadowings, project.records);
    setDraftClueBoards(nextClueBoards);
    setDraftRelationshipGraphs(nextRelationshipGraphs);
    setDraftForeshadowings(nextForeshadowings);
    setSavedClueBoardsJson(JSON.stringify(nextClueBoards));
    setSavedRelationshipGraphsJson(JSON.stringify(nextRelationshipGraphs));
    setSavedForeshadowingsJson(JSON.stringify(nextForeshadowings));
    resetClueTransientState();
    setView("workspace");
  }

  function handleOpenClueBoardManagerDialog(mode: ClueBoardManagerDialogState["mode"]) {
    setIsClueBoardManagerMenuOpen(false);

    if (mode === "create") {
      setClueBoardManagerDialog({
        mode,
        titleDraft: createUniqueClueBoardTitle(clueBoards, "新线索图"),
      });
      return;
    }

    const selectedBoardId = selectedClueBoard?.id ?? clueBoards[0]?.id ?? "";
    if (mode === "rename") {
      const selectedBoard = clueBoards.find((board) => board.id === selectedBoardId);
      setClueBoardManagerDialog({
        mode,
        selectedBoardId,
        titleDraft: selectedBoard?.title ?? "",
      });
      return;
    }

    setClueBoardManagerDialog({
      mode,
      selectedBoardId,
    });
  }

  function handleSelectClueBoardInManagerDialog(boardId: string) {
    if (!clueBoardManagerDialog || clueBoardManagerDialog.mode === "create") {
      return;
    }

    if (clueBoardManagerDialog.mode === "rename") {
      const selectedBoard = clueBoards.find((board) => board.id === boardId);
      setClueBoardManagerDialog({
        ...clueBoardManagerDialog,
        selectedBoardId: boardId,
        titleDraft: selectedBoard?.title ?? "",
      });
      return;
    }

    setClueBoardManagerDialog({
      ...clueBoardManagerDialog,
      selectedBoardId: boardId,
    });
  }

  function handleSubmitClueBoardManagerDialog() {
    if (!clueBoardManagerDialog) {
      return;
    }

    if (clueBoardManagerDialog.mode === "create") {
      const nextClueBoards = addClueBoard(
        clueBoards,
        createUniqueClueBoardTitle(clueBoards, clueBoardManagerDialog.titleDraft),
      );
      updateActiveClueBoards(nextClueBoards);
      setSelectedClueBoardId(nextClueBoards[nextClueBoards.length - 1]?.id ?? "");
      resetClueTransientState();
      setClueBoardManagerDialog(null);
      return;
    }

    if (!clueBoardManagerDialog.selectedBoardId) {
      return;
    }

    if (clueBoardManagerDialog.mode === "open") {
      handleOpenClueBoard(clueBoardManagerDialog.selectedBoardId);
      setClueBoardManagerDialog(null);
      return;
    }

    if (clueBoardManagerDialog.mode === "delete") {
      const deletedIndex = clueBoards.findIndex(
        (item) => item.id === clueBoardManagerDialog.selectedBoardId,
      );
      const nextClueBoards = deleteClueBoardWithoutFallback(
        clueBoards,
        clueBoardManagerDialog.selectedBoardId,
      );
      updateActiveClueBoards(nextClueBoards);
      setSelectedClueBoardId(
        nextClueBoards[deletedIndex]?.id ?? nextClueBoards[deletedIndex - 1]?.id ?? "",
      );
      resetClueTransientState();
      setClueBoardManagerDialog(null);
      return;
    }

    if (clueBoardManagerDialog.mode === "rename") {
      const nextClueBoards = renameClueBoard(
        clueBoards,
        clueBoardManagerDialog.selectedBoardId,
        clueBoardManagerDialog.titleDraft,
      );
      updateActiveClueBoards(nextClueBoards);
      setSelectedClueBoardId(clueBoardManagerDialog.selectedBoardId);
      setClueBoardManagerDialog(null);
    }
  }

  function createUniqueRelationshipGraphTitle(baseTitle: string) {
    const normalizedBaseTitle = baseTitle.trim() || "主线人物关系";
    const existingTitles = new Set(relationshipGraphs.map((graph) => graph.title.trim()));

    if (!existingTitles.has(normalizedBaseTitle)) {
      return normalizedBaseTitle;
    }

    let index = 2;
    while (existingTitles.has(`${normalizedBaseTitle} ${index}`)) {
      index += 1;
    }
    return `${normalizedBaseTitle} ${index}`;
  }

  function handleOpenRelationshipGraphManagerDialog(mode: RelationshipGraphManagerDialogState["mode"]) {
    setIsRelationshipGraphManagerMenuOpen(false);

    if (mode === "create") {
      setRelationshipGraphManagerDialog({
        mode,
        titleDraft: createUniqueRelationshipGraphTitle("主线人物关系"),
      });
      return;
    }

    const selectedGraphId = selectedRelationshipGraph?.id ?? relationshipGraphs[0]?.id ?? "";
    const selectedGraph = relationshipGraphs.find((graph) => graph.id === selectedGraphId);
    setRelationshipGraphManagerDialog({
      mode,
      selectedGraphId,
      titleDraft: mode === "rename" ? selectedGraph?.title ?? "" : undefined,
    });
  }

  function handleSelectRelationshipGraphInManagerDialog(graphId: string) {
    if (!relationshipGraphManagerDialog || relationshipGraphManagerDialog.mode === "create") {
      return;
    }

    const selectedGraph = relationshipGraphs.find((graph) => graph.id === graphId);
    setRelationshipGraphManagerDialog({
      ...relationshipGraphManagerDialog,
      selectedGraphId: graphId,
      titleDraft:
        relationshipGraphManagerDialog.mode === "rename"
          ? selectedGraph?.title ?? ""
          : relationshipGraphManagerDialog.titleDraft,
    });
  }

  function handleSubmitRelationshipGraphManagerDialog() {
    if (!relationshipGraphManagerDialog) {
      return;
    }

    if (relationshipGraphManagerDialog.mode === "create") {
      const nextGraphs = addRelationshipGraph(
        relationshipGraphs,
        createUniqueRelationshipGraphTitle(relationshipGraphManagerDialog.titleDraft),
      );
      updateActiveRelationshipGraphs(nextGraphs);
      setSelectedRelationshipGraphId(nextGraphs[nextGraphs.length - 1]?.id ?? "");
      resetClueTransientState();
      setRelationshipGraphManagerDialog(null);
      return;
    }

    if (!relationshipGraphManagerDialog.selectedGraphId) {
      return;
    }

    if (relationshipGraphManagerDialog.mode === "open") {
      setSelectedRelationshipGraphId(relationshipGraphManagerDialog.selectedGraphId);
      resetClueTransientState();
      setRelationshipGraphManagerDialog(null);
      return;
    }

    if (relationshipGraphManagerDialog.mode === "delete") {
      const deletedIndex = relationshipGraphs.findIndex(
        (graph) => graph.id === relationshipGraphManagerDialog.selectedGraphId,
      );
      const nextGraphs = deleteRelationshipGraph(
        relationshipGraphs,
        relationshipGraphManagerDialog.selectedGraphId,
      );
      updateActiveRelationshipGraphs(nextGraphs);
      setSelectedRelationshipGraphId(
        nextGraphs[deletedIndex]?.id ?? nextGraphs[deletedIndex - 1]?.id ?? "",
      );
      resetClueTransientState();
      setRelationshipGraphManagerDialog(null);
      return;
    }

    const nextGraphs = renameRelationshipGraph(
      relationshipGraphs,
      relationshipGraphManagerDialog.selectedGraphId,
      relationshipGraphManagerDialog.titleDraft ?? "",
    );
    updateActiveRelationshipGraphs(nextGraphs);
    setSelectedRelationshipGraphId(relationshipGraphManagerDialog.selectedGraphId);
    setRelationshipGraphManagerDialog(null);
  }

  function handleSelectRelationshipNode(nodeId: string) {
    if (!selectedRelationshipGraph) {
      return;
    }

    updateActiveRelationshipGraphs(
      selectRelationshipNode(relationshipGraphs, selectedRelationshipGraph.id, nodeId),
    );
    setRelationshipContextMenu(null);
    setEditingRelationshipLineId("");
  }

  function handleAddRelationshipCharacter(characterId: string) {
    if (!selectedRelationshipGraph) {
      return;
    }

    const spread = selectedRelationshipGraph.nodes.length;
    const x = 50 + Math.cos(spread * 1.1) * Math.min(24, 10 + spread * 2);
    const y = 50 + Math.sin(spread * 1.1) * Math.min(24, 10 + spread * 2);
    updateActiveRelationshipGraphs(
      addRelationshipCharacterNode(relationshipGraphs, selectedRelationshipGraph.id, characterId, x, y),
    );
    setIsRelationshipCharacterPickerOpen(false);
    setRelationshipCharacterQuery("");
  }

  function handleStartRelationshipLine(direction: RelationshipLineDirection) {
    if (!selectedRelationshipGraph || !selectedRelationshipNode) {
      return;
    }

    setRelationshipLineDraft({
      sourceNodeId: selectedRelationshipNode.id,
      direction,
    });
    setRelationshipContextMenu(null);
  }

  function handleFinishRelationshipLine(targetNodeId: string) {
    if (!selectedRelationshipGraph || !relationshipLineDraft) {
      return;
    }

    updateActiveRelationshipGraphs(
      addRelationshipLine(
        relationshipGraphs,
        selectedRelationshipGraph.id,
        relationshipLineDraft.sourceNodeId,
        targetNodeId,
        relationshipLineDraft.direction,
        relationshipLineDraft.direction === "double" ? "互相关联" : "关系",
      ),
    );
    setRelationshipLineDraft(null);
  }

  function handleRelationshipCanvasDrop(event: React.DragEvent<HTMLDivElement>) {
    if (!selectedRelationshipGraph) {
      return;
    }

    const nodeId = event.dataTransfer.getData("application/x-relationship-node-id");
    if (!nodeId) {
      return;
    }

    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    updateActiveRelationshipGraphs(
      updateRelationshipNodePosition(relationshipGraphs, selectedRelationshipGraph.id, nodeId, x, y),
    );
    setRelationshipContextMenu(null);
  }

  function handleRelationshipNodeContextMenu(event: React.MouseEvent<HTMLElement>, nodeId: string) {
    if (!selectedRelationshipGraph) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const frameRect = event.currentTarget.closest(".relationshipCanvasFrame")?.getBoundingClientRect() ??
      event.currentTarget.getBoundingClientRect();
    const menuWidth = 180;
    const menuHeight = 44;
    setRelationshipContextMenu({
      nodeId,
      menuX: Math.min(Math.max(event.clientX - frameRect.left, 12), frameRect.width - menuWidth - 12),
      menuY: Math.min(Math.max(event.clientY - frameRect.top, 12), frameRect.height - menuHeight - 12),
    });
    handleSelectRelationshipNode(nodeId);
  }

  function handleDeleteRelationshipNode(nodeId: string) {
    if (!selectedRelationshipGraph) {
      return;
    }

    updateActiveRelationshipGraphs(
      deleteRelationshipCharacterNode(relationshipGraphs, selectedRelationshipGraph.id, nodeId),
    );
    setRelationshipContextMenu(null);
    setRelationshipLineDraft(null);
  }

  function handleUpdateRelationshipLineLabel(relationId: string) {
    if (!selectedRelationshipGraph) {
      return;
    }

    updateActiveRelationshipGraphs(
      updateRelationshipLine(relationshipGraphs, selectedRelationshipGraph.id, relationId, {
        label: relationshipLineLabelDraft,
      }),
    );
    setEditingRelationshipLineId("");
    setRelationshipLineLabelDraft("");
  }

  function handleDeleteRelationshipLine(relationId: string) {
    if (!selectedRelationshipGraph) {
      return;
    }

    updateActiveRelationshipGraphs(
      deleteRelationshipLine(relationshipGraphs, selectedRelationshipGraph.id, relationId),
    );
    setEditingRelationshipLineId("");
    setRelationshipLineLabelDraft("");
  }

  function handleAdjustRelationshipZoom(delta: number) {
    if (!selectedRelationshipGraph) {
      return;
    }

    updateActiveRelationshipGraphs(
      updateRelationshipGraphZoom(
        relationshipGraphs,
        selectedRelationshipGraph.id,
        selectedRelationshipGraph.zoom + delta,
      ),
    );
  }

  function handleOpenAddForeshadowingDialog() {
    setForeshadowingDialog({
      mode: "add",
      draft: createForeshadowingDraft(),
    });
    setForeshadowingSetupChapterQuery("");
    setForeshadowingPayoffChapterQuery("");
    setForeshadowingCharacterQuery("");
  }

  function handleOpenEditForeshadowingDialog(item: ForeshadowingItem) {
    setForeshadowingDialog({
      mode: "edit",
      foreshadowingId: item.id,
      draft: foreshadowingToDraft(item),
    });
    setForeshadowingSetupChapterQuery("");
    setForeshadowingPayoffChapterQuery("");
    setForeshadowingCharacterQuery("");
  }

  function updateForeshadowingDialogDraft(input: Partial<ForeshadowingDraft>) {
    setForeshadowingDialog((dialog) =>
      dialog
        ? {
            ...dialog,
            draft: {
              ...dialog.draft,
              ...input,
            },
          }
        : dialog,
    );
  }

  function toggleForeshadowingDraftId(
    field: "setupChapterIds" | "payoffChapterIds" | "characterIds",
    id: string,
  ) {
    if (!foreshadowingDialog) {
      return;
    }

    const values = foreshadowingDialog.draft[field];
    updateForeshadowingDialogDraft({
      [field]: values.includes(id) ? values.filter((value) => value !== id) : [...values, id],
    });
  }

  function handleSubmitForeshadowingDialog() {
    if (!foreshadowingDialog) {
      return;
    }

    const nextForeshadowings =
      foreshadowingDialog.mode === "add"
        ? addForeshadowing(foreshadowings, foreshadowingDialog.draft)
        : updateForeshadowing(
            foreshadowings,
            foreshadowingDialog.foreshadowingId,
            foreshadowingDialog.draft,
          );

    updateActiveForeshadowings(nextForeshadowings);
    setForeshadowingDialog(null);
    setForeshadowingSetupChapterQuery("");
    setForeshadowingPayoffChapterQuery("");
    setForeshadowingCharacterQuery("");
  }

  function handleDeleteForeshadowingItem(itemId: string) {
    updateActiveForeshadowings(deleteForeshadowing(foreshadowings, itemId));
    if (foreshadowingDialog?.mode === "edit" && foreshadowingDialog.foreshadowingId === itemId) {
      setForeshadowingDialog(null);
    }
  }

  function handleOpenClueBoard(boardId: string) {
    if (!boardId || boardId === selectedClueBoardId) {
      return;
    }

    setSelectedClueBoardId(boardId);
    resetClueTransientState();
  }

  function handleSelectClueNode(nodeId: string) {
    if (!selectedClueBoard) {
      return;
    }

    updateActiveClueBoards(selectClueNode(clueBoards, selectedClueBoard.id, nodeId));
    setClueMentionCharacterId("");
    setClueContextMenu(null);
    setEditingClueRelationId("");
    setEditingClueSummaryId("");
  }

  function handleAddClueNode(mode: "child" | "sibling" | "free") {
    if (!selectedClueBoard) {
      return;
    }

    const nextClueBoards = addClueNode(
      clueBoards,
      selectedClueBoard.id,
      selectedClueNode?.id,
      mode,
    );
    updateActiveClueBoards(nextClueBoards);
    const nextBoard = nextClueBoards.find((board) => board.id === selectedClueBoard.id);
    setEditingClueNodeId(nextBoard?.selectedNodeId ?? "");
    setClueMentionCharacterId("");
    setClueContextMenu(null);
    setClueRelationDraft(null);
    setEditingClueRelationId("");
    setEditingClueSummaryId("");
  }

  function handleCreateClueNodeAt(x: number, y: number) {
    if (!selectedClueBoard) {
      return;
    }

    const nextClueBoards = addClueNodeAt(clueBoards, selectedClueBoard.id, x, y);
    updateActiveClueBoards(nextClueBoards);
    const nextBoard = nextClueBoards.find((board) => board.id === selectedClueBoard.id);
    setEditingClueNodeId(nextBoard?.selectedNodeId ?? "");
    setClueMentionCharacterId("");
    setClueContextMenu(null);
    setClueRelationDraft(null);
    setEditingClueRelationId("");
    setEditingClueSummaryId("");
  }

  function handleUpdateClueNode(
    nodeId: string,
    input: Partial<Pick<ClueNode, "title" | "detail" | "x" | "y" | "collapsed" | "tags">>,
  ) {
    if (!selectedClueBoard) {
      return;
    }

    updateActiveClueBoards(
      updateClueNode(clueBoards, selectedClueBoard.id, nodeId, input, characters),
    );
  }

  function handleToggleClueNodeCollapsed(nodeId: string) {
    if (!selectedClueBoard) {
      return;
    }

    updateActiveClueBoards(toggleClueNodeCollapsed(clueBoards, selectedClueBoard.id, nodeId));
    setClueContextMenu(null);
  }

  async function handlePrepareXmindMcpSnapshot() {
    if (!selectedClueBoard) {
      return;
    }

    const snapshot = getClueMcpSnapshot(selectedClueBoard);
    const payload = JSON.stringify(snapshot, null, 2);

    try {
      await navigator.clipboard.writeText(payload);
      setClueMcpStatus("已复制 XMind MCP 结构，可交给 Agent 生成或同步导图。");
    } catch {
      console.info("XMind MCP payload", snapshot);
      setClueMcpStatus("浏览器未允许复制，结构已输出到控制台。");
    }
  }

  function handleDeleteSelectedClueNode() {
    if (!selectedClueBoard || !selectedClueNode) {
      return;
    }

    if (selectedClueBoard.nodes.length <= 1) {
      window.alert("至少需要保留一个中心线索。");
      return;
    }

    const confirmed = window.confirm(`删除线索「${selectedClueNode.title}」及其子线索吗？`);
    if (!confirmed) {
      return;
    }

    updateActiveClueBoards(deleteClueNode(clueBoards, selectedClueBoard.id, selectedClueNode.id));
    setEditingClueNodeId("");
    setClueMentionCharacterId("");
    setClueContextMenu(null);
    setClueRelationDraft(null);
    setEditingClueRelationId("");
    setEditingClueSummaryId("");
  }

  function handleDeleteClueNodeOnly(nodeId: string) {
    if (!selectedClueBoard) {
      return;
    }

    const node = selectedClueBoard.nodes.find((item) => item.id === nodeId);
    if (!node) {
      return;
    }

    if (selectedClueBoard.nodes.length <= 1) {
      window.alert("至少需要保留一个中心线索。");
      return;
    }

    const confirmed = window.confirm(`删除线索「${node.title}」吗？其子节点会保留。`);
    if (!confirmed) {
      return;
    }

    updateActiveClueBoards(deleteClueNodeOnly(clueBoards, selectedClueBoard.id, nodeId));
    resetClueTransientState();
  }

  function handleDeleteClueNodeSubtree(nodeId: string) {
    if (!selectedClueBoard) {
      return;
    }

    const node = selectedClueBoard.nodes.find((item) => item.id === nodeId);
    if (!node) {
      return;
    }

    if (selectedClueBoard.nodes.length <= 1) {
      window.alert("至少需要保留一个中心线索。");
      return;
    }

    const confirmed = window.confirm(`删除线索「${node.title}」及其全部子节点吗？`);
    if (!confirmed) {
      return;
    }

    updateActiveClueBoards(deleteClueNode(clueBoards, selectedClueBoard.id, nodeId));
    resetClueTransientState();
  }

  function handleAddClueSummary() {
    if (!selectedClueBoard || !selectedClueNode) {
      return;
    }

    const nextClueBoards = addClueSummary(clueBoards, selectedClueBoard.id, selectedClueNode.id);
    updateActiveClueBoards(nextClueBoards);
    const nextBoard = nextClueBoards.find((board) => board.id === selectedClueBoard.id);
    const summary = nextBoard?.summaries?.find((item) => item.rootNodeId === selectedClueNode.id);
    setEditingClueSummaryId(summary?.id ?? "");
    setClueSummaryTextDraft(summary?.text ?? "概要");
    setClueContextMenu(null);
  }

  function handleUpdateClueSummaryText(summaryId: string) {
    if (!selectedClueBoard) {
      return;
    }

    updateActiveClueBoards(
      updateClueSummary(clueBoards, selectedClueBoard.id, summaryId, clueSummaryTextDraft),
    );
    setEditingClueSummaryId("");
    setClueSummaryTextDraft("");
  }

  function handleDeleteClueSummary(summaryId: string) {
    if (!selectedClueBoard) {
      return;
    }

    updateActiveClueBoards(deleteClueSummary(clueBoards, selectedClueBoard.id, summaryId));
    setEditingClueSummaryId("");
    setClueSummaryTextDraft("");
  }

  function handleAdjustClueZoom(delta: number) {
    if (!selectedClueBoard) {
      return;
    }

    updateActiveClueBoards(
      updateClueBoardZoom(clueBoards, selectedClueBoard.id, selectedClueBoard.zoom + delta),
    );
  }

  function handleClueCanvasDrop(event: React.DragEvent<HTMLDivElement>) {
    if (!selectedClueBoard) {
      return;
    }

    const linkNodeId = event.dataTransfer.getData("application/x-clue-link-node-id");
    if (linkNodeId) {
      event.preventDefault();
      updateActiveClueBoards(reparentClueNode(clueBoards, selectedClueBoard.id, linkNodeId, undefined));
      setClueLinkDragNodeId("");
      setClueRelationDraft(null);
      setClueContextMenu(null);
      return;
    }

    const relationNodeId = event.dataTransfer.getData("application/x-clue-relation-node-id");
    if (relationNodeId) {
      event.preventDefault();
      setClueLinkDragNodeId("");
      setClueRelationDraft(null);
      setClueContextMenu(null);
      return;
    }

    const nodeId = event.dataTransfer.getData("application/x-clue-node-id");
    if (!nodeId) {
      return;
    }

    event.preventDefault();
    const mapElement = clueCanvasRef.current?.querySelector<HTMLElement>(".clueMindMap");
    const rect = mapElement?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    handleUpdateClueNode(nodeId, { x, y });
    setClueContextMenu(null);
  }

  function handleClueCanvasContextMenu(event: React.MouseEvent<HTMLDivElement>) {
    if (!selectedClueBoard) {
      return;
    }

    event.preventDefault();
    const frameRect = event.currentTarget.getBoundingClientRect();
    const mapElement = clueCanvasRef.current?.querySelector<HTMLElement>(".clueMindMap");
    const mapRect = mapElement?.getBoundingClientRect() ?? frameRect;
    const menuWidth = 170;
    const menuHeight = 54;
    const menuX = Math.min(Math.max(event.clientX - frameRect.left, 12), frameRect.width - menuWidth - 12);
    const menuY = Math.min(Math.max(event.clientY - frameRect.top, 12), frameRect.height - menuHeight - 12);

    setClueContextMenu({
      kind: "canvas",
      menuX,
      menuY,
      mapX: ((event.clientX - mapRect.left) / mapRect.width) * 100,
      mapY: ((event.clientY - mapRect.top) / mapRect.height) * 100,
    });
  }

  function handleClueNodeContextMenu(event: React.MouseEvent<HTMLElement>, nodeId: string) {
    if (!selectedClueBoard) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const frameRect =
      clueCanvasRef.current?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
    const menuWidth = 255;
    const menuHeight = 220;
    const menuX = Math.min(Math.max(event.clientX - frameRect.left, 12), frameRect.width - menuWidth - 12);
    const menuY = Math.min(Math.max(event.clientY - frameRect.top, 12), frameRect.height - menuHeight - 12);

    updateActiveClueBoards(selectClueNode(clueBoards, selectedClueBoard.id, nodeId));
    setClueMentionCharacterId("");
    setEditingClueRelationId("");
    setClueContextMenu({
      kind: "node",
      menuX,
      menuY,
      nodeId,
    });
  }

  function handleStartClueRelation(sourceNodeId: string, kind: ClueRelationLineKind) {
    setClueRelationDraft({ sourceNodeId, kind });
    setClueLinkDragNodeId(sourceNodeId);
    setClueContextMenu(null);
  }

  function handleUpdateClueRelationLabel(relationId: string) {
    if (!selectedClueBoard) {
      return;
    }

    updateActiveClueBoards(
      updateClueRelationLabel(
        clueBoards,
        selectedClueBoard.id,
        relationId,
        clueRelationLabelDraft,
      ),
    );
    setEditingClueRelationId("");
    setClueRelationLabelDraft("");
  }

  function handleDeleteClueRelation(relationId: string) {
    if (!selectedClueBoard) {
      return;
    }

    updateActiveClueBoards(deleteClueRelation(clueBoards, selectedClueBoard.id, relationId));
    setEditingClueRelationId("");
    setClueRelationLabelDraft("");
  }

  function handleClueNodeDrop(event: React.DragEvent<HTMLElement>, targetNodeId: string) {
    if (!selectedClueBoard) {
      return;
    }

    const relationSourceNodeId = event.dataTransfer.getData("application/x-clue-relation-node-id");
    const relationKind = event.dataTransfer.getData(
      "application/x-clue-relation-kind",
    ) as ClueRelationLineKind;
    if (relationSourceNodeId && (relationKind === "single" || relationKind === "double")) {
      event.preventDefault();
      event.stopPropagation();
      updateActiveClueBoards(
        addClueRelation(
          clueBoards,
          selectedClueBoard.id,
          relationSourceNodeId,
          targetNodeId,
          relationKind,
        ),
      );
      setClueLinkDragNodeId("");
      setClueRelationDraft(null);
      setClueContextMenu(null);
      return;
    }

    const sourceNodeId = event.dataTransfer.getData("application/x-clue-link-node-id");
    if (!sourceNodeId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    updateActiveClueBoards(
      reparentClueNode(clueBoards, selectedClueBoard.id, sourceNodeId, targetNodeId),
    );
    setClueLinkDragNodeId("");
    setClueRelationDraft(null);
    setClueContextMenu(null);
  }

  function handleClueNodeDragOver(event: React.DragEvent<HTMLElement>) {
    if (
      Array.from(event.dataTransfer.types).includes("application/x-clue-link-node-id") ||
      Array.from(event.dataTransfer.types).includes("application/x-clue-relation-node-id")
    ) {
      event.preventDefault();
    }
  }

  function handleInsertCharacterMention(characterName: string) {
    if (!selectedClueNode) {
      return;
    }

    const nextTitle = selectedClueNode.title.match(/@[\p{L}\p{N}_-]*$/u)
      ? selectedClueNode.title.replace(/@[\p{L}\p{N}_-]*$/u, `@${characterName}`)
      : `${selectedClueNode.title} @${characterName}`;

    handleUpdateClueNode(selectedClueNode.id, { title: nextTitle.trim() });
    setEditingClueNodeId("");
  }

  function handleCreateMapFromBase(base: (typeof BUILT_IN_MAP_BASES)[number]) {
    const nextProject = createStoryMap(project, { base });
    updateActiveProject(nextProject);
    setSelectedMapId(nextProject.maps?.[nextProject.maps.length - 1]?.id ?? "");
    setIsMapBasePickerOpen(false);
  }

  async function handleUploadCustomMapBase(file: File) {
    const imageUrl = await readFileAsDataUrl(file);
    const nextProject = createStoryMap(project, {
      base: {
        title: file.name.replace(/\.[^.]+$/, "") || "自定义地图",
        category: "custom",
        imageUrl,
      },
    });
    updateActiveProject(nextProject);
    setSelectedMapId(nextProject.maps?.[nextProject.maps.length - 1]?.id ?? "");
    setIsMapBasePickerOpen(false);
  }

  function handleDeleteSelectedMap() {
    if (!selectedMap) {
      return;
    }

    const confirmed = window.confirm(`确认删除地图「${selectedMap.title}」吗？`);
    if (!confirmed) {
      return;
    }

    const nextProject = deleteStoryMap(project, selectedMap.id);
    updateActiveProject(nextProject);
    setSelectedMapId(nextProject.maps?.[0]?.id ?? "");
  }

  function handleUpdateSelectedMapTitle(title: string) {
    if (!selectedMap) {
      return;
    }

    updateActiveProject(updateStoryMapTitle(project, selectedMap.id, title));
  }

  function handleAdjustMapZoom(delta: number) {
    if (!selectedMap) {
      return;
    }

    const nextProject = updateStoryMapZoom(project, selectedMap.id, selectedMap.zoom + delta);
    updateActiveProject(nextProject);
  }

  function handleAddMapMarker() {
    if (!selectedMap) {
      return;
    }

    const markerName = window.prompt("标记名称", "新地点");
    if (markerName === null) {
      return;
    }

    updateActiveProject(
      addStoryMapMarker(project, selectedMap.id, {
        title: markerName,
        x: 50,
        y: 50,
      }),
    );
  }

  function handleAddMapMarkerAt(x: number, y: number) {
    if (!selectedMap) {
      return;
    }

    const markerName = window.prompt("标记名称", "新地点");
    if (markerName === null) {
      return;
    }

    updateActiveProject(
      addStoryMapMarker(project, selectedMap.id, {
        title: markerName,
        x,
        y,
      }),
    );
    setMapContextMenu(null);
  }

  function handleAddMapText() {
    if (!selectedMap || !mapContextMenu) {
      return;
    }

    updateActiveProject(
      addStoryMapText(project, selectedMap.id, {
        ...mapTextDraft,
        x: mapContextMenu.mapX,
        y: mapContextMenu.mapY,
      }),
    );
    setMapContextMenu(null);
  }

  function handleOpenMapTextEdit(text: MapTextOverlay) {
    setMapContextMenu(null);
    setMapTextEdit({
      textId: text.id,
      draft: {
        text: text.text,
        color: text.color,
        font: text.font,
        fontSize: text.fontSize,
      },
    });
  }

  function handleSaveMapTextEdit() {
    if (!selectedMap || !mapTextEdit) {
      return;
    }

    updateActiveProject(
      updateStoryMapText(project, selectedMap.id, mapTextEdit.textId, mapTextEdit.draft),
    );
    setMapTextEdit(null);
  }

  async function handleInsertMapImage(file: File) {
    if (!selectedMap || !mapContextMenu) {
      return;
    }

    const imageUrl = await readFileAsDataUrl(file);
    updateActiveProject(
      addStoryMapImage(project, selectedMap.id, {
        name: file.name,
        url: imageUrl,
        x: mapContextMenu.mapX,
        y: mapContextMenu.mapY,
        width: 180,
        height: 120,
      }),
    );
    setMapContextMenu(null);
  }

  function handleMapCanvasContextMenu(event: React.MouseEvent<HTMLDivElement>) {
    const canvas = mapCanvasRef.current;
    const frame = mapCanvasFrameRef.current;
    if (!selectedMap || !canvas || !frame) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const point = getMapPointFromPointer(canvas, event.clientX, event.clientY);
    const frameRect = frame.getBoundingClientRect();
    const placement = calculateMapContextMenuPlacement({
      clientX: event.clientX,
      clientY: event.clientY,
      frameLeft: frameRect.left,
      frameTop: frameRect.top,
      frameWidth: frameRect.width,
      frameHeight: frameRect.height,
    });

    setMapContextMenu({
      menuX: placement.x,
      menuY: placement.y,
      mapX: point.x,
      mapY: point.y,
    });
  }

  function handleStartMapImageGesture(
    event: React.PointerEvent<HTMLElement>,
    image: MapImageOverlay,
    mode: MapImageGesture["mode"],
  ) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setMapContextMenu(null);
    setMapImageGesture({
      imageId: image.id,
      mode,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: image.x,
      startY: image.y,
      startWidth: image.width,
      startHeight: image.height,
    });
  }

  function handleMapCanvasPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!selectedMap || !mapImageGesture) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const zoomRatio = selectedMap.zoom / 100;
    const deltaX = event.clientX - mapImageGesture.startClientX;
    const deltaY = event.clientY - mapImageGesture.startClientY;

    if (mapImageGesture.mode === "move") {
      updateActiveProject(
        updateStoryMapImage(project, selectedMap.id, mapImageGesture.imageId, {
          x: mapImageGesture.startX + (rect.width ? (deltaX / rect.width) * 100 : 0),
          y: mapImageGesture.startY + (rect.height ? (deltaY / rect.height) * 100 : 0),
        }),
      );
      return;
    }

    updateActiveProject(
      updateStoryMapImage(project, selectedMap.id, mapImageGesture.imageId, {
        width: mapImageGesture.startWidth + deltaX / zoomRatio,
        height: mapImageGesture.startHeight + deltaY / zoomRatio,
      }),
    );
  }

  function handleMapCanvasPointerUp() {
    setMapImageGesture(null);
  }

  function handleAddTimelineEvent(lane: TimelineEventLane) {
    const nextTimelineEvents = addTimelineEvent(timelineEvents, lane);
    const newTimelineEventId = nextTimelineEvents[nextTimelineEvents.length - 1].id;
    updateActiveTimelineEvents(nextTimelineEvents);
    setSelectedTimelineEventId(newTimelineEventId);
    setTimelineDetailEventId(newTimelineEventId);
  }

  function handleUpdateTimelineEvent(
    eventId: string,
    input: Parameters<typeof updateTimelineEvent>[2],
  ) {
    updateActiveTimelineEvents(updateTimelineEvent(timelineEvents, eventId, input));
  }

  function handleCloseTimelineDetail() {
    setSelectedTimelineEventId("");
    setTimelineDetailEventId("");
    setTimelineDraftEvent(null);
    setTimelineRelationPicker(null);
  }

  function handleTimelineDetailCloseEvent(
    event: React.MouseEvent<HTMLElement> | React.PointerEvent<HTMLElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();
    handleCloseTimelineDetail();
  }

  async function handleUploadTimelineEventImage(file: File) {
    if (!timelineDraftEvent) {
      return;
    }

    const imageUrl = await readFileAsDataUrl(file);
    const image: KnowledgeImage = {
      id: `timeline-event-image-${timelineDraftEvent.id}-${Date.now()}`,
      name: file.name,
      url: imageUrl,
    };

    setTimelineDraftEvent((currentEvent) =>
      currentEvent
        ? {
            ...currentEvent,
            image,
          }
        : currentEvent,
    );
  }

  function handleDeleteTimelineEvent(eventId: string) {
    const confirmed = window.confirm("确定删除这个时间线事件吗？");
    if (!confirmed) {
      return;
    }

    const nextTimelineEvents = deleteTimelineEvent(timelineEvents, eventId);
    updateActiveTimelineEvents(nextTimelineEvents);
    if (selectedTimelineEventId === eventId) {
      setSelectedTimelineEventId(nextTimelineEvents[0]?.id ?? "");
    }
    if (timelineDetailEventId === eventId) {
      setTimelineDetailEventId("");
      setTimelineDraftEvent(null);
    }
  }

  function handleMoveTimelineEventToIndex(sourceEventId: string, targetIndex: number) {
    updateActiveTimelineEvents(moveTimelineEventToIndex(timelineEvents, sourceEventId, targetIndex));
    setDraggedTimelineEventId("");
  }

  function getTimelineRelationIds(event: TimelineEvent, kind: TimelineRelationKind) {
    return kind === "chapters" ? event.relatedChapterIds : event.relatedCharacterIds;
  }

  function getTimelineRelationOptions(
    kind: TimelineRelationKind,
    sortMode: TimelineRelationSortMode,
  ): TimelineRelationOption[] {
    const options =
      kind === "chapters"
        ? (project.manuscript?.chapters ?? []).map((chapter, chapterIndex) => ({
            id: chapter.id,
            title: chapter.title,
            meta: chapter.displayLabel ?? `第${chapterIndex + 1}章`,
            order: chapterIndex,
          }))
        : characters.map((character, characterIndex) => ({
            id: character.id,
            title: character.name,
            meta: character.gender || "性别未设置",
            order: characterIndex,
          }));

    if (sortMode === "name") {
      return [...options].sort((first, second) =>
        first.title.localeCompare(second.title, "zh-CN"),
      );
    }

    return [...options].sort((first, second) => first.order - second.order);
  }

  function getTimelineRelationSummary(kind: TimelineRelationKind, ids: string[]) {
    if (!ids.length) {
      return "暂不关联";
    }

    const options = getTimelineRelationOptions(kind, "time");
    const optionMap = new Map(options.map((option) => [option.id, option]));
    const labels = ids
      .map((id) => optionMap.get(id))
      .filter((option): option is TimelineRelationOption => Boolean(option))
      .map((option) =>
        kind === "chapters" ? `${option.meta} ${option.title}` : option.title,
      );

    if (!labels.length) {
      return "暂不关联";
    }

    return labels.length > 2
      ? `${labels.slice(0, 2).join("、")} 等 ${labels.length} 项`
      : labels.join("、");
  }

  function handleOpenTimelineRelationPicker(kind: TimelineRelationKind) {
    if (!timelineDraftEvent) {
      return;
    }

    setTimelineRelationPicker({
      kind,
      selectedIds: getTimelineRelationIds(timelineDraftEvent, kind),
      sortMode: "time",
    });
  }

  function handleToggleTimelineRelationOption(optionId: string) {
    setTimelineRelationPicker((currentPicker) => {
      if (!currentPicker) {
        return currentPicker;
      }

      const hasOption = currentPicker.selectedIds.includes(optionId);
      return {
        ...currentPicker,
        selectedIds: hasOption
          ? currentPicker.selectedIds.filter((selectedId) => selectedId !== optionId)
          : [...currentPicker.selectedIds, optionId],
      };
    });
  }

  function handleSaveTimelineRelationPicker() {
    if (!timelineDraftEvent || !timelineRelationPicker) {
      return;
    }

    setTimelineDraftEvent(
      updateTimelineEventRelationIds(
        timelineDraftEvent,
        timelineRelationPicker.kind,
        timelineRelationPicker.selectedIds,
      ),
    );
    setTimelineRelationPicker(null);
  }

  function getTimelineDropIndex(container: HTMLDivElement, pointerY: number) {
    const nodes = Array.from(container.querySelectorAll<HTMLButtonElement>(".timelineEventNode"));
    const nextNodeIndex = nodes.findIndex((node) => {
      const nodeRect = node.getBoundingClientRect();
      return pointerY < nodeRect.top + nodeRect.height / 2;
    });

    return nextNodeIndex === -1 ? nodes.length : nextNodeIndex;
  }

  function handleAdjustTimelineZoom(lane: TimelineEventLane, delta: number) {
    setTimelineZoom((currentZoom) => ({
      ...currentZoom,
      [lane]: clampTimelineZoom(currentZoom[lane] + delta),
    }));
  }

  function handleFitTimelineZoom(lane: TimelineEventLane, eventCount: number) {
    const fittedZoom = eventCount > 10 ? 50 : eventCount > 6 ? 70 : 100;
    setTimelineZoom((currentZoom) => ({
      ...currentZoom,
      [lane]: clampTimelineZoom(fittedZoom),
    }));
  }

  async function handleWholeManuscriptUpload(file: File) {
    const fileType = getManuscriptFileType(file);
    if (!fileType) {
      window.alert("请上传 DOC、DOCX 或 TXT 文件。");
      return;
    }

    const text = fileType === "txt" ? await readFileAsText(file) : "";
    const storedFileUrl = fileType === "txt" ? undefined : await readFileAsDataUrl(file);
    setProjects(
      updateProjectManuscript(
        projects,
        project.id,
        createWholeManuscript({
          fileName: file.name,
          fileType,
          text,
          storedFileUrl,
        }),
      ),
    );
    setIsManuscriptUploadOpen(false);
    setManuscriptUploadMode(null);
  }

  async function handleChapterFileImport(file: File) {
    const fileType = getManuscriptFileType(file);
    if (!fileType) {
      window.alert("请上传 DOC、DOCX 或 TXT 文件。");
      return;
    }

    setChapterTitleDraft((current) => current || file.name.replace(/\.(docx?|txt)$/i, ""));
    if (fileType === "txt") {
      setChapterContentDraft(await readFileAsText(file));
      return;
    }

    setChapterContentDraft("DOC/DOCX 文件已选择，文本解析待后续接入文档解析或 AI Agent。");
  }

  function handleOpenCurrentChapterGoal() {
    const goal = project.currentChapterGoal;
    setCurrentChapterGoalDraft({
      plot: goal?.plot ?? "",
      characterChange: goal?.characterChange ?? "",
      conflict: goal?.conflict ?? "",
      foreshadowing: goal?.foreshadowing ?? "",
      endingHook: goal?.endingHook ?? "",
      lockedRules: goal?.lockedRules ?? "",
    });
    setTodayWritingDialog("goal");
  }

  function handleSaveCurrentChapterGoal() {
    const chapterNumber = (project.manuscript?.chapters.length ?? 0) + 1;
    const goal: CurrentChapterGoal = {
      chapterNumber,
      ...currentChapterGoalDraft,
      updatedAt: new Date().toISOString(),
    };

    setProjects(updateProjectCurrentChapterGoal(projects, project.id, goal));
    setTodayWritingDialog(null);
  }

  function handleStartOwnNextChapter() {
    const chapters = project.manuscript?.chapters ?? [];
    const lastChapter = chapters[chapters.length - 1];
    const hasUntitledDraft =
      Boolean(lastChapter) &&
      !lastChapter.content.trim() &&
      new RegExp(`^第${chapters.length}章(?:\\s+未命名)?$`).test(lastChapter.title.trim());
    const nextManuscript = hasUntitledDraft
      ? project.manuscript
      : addManuscriptChapter(project.manuscript, {
          title: `第${chapters.length + 1}章 未命名`,
          content: "",
        });
    const chapter = hasUntitledDraft
      ? lastChapter
      : nextManuscript?.chapters[nextManuscript.chapters.length - 1];

    if (!nextManuscript || !chapter) {
      return;
    }

    if (!hasUntitledDraft) {
      setProjects(updateProjectManuscript(projects, project.id, nextManuscript));
    }
    setSelectedManuscriptChapterId(chapter.id);
    setOutlineMode("chapters");
    setTodayWritingDialog(null);
    setView("outline");
    manuscriptEditorScrollRatioRef.current = 0;
    setEditingManuscriptChapterId(chapter.id);
    setManuscriptContentEditDraft(chapter.content);
    setIsManuscriptDiscardDialogOpen(false);
  }

  function handleStartAiWriting() {
    const hasChapterContent = project.manuscript?.chapters.some((chapter) =>
      Boolean(chapter.content.trim()),
    );
    const hasChapterGoal = Boolean(project.currentChapterGoal?.plot.trim());

    setAiFeatureMode("continuation");
    setAiContinuationHomeHint(
      hasChapterContent || hasChapterGoal
        ? ""
        : "需要先有章节正文或本章目标，AI 才能更稳定地续写。",
    );
    setTodayWritingDialog(null);
    setView("aiContinuation");
  }

  function handleManageExistingWriting() {
    setOutlineMode("chapters");
    setView("outline");
  }

  function getWritingReferencePreparation(): WritingReferencePreparation {
    const savedPreparation = project.writingReferencePreparation;
    const defaultSelectedIds = [
      ...(project.manuscript?.chapters.map((chapter) => chapter.id) ?? []),
      ...project.records.map((record) => record.id),
      ...foreshadowings.map((item) => item.id),
    ];

    return {
      selectedIds: savedPreparation?.selectedIds ?? defaultSelectedIds,
      lockedIds: savedPreparation?.lockedIds ?? [],
      nextChapterCharacterIds: savedPreparation?.nextChapterCharacterIds ?? [],
      temporaryRequest: {
        mustHappen: savedPreparation?.temporaryRequest?.mustHappen ?? "",
        mustAvoid: savedPreparation?.temporaryRequest?.mustAvoid ?? "",
        atmosphere: savedPreparation?.temporaryRequest?.atmosphere ?? "",
        other: savedPreparation?.temporaryRequest?.other ?? "",
      },
    };
  }

  function saveWritingReferencePreparation(preparation: WritingReferencePreparation) {
    setProjects(updateProjectWritingReferencePreparation(projects, project.id, preparation));
  }

  function handleOpenWritingReference(section: Exclude<WritingReferenceDialogSection, null>) {
    setWritingReferenceRequestDraft(getWritingReferencePreparation().temporaryRequest);
    setWritingReferenceCharacterQuery("");
    setIsWritingReferenceCharacterPickerOpen(section === "knowledge");
    setWritingReferenceDialogSection(section);
  }

  function handleToggleNextChapterCharacter(characterId: string) {
    const preparation = getWritingReferencePreparation();
    const selectedCharacterIds = preparation.nextChapterCharacterIds ?? [];
    saveWritingReferencePreparation({
      ...preparation,
      nextChapterCharacterIds: selectedCharacterIds.includes(characterId)
        ? selectedCharacterIds.filter((id) => id !== characterId)
        : [...selectedCharacterIds, characterId],
    });
  }

  function handleToggleWritingReference(referenceId: string) {
    const preparation = getWritingReferencePreparation();
    const isSelected = preparation.selectedIds.includes(referenceId);
    const selectedIds = isSelected
      ? preparation.selectedIds.filter((id) => id !== referenceId)
      : [...preparation.selectedIds, referenceId];
    saveWritingReferencePreparation({
      ...preparation,
      selectedIds,
      lockedIds: preparation.lockedIds.filter((id) => id !== referenceId || !isSelected),
    });
  }

  function handleToggleWritingReferenceLocked(referenceId: string) {
    const preparation = getWritingReferencePreparation();
    const isLocked = preparation.lockedIds.includes(referenceId);
    saveWritingReferencePreparation({
      ...preparation,
      selectedIds: preparation.selectedIds.includes(referenceId)
        ? preparation.selectedIds
        : [...preparation.selectedIds, referenceId],
      lockedIds: isLocked
        ? preparation.lockedIds.filter((id) => id !== referenceId)
        : [...preparation.lockedIds, referenceId],
    });
  }

  function handleSaveWritingReferenceRequest() {
    saveWritingReferencePreparation({
      ...getWritingReferencePreparation(),
      temporaryRequest: writingReferenceRequestDraft,
    });
    setWritingReferenceDialogSection(null);
  }

  function handleOpenAiAnalysisFromWritingReference() {
    const hasChapterContent = project.manuscript?.chapters.some((chapter) =>
      Boolean(chapter.content.trim()),
    );
    setAiAnalysisHomeHint(
      hasChapterContent ? "" : "需要先导入或创建章节正文，才能进行深度解析。",
    );
    setAiFeatureMode("analysis");
    setWritingReferenceDialogSection(null);
    setView("aiContinuation");
  }

  function handleSaveChapterUpload() {
    if (!chapterContentDraft.trim()) {
      window.alert("请先填写或导入章节正文。");
      return;
    }

    const nextManuscript = addManuscriptChapter(project.manuscript, {
      title: chapterTitleDraft,
      content: chapterContentDraft,
    });
    setProjects(updateProjectManuscript(projects, project.id, nextManuscript));
    setChapterTitleDraft("");
    setChapterContentDraft("");
    setIsManuscriptUploadOpen(false);
    setManuscriptUploadMode(null);
  }

  function handleStartRenameChapter(chapterId: string, title: string) {
    setEditingChapterId(chapterId);
    setChapterTitleEditDraft(title);
  }

  function handleSaveChapterTitle(chapterId: string) {
    if (!project.manuscript) {
      return;
    }

    const nextManuscript = renameManuscriptChapter(
      project.manuscript,
      chapterId,
      chapterTitleEditDraft,
    );
    setProjects(updateProjectManuscript(projects, project.id, nextManuscript));
    setEditingChapterId("");
    setChapterTitleEditDraft("");
  }

  function getManuscriptReaderScrollRatio() {
    const reader = manuscriptReaderRef.current;
    if (!reader) {
      return 0;
    }

    const maxScroll = reader.scrollHeight - reader.clientHeight;
    return maxScroll > 0 ? reader.scrollTop / maxScroll : 0;
  }

  function handleOpenChapterContentEditor(chapterId: string) {
    const chapter = project.manuscript?.chapters.find((item) => item.id === chapterId);
    if (!chapter) {
      return;
    }

    manuscriptEditorScrollRatioRef.current = getManuscriptReaderScrollRatio();
    setEditingManuscriptChapterId(chapterId);
    setManuscriptContentEditDraft(chapter.content);
    setIsManuscriptDiscardDialogOpen(false);
  }

  function handleCloseChapterContentEditor() {
    if (
      hasUnsavedManuscriptChapterContent(
        project.manuscript,
        editingManuscriptChapterId,
        manuscriptContentEditDraft,
      )
    ) {
      setIsManuscriptDiscardDialogOpen(true);
      return;
    }

    handleDiscardChapterContentEdit();
  }

  function handleDiscardChapterContentEdit() {
    setIsManuscriptDiscardDialogOpen(false);
    setEditingManuscriptChapterId("");
    setManuscriptContentEditDraft("");
  }

  function handleSaveChapterContent() {
    if (!project.manuscript || !editingManuscriptChapterId) {
      return;
    }

    const nextManuscript = updateManuscriptChapterContent(
      project.manuscript,
      editingManuscriptChapterId,
      manuscriptContentEditDraft,
    );
    setProjects(updateProjectManuscript(projects, project.id, nextManuscript));
    setSelectedManuscriptChapterId(editingManuscriptChapterId);
    setIsManuscriptDiscardDialogOpen(false);
    setEditingManuscriptChapterId("");
    setManuscriptContentEditDraft("");
  }

  function handleDeleteChapter(chapterId: string, title: string) {
    if (!project.manuscript) {
      return;
    }

    const confirmed = window.confirm(`确认删除章节「${title}」吗？这会清空本章节内容。`);
    if (!confirmed) {
      return;
    }

    const nextManuscript = deleteManuscriptChapter(project.manuscript, chapterId);
    setProjects(updateProjectManuscript(projects, project.id, nextManuscript));
    if (selectedManuscriptChapterId === chapterId) {
      setSelectedManuscriptChapterId(nextManuscript.chapters[0]?.id ?? "");
    }
    if (editingChapterId === chapterId) {
      setEditingChapterId("");
      setChapterTitleEditDraft("");
    }
    if (editingManuscriptChapterId === chapterId) {
      setEditingManuscriptChapterId("");
      setManuscriptContentEditDraft("");
      setIsManuscriptDiscardDialogOpen(false);
    }
  }

  function handleClearAllChapters() {
    if (!project.manuscript?.chapters.length) {
      return;
    }

    const confirmed = window.confirm("确认删除所有章节吗？这会清空当前小说已上传的章节内容。");
    if (!confirmed) {
      return;
    }

    setProjects(
      updateProjectManuscript(projects, project.id, clearManuscriptChapters(project.manuscript)),
    );
    setSelectedManuscriptChapterId("");
    setEditingChapterId("");
    setChapterTitleEditDraft("");
    setEditingManuscriptChapterId("");
    setManuscriptContentEditDraft("");
    setIsManuscriptDiscardDialogOpen(false);
  }

  function updateActiveOutlineParts(outlineParts: ReturnType<typeof ensureOutlineParts>) {
    setProjects(updateProjectOutlineParts(projects, project.id, outlineParts));
  }

  function openOutlinePartEditor(partId: string, parts = ensureOutlineParts(project)) {
    const part = parts.find((item) => item.id === partId);
    if (!part) {
      return;
    }

    setEditingOutlinePartId(part.id);
    setOutlinePartDraft({
      title: part.title,
      chapterIds: part.chapterIds,
      characterIds: part.characterIds,
      summary: part.summary,
    });
    setOutlinePartChapterQuery("");
    setOutlinePartCharacterQuery("");
  }

  function handleAddOutlinePart() {
    const nextParts = addOutlinePart(ensureOutlineParts(project));
    updateActiveOutlineParts(nextParts);
    openOutlinePartEditor(nextParts[nextParts.length - 1].id, nextParts);
  }

  function handleDeleteSelectedOutlineParts() {
    if (!selectedOutlinePartIds.length) {
      return;
    }

    updateActiveOutlineParts(deleteOutlineParts(ensureOutlineParts(project), selectedOutlinePartIds));
    setSelectedOutlinePartIds([]);
    if (selectedOutlinePartIds.includes(editingOutlinePartId)) {
      setEditingOutlinePartId("");
    }
  }

  function handleSaveOutlinePartEdit() {
    if (!editingOutlinePartId) {
      return;
    }

    updateActiveOutlineParts(
      updateOutlinePart(ensureOutlineParts(project), editingOutlinePartId, outlinePartDraft),
    );
    setEditingOutlinePartId("");
  }

  function handleMoveOutlinePart(sourcePartId: string, targetPartId: string) {
    updateActiveOutlineParts(moveOutlinePart(ensureOutlineParts(project), sourcePartId, targetPartId));
    setDraggedOutlinePartId("");
  }

  if (view === "login") {
    return (
      <main className="loginStage">
        <video
          ref={loginVideoRef}
          aria-hidden="true"
          autoPlay={!loginVideoEnded}
          className="loginVideo"
          muted
          onEnded={(event) => {
            event.currentTarget.pause();
            const destinationProjectId = pendingDestinationProjectRef.current;
            if (destinationProjectId) {
              pendingDestinationProjectRef.current = null;
              isContinuingFlightRef.current = false;
              setIsContinuingFlight(false);
              handleOpenProject(destinationProjectId);
              return;
            }

            setLoginVideoEnded(true);
          }}
          onError={() => {
            if (
              shouldRevealFlightDestinationOnFallback(
                isContinuingFlightRef.current,
                loginVideoEnded,
              )
            ) {
              setLoginVideoEnded(true);
            }
          }}
          onLoadedMetadata={(event) => {
            if (!loginVideoEnded) {
              return;
            }

            event.currentTarget.currentTime = flightIntroEndTime;
            event.currentTarget.pause();
          }}
          onTimeUpdate={(event) => {
            if (
              shouldPauseFlightIntro(
                event.currentTarget.currentTime,
                isContinuingFlightRef.current,
                loginVideoEnded,
              )
            ) {
              event.currentTarget.pause();
              setLoginVideoEnded(true);
            }
          }}
          playsInline
          src="/pixel-login-background.mp4"
        />
        <header className="loginNav flightLoginNav">
          <strong>AI小说管理平台</strong>
        </header>
        {loginVideoEnded ? (
          <section className="flightHud" aria-label="航班终点选择">
            <div className="flightPrompt">
              <span>选择你的小说世界</span>
            </div>
            <div className="flightWorldActions">
              <button onClick={handleStartCreateWorld} type="button">
                新建世界
              </button>
              <button
                className={isDeletingWorld ? "active" : ""}
                onClick={() => {
                  setIsDeletingWorld(false);
                  setIsDeleteWorldDialogOpen(true);
                }}
                type="button"
              >
                删除世界
              </button>
            </div>
            <aside
              className="destinationSelector"
              aria-label="小说世界入口"
              onWheel={handleDestinationWheel}
            >
              <button
                aria-label="向上滑动终点"
                className="destinationSlideControl top"
                onClick={() => shiftDestination(-1)}
                type="button"
              />
              <div className="destinationScrollHint" aria-hidden="true">
                滚轮切换世界
              </div>
              {visibleDestinationSlots.map((slot, index) => {
                const linkedProject = getDestinationProject(projects, destinationLinks, slot.id);
                const chapterCount = linkedProject?.manuscript?.chapters.length ?? 0;
                const wordCount = getManuscriptWordCount(linkedProject?.manuscript);
                const synopsis =
                  linkedProject?.synopsis?.trim() ||
                  "这个世界还没有简介，进入后可以继续补全。";
                return (
                  <button
                    aria-label={linkedProject?.title ?? slot.label}
                    className={`destinationChoice destinationPosition${index} ${
                      linkedProject ? "linked" : "empty"
                    }`}
                    key={slot.id}
                    onClick={() => handleDestinationClick(slot.id)}
                    type="button"
                  >
                    <span className="destinationCoverSlot">
                      {linkedProject?.coverImage ? (
                        <img alt={`${linkedProject.title}封面`} src={linkedProject.coverImage.url} />
                      ) : (
                        <span className="destinationCoverPlaceholder" aria-hidden="true" />
                      )}
                    </span>
                    <span className="destinationContent">
                      <span className="destinationTitleRow">
                        <strong>{linkedProject?.title ?? "未关联世界"}</strong>
                      </span>
                      <span className="destinationSynopsis">
                        {linkedProject ? synopsis : "点击这里创建新的小说世界。"}
                      </span>
                      <span className="destinationMetrics">
                        <span>章节 {formatLoginMetric(chapterCount)}</span>
                        <span>字数 {formatLoginMetric(wordCount)}</span>
                      </span>
                    </span>
                  </button>
                );
              })}
              <button
                aria-label="向下滑动终点"
                className="destinationSlideControl bottom"
                onClick={() => shiftDestination(1)}
                type="button"
              />
            </aside>
          </section>
        ) : null}

        {destinationCreateTarget ? (
          <div className="modalBackdrop authBackdrop" role="presentation">
            <form
              aria-label="新建世界"
              className="recordDialog authDialog worldDialog"
              onSubmit={handleCreateDestinationProject}
            >
              <div className="dialogHeader">
                <div>
                  <span className="eyebrow">航班终点尚未写入坐标</span>
                  <h2>新建世界</h2>
                </div>
                <button
                  onClick={() => {
                    setDestinationCreateTarget(null);
                    setWorldCoverImage(undefined);
                  }}
                  type="button"
                >
                  关闭
                </button>
              </div>
              <div className="fieldGroup">
                <span>世界 / 小说名称</span>
                <div className="titleCoverRow">
                  <input
                    autoFocus
                    onChange={(event) => setWorldProjectTitle(event.target.value)}
                    placeholder="输入小说书名或世界名。"
                    required
                    value={worldProjectTitle}
                  />
                  <label className="coverUploadButton">
                    上传封面
                    <input
                      accept="image/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          handleWorldCoverUpload(file);
                          event.target.value = "";
                        }
                      }}
                      type="file"
                    />
                  </label>
                </div>
              </div>
              {worldCoverImage ? (
                <div className="coverPreview">
                  <img alt="小说封面预览" src={worldCoverImage.url} />
                  <span>{worldCoverImage.name}</span>
                </div>
              ) : null}
              <div className="dialogFooter">
                <button
                  onClick={() => {
                    setDestinationCreateTarget(null);
                    setWorldCoverImage(undefined);
                  }}
                  type="button"
                >
                  取消
                </button>
                <button type="submit">创建并进</button>
              </div>
            </form>
          </div>
        ) : null}
        {isDeleteWorldDialogOpen ? (
          <div className="modalBackdrop authBackdrop" role="presentation">
            <section
              aria-label="删除世界"
              aria-modal="true"
              className="recordDialog authDialog worldDialog deleteWorldDialog"
              role="dialog"
            >
              <div className="dialogHeader">
                <div>
                  <span className="eyebrow">选择需要移除的航班终点</span>
                  <h2>删除世界</h2>
                </div>
                <button onClick={() => setIsDeleteWorldDialogOpen(false)} type="button">
                  关闭
                </button>
              </div>
              <div className="deleteWorldList">
                {projects.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleDeleteWorld(item.id)}
                    type="button"
                  >
                    {item.coverImage ? (
                      <img alt={`${item.title}封面`} src={item.coverImage.url} />
                    ) : (
                      <span className="deleteWorldFallback">{item.title.slice(0, 1)}</span>
                    )}
                    <strong>{item.title}</strong>
                    <small>{item.records.length} 条资</small>
                  </button>
                ))}
              </div>
              <div className="dialogFooter">
                <button onClick={() => setIsDeleteWorldDialogOpen(false)} type="button">
                  取消
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </main>
    );
  }

  if (view === "library") {
    return (
      <main className="libraryStage">
        <section className="libraryHeader">
          <span className="eyebrow">奇幻书库</span>
          <h1>选择一本小说，进入它的资料</h1>
          <p>每本漂浮的书代表一个小说项目。上传封面后，它会成为这本书的封面</p>
        </section>

        <section className="floatingBooks" aria-label="小说书库">
          {projects.map((item, index) => (
            <article
              className="floatingBook"
              key={item.id}
              style={{ ["--float-delay" as string]: `${index * 0.35}s` }}
            >
              <button
                className="bookCover"
                onClick={() => handleOpenProject(item.id)}
                type="button"
              >
                {item.coverImage ? (
                  <img alt={`${item.title}封面`} src={item.coverImage.url} />
                ) : (
                  <div className="coverFallback">
                    <span>{item.title.slice(0, 1)}</span>
                    <strong>{item.title}</strong>
                  </div>
                )}
              </button>
              <div className="bookInfo">
                <strong>{item.title}</strong>
                <small>{item.records.length} 条资</small>
                <label>
                  上传封面
                  <input
                    accept="image/*"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        handleUploadCover(item.id, file);
                        event.target.value = "";
                      }
                    }}
                    type="file"
                  />
                </label>
              </div>
            </article>
          ))}
        </section>

        <section className="libraryCreate">
          <input
            aria-label="新小说标题"
            onChange={(event) => setNewProjectTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                handleAddProject();
              }
            }}
            placeholder="新小说标题"
            value={newProjectTitle}
          />
          <button onClick={handleAddProject} type="button">
            新增小说
          </button>
        </section>
      </main>
    );
  }

  const worldModules = WORLD_CONSOLE_MODULES;

  if (view === "workspace") {
    const chapterCount = project.manuscript?.chapters.length ?? 0;
    const nextChapterNumber = chapterCount + 1;
    const currentChapterGoalPreview = project.currentChapterGoal?.plot.trim() ?? "";
    const manuscriptWordCount = getManuscriptWordCount(project.manuscript);
    const progressPercent = project.targetWordCount
      ? Math.min(100, Math.round((manuscriptWordCount / project.targetWordCount) * 100))
      : 0;
    const manuscriptChapters = project.manuscript?.chapters ?? [];
    const recentChapters = manuscriptChapters.slice(-3).reverse();
    const recentStoryStatus = manuscriptChapters.length >= 3
      ? "最近 3 章已读取"
      : manuscriptChapters.length
        ? "已读取全部章节"
        : "暂无章节";
    const writingKnowledgeRecords = project.records.filter((record) =>
      ["character", "location", "item", "faction", "worldRule"].includes(record.type),
    );
    const pendingForeshadowingCount = getWritingReferenceForeshadowingCount(foreshadowings);
    const preparation = getWritingReferencePreparation();
    const nextChapterCharacterIds = preparation.nextChapterCharacterIds ?? [];
    const selectedNextChapterCharacters = characters.filter((character) =>
      nextChapterCharacterIds.includes(character.id),
    );
    const normalizedWritingReferenceCharacterQuery = writingReferenceCharacterQuery.trim().toLocaleLowerCase();
    const visibleWritingReferenceCharacters = characters.filter((character) =>
      !normalizedWritingReferenceCharacterQuery ||
      character.name.toLocaleLowerCase().includes(normalizedWritingReferenceCharacterQuery),
    );
    const hasTemporaryRequest = Object.values(preparation.temporaryRequest).some((value) =>
      Boolean(value.trim()),
    );
    const chapterAnalysisProgressState = getChapterAnalysisProgressState(project, {
      isRunning: isChapterAnalysisRunning,
      progress: chapterAnalysisProgress,
    });
    const hasDeepAnalysis = chapterAnalysisProgressState.state === "complete";
    const writingReferenceMemoryStatus =
      chapterAnalysisProgressState.state === "complete"
        ? "已全部解析"
        : chapterAnalysisProgressState.state === "running"
          ? `解析中 · ${chapterAnalysisProgressState.progress}%`
          : chapterAnalysisProgressState.state === "partial"
            ? `已完成 ${chapterAnalysisProgressState.progress}%`
            : "暂未解析";
    const writingReferenceMemoryHint =
      chapterAnalysisProgressState.state === "complete"
        ? "全书摘要、章节记忆和线索报告已准备好。"
        : chapterAnalysisProgressState.state === "running"
          ? "正在整理本次续写会用到的主线、人物和伏笔。"
          : chapterAnalysisProgressState.state === "partial"
            ? "还有部分章节等待解析，补齐后会更连贯。"
            : "解析后，AI 能更稳定地记住主线、人物和伏笔。";
    const writingReferenceMemoryAction =
      chapterAnalysisProgressState.state === "complete"
        ? "查看"
        : chapterAnalysisProgressState.state === "running"
          ? "进行中"
          : chapterAnalysisProgressState.state === "partial"
            ? "继续解析"
            : "解析";
    const handleMemoryReferenceCard = () => {
      if (hasDeepAnalysis) {
        handleOpenWritingReference("memory");
        return;
      }
      handleOpenAiAnalysisFromWritingReference();
    };
    const openWorkbenchModule = (tone: (typeof worldModules)[number]["tone"]) => {
      if (tone === "outline") {
        setView("outline");
      } else if (tone === "character") {
        setView("characters");
      } else if (tone === "clue") {
        setView("clues");
      } else {
        setView("aiContinuation");
      }
    };
    const aiSuggestionPool = project.aiSuggestionPool ?? project.aiSuggestionQueue ?? [];
    const aiSuggestionSummary = getAiSuggestionSummary(project);
    const pendingAiSuggestions = aiSuggestionPool.filter((suggestion) => suggestion.status === "pending");
    const pendingNewCharacterCount = pendingAiSuggestions.filter(
      (suggestion) => suggestion.type === "newCharacter",
    ).length;
    const pendingCharacterChangeCount = pendingAiSuggestions.filter(
      (suggestion) => suggestion.type === "characterUpdate",
    ).length;
    const projectCharactersForReview = getProjectCharacters(project);
    const characterSuggestionMergeSuggestion = characterSuggestionMergeDialog
      ? aiSuggestionPool.find((suggestion) => suggestion.id === characterSuggestionMergeDialog.suggestionId)
      : undefined;
    const characterSuggestionMergeTarget = characterSuggestionMergeDialog?.targetCharacterId
      ? (project.characters ?? []).find((character) => character.id === characterSuggestionMergeDialog.targetCharacterId)
      : undefined;
    const characterSuggestionMergeFields = characterSuggestionMergeSuggestion?.characterChanges ?? [];
    const laterAiSuggestions = aiSuggestionPool.filter((suggestion) => suggestion.status === "later");
    const resolvedAiSuggestions = aiSuggestionPool.filter(
      (suggestion) => suggestion.status === "accepted" || suggestion.status === "ignored",
    );
    const allWatchClueSuggestions = aiSuggestionPool.filter(
      (suggestion) =>
        getAiSuggestionCategory(suggestion.type) === "clues" &&
        suggestion.status === "pending" &&
        getClueSuggestionTier(suggestion) === "watch",
    );
    const categoryAiSuggestions = aiSuggestionPool.filter(
      (suggestion) => getAiSuggestionCategory(suggestion.type) === aiSuggestionReviewCategory,
    );
    const priorityClueSuggestions = categoryAiSuggestions.filter(
      (suggestion) => suggestion.status === "pending" && getClueSuggestionTier(suggestion) === "priority",
    );
    const watchClueSuggestions = categoryAiSuggestions.filter(
      (suggestion) => suggestion.status === "pending" && getClueSuggestionTier(suggestion) === "watch",
    );
    const recordClueSuggestions = categoryAiSuggestions.filter(
      (suggestion) => suggestion.status === "pending" && getClueSuggestionTier(suggestion) === "record",
    );
    const pendingCategoryAiSuggestions = categoryAiSuggestions.filter(
      (suggestion) => suggestion.status === "pending",
    );
    const laterCategoryAiSuggestions = categoryAiSuggestions.filter(
      (suggestion) => suggestion.status === "later",
    );
    const resolvedCategoryAiSuggestions = categoryAiSuggestions.filter(
      (suggestion) => suggestion.status === "accepted" || suggestion.status === "ignored",
    );
    const reviewedAiSuggestions =
      aiSuggestionReviewCategory === "clues" && aiSuggestionReviewStatus === "priority"
        ? priorityClueSuggestions
        : aiSuggestionReviewCategory === "clues" && aiSuggestionReviewStatus === "watch"
          ? watchClueSuggestions
          : aiSuggestionReviewCategory === "clues" && aiSuggestionReviewStatus === "record"
            ? recordClueSuggestions
            : aiSuggestionReviewStatus === "later"
              ? laterCategoryAiSuggestions
              : aiSuggestionReviewStatus === "resolved"
                ? resolvedCategoryAiSuggestions
                : pendingCategoryAiSuggestions;
    const isCharacterImportanceReview =
      aiSuggestionReviewCategory === "characters" && aiSuggestionReviewStatus === "pending";
    const characterImportanceGroups = (["main", "important", "minor"] as AiSuggestionImportanceLevel[]).map(
      (level) => {
        const suggestions = sortCharacterSuggestionsForReview(
          pendingCategoryAiSuggestions.filter((suggestion) => suggestion.importanceLevel === level),
        );
        return {
          level,
          label: level === "main" ? "主要角色" : level === "important" ? "重要角色" : "非重要角色",
          suggestions,
          reviewCount: suggestions.filter((suggestion) => suggestion.auditNeedsHumanReview).length,
        };
      },
    );
    const hasReviewableAiSuggestions = aiSuggestionPool.some(
      (suggestion) => suggestion.status === "pending" || suggestion.status === "later",
    );
    const suggestionReviewHeadingLabel: Record<AiSuggestionReviewStatus, string> = {
      pending: "待确认",
      priority: "优先确认",
      watch: "继续观察",
      record: "解析记录",
      later: "稍后处理",
      resolved: "已处理",
    };
    const aiSuggestionReviewPagination = getAiSuggestionPage(
      reviewedAiSuggestions,
      aiSuggestionReviewPage,
    );
    const aiSuggestionReviewPageNumbers = getAiSuggestionPageNumbers(
      aiSuggestionReviewPagination.page,
      aiSuggestionReviewPagination.totalPages,
    );
    const setSuggestionReviewPage = (nextPage: number) => {
      const page = Math.min(
        Math.max(1, Math.floor(Number.isFinite(nextPage) ? nextPage : 1)),
        aiSuggestionReviewPagination.totalPages,
      );
      setAiSuggestionReviewPage(page);
      setAiSuggestionReviewPageDraft(String(page));
    };
    const suggestionStatusLabels = {
      pending: "待确认",
      accepted: "已加入",
      later: "稍后处理",
      ignored: "已忽略",
    } as const;
    const suggestionStatusTones = {
      pending: "review",
      accepted: "updated",
      later: "optional",
      ignored: "conflict",
    } as const;
    const handleReviewAiSuggestion = (
      id: string,
      action: "accepted" | "later" | "ignored",
    ) => {
      const suggestion = aiSuggestionPool.find((item) => item.id === id);
      if (!suggestion) {
        return;
      }
      if (action === "accepted" && suggestion.identityStatus === "ambiguous") {
        setWorkbenchNotice("这条称呼对应多位人物，请先选择其实际指向的人物，再确认同步。");
        return;
      }

      const acceptance =
        action === "accepted"
          ? applyAcceptedAiSuggestion(project, suggestion)
          : { project, didCreate: false };
      const skippedTitles = "skippedTitles" in acceptance ? (acceptance.skippedTitles ?? []) : [];
      if (action === "accepted" && clueDraftProjectId === project.id) {
        const acceptedForeshadowings = normalizeForeshadowings(
          acceptance.project.foreshadowings,
          acceptance.project.records,
        );
        setDraftForeshadowings((draft) => mergeForeshadowingItems(draft, acceptedForeshadowings));
        setSavedForeshadowingsJson((savedJson) => {
          try {
            const saved = normalizeForeshadowings(JSON.parse(savedJson), project.records);
            return JSON.stringify(mergeForeshadowingItems(saved, acceptedForeshadowings));
          } catch {
            return JSON.stringify(acceptedForeshadowings);
          }
        });
      }

      setProjects((currentProjects) =>
        currentProjects.map((item) => {
          if (item.id !== project.id) {
            return item;
          }

          const nextProject = action === "accepted" ? applyAcceptedAiSuggestion(item, suggestion).project : item;
          const nextPool = updateAiSuggestionStatus(
            nextProject.aiSuggestionPool ?? nextProject.aiSuggestionQueue ?? [],
            id,
            action,
          );

          return {
            ...nextProject,
            aiSuggestionPool: nextPool,
          };
        }),
      );
      setSuggestionReviewPage(1);
      setWorkbenchNotice(
        action === "accepted"
          ? skippedTitles.length
            ? `已同步可更新资料；${skippedTitles.join("、")}已保护，不会覆盖。`
            : suggestion.type !== "newCharacter" && suggestion.type !== "newForeshadowing"
            ? "已标记为加入，相关资料可在之后继续补充。"
            : acceptance.didCreate
              ? "已加入作品资料库。"
              : "资料库中已有同名记录，已标记为加入。"
          : action === "later"
            ? "已标记为稍后处理。"
            : "已忽略这条建议。",
      );
    };
    const handleResolveAiSuggestionIdentity = (suggestionId: string, characterId: string) => {
      const character = projectCharactersForReview.find((item) => item.id === characterId);
      if (!character) return;
      setProjects((currentProjects) =>
        currentProjects.map((item) =>
          item.id !== project.id
            ? item
            : {
                ...item,
                aiSuggestionPool: (item.aiSuggestionPool ?? item.aiSuggestionQueue ?? []).map((suggestion) =>
                  suggestion.id === suggestionId
                    ? {
                        ...suggestion,
                        type: "characterUpdate",
                        targetName: character.name,
                        title: `${character.name} 可能需要记录`,
                        canonicalKey: `characterUpdate:${character.name.trim().toLocaleLowerCase()}`,
                        identityStatus: "resolved",
                        identityCandidateIds: undefined,
                      }
                    : suggestion,
                ),
              },
        ),
      );
      setWorkbenchNotice(`已将该称呼归一到“${character.name}”，请再确认是否同步资料。`);
    };
    const handleOpenCharacterSuggestionMerge = (suggestionId: string) => {
      setCharacterSuggestionMergeDialog({ suggestionId, targetCharacterId: "", query: "", choices: {} });
    };
    const handleConfirmCharacterSuggestionMerge = () => {
      if (!characterSuggestionMergeDialog?.targetCharacterId) {
        setWorkbenchNotice("请先选择要并入的目标人物。");
        return;
      }
      try {
        const nextProject = mergeCharacterSuggestionIntoProfile(project, {
          suggestionId: characterSuggestionMergeDialog.suggestionId,
          targetCharacterId: characterSuggestionMergeDialog.targetCharacterId,
          choices: Object.values(characterSuggestionMergeDialog.choices),
        });
        updateActiveProject(nextProject);
        setCharacterSuggestionMergeDialog(null);
        setWorkbenchNotice("人物建议已并入目标人物；原建议与章节证据已保留，可在已处理记录中追溯。");
      } catch (error) {
        setWorkbenchNotice(error instanceof Error ? error.message : "人物合并失败，原资料未被修改。");
      }
    };
    const handleSetAiSuggestionImportance = (
      suggestionId: string,
      importanceOverride: AiSuggestionImportanceLevel,
    ) => {
      setProjects((currentProjects) => currentProjects.map((item) =>
        item.id !== project.id
          ? item
          : {
              ...item,
              aiSuggestionPool: (item.aiSuggestionPool ?? item.aiSuggestionQueue ?? []).map((suggestion) =>
                suggestion.id === suggestionId ? { ...suggestion, importanceLevel: importanceOverride, importanceOverride } : suggestion,
              ),
            },
      ));
      setWorkbenchNotice("已保存人物重要度；后续重新整理建议时会保留此选择。");
    };

    return (
      <main className="worldConsole">
        <div className="worldConsoleGrid" aria-hidden="true" />
        <header className="worldConsoleHeader workbenchConsoleHeader">
          <div className="workbenchHeaderBrand">
            <strong>Air to World</strong>
            <span>今日创作工作台</span>
          </div>
          <button
            onClick={() => {
              setLoginVideoEnded(true);
              setView("login");
            }}
            type="button"
          >
            返回
          </button>
        </header>

        <section className="workbenchStage" aria-label={`${project.title}今日创作工作台`}>
          <section className="workbenchHero">
            <section className="workbenchPanel workbenchProjectCard" aria-label="当前作品">
              <div className="workbenchPanelHeading">
                <span>当前作品</span>
                <strong>创作中</strong>
              </div>
              <div className="workbenchProjectIntro">
                <label className="workbenchCoverSlot">
                  {project.coverImage ? (
                    <img alt={`${project.title}封面`} src={project.coverImage.url} />
                  ) : (
                    <span aria-hidden="true">+</span>
                  )}
                  <input
                    accept="image/*"
                    aria-label="上传小说封面"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        handleUploadCover(project.id, file);
                        event.target.value = "";
                      }
                    }}
                    type="file"
                  />
                </label>
                <div className="workbenchProjectDetails">
                  <div className="workbenchTitleRow">
                    {isEditingWorldTitle ? (
                      <input
                        autoFocus
                        className="workbenchTitleInput"
                        onBlur={handleSaveWorldTitle}
                        onChange={(event) => setWorldTitleDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") handleSaveWorldTitle();
                          if (event.key === "Escape") {
                            setWorldTitleDraft(project.title);
                            setIsEditingWorldTitle(false);
                          }
                        }}
                        value={worldTitleDraft}
                      />
                    ) : (
                      <h1>{project.title}</h1>
                    )}
                    <button
                      aria-label="修改小说标题"
                      className="workbenchEditButton"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setWorldTitleDraft(project.title);
                        setIsEditingWorldTitle(true);
                      }}
                      type="button"
                    >
                      编辑
                    </button>
                  </div>
                  <p>{project.synopsis || "为这部作品写下一段属于你的旅程。"}</p>
                  <button
                    className="workbenchTextButton"
                    onClick={handleOpenWorldSynopsisDialog}
                    type="button"
                  >
                    编辑简介
                  </button>
                </div>
              </div>
              <div className="workbenchProgress">
                <div>
                  <span>已写正文</span>
                  <strong>{manuscriptWordCount.toLocaleString()} 字</strong>
                </div>
                <div>
                  <span>当前进度</span>
                  <strong>{progressPercent}%</strong>
                </div>
                <div>
                  <span>待回收伏笔</span>
                  <strong>{openClues.length} 条</strong>
                </div>
              </div>
            </section>

            <section className="workbenchPanel workbenchTodayPanel" aria-label="今日创作">
              <div className="workbenchPanelHeading">
                <span>今日创作</span>
                <strong>第 {nextChapterNumber} 章准备中</strong>
              </div>
              <div className="workbenchChapterMission todayWritingMission">
                <span>本章目标</span>
                <div className="todayWritingGoal">
                  <p>
                    {currentChapterGoalPreview
                      ? `已确认：${currentChapterGoalPreview.slice(0, 36)}${
                          currentChapterGoalPreview.length > 36 ? "…" : ""
                        }`
                      : "还未确认"}
                  </p>
                  <button
                    className="todayWritingEditButton"
                    onClick={handleOpenCurrentChapterGoal}
                    type="button"
                  >
                    编辑
                  </button>
                </div>
                <button
                  className="todayWritingStartButton"
                  onClick={() => setTodayWritingDialog("choices")}
                  type="button"
                >
                  开始今日创作
                </button>
                <button
                  className="todayWritingManageButton"
                  onClick={handleManageExistingWriting}
                  type="button"
                >
                  管理已有章节和大纲
                </button>
              </div>
            </section>

            <aside className="workbenchPanel workbenchReferencePanel" aria-label="本次写作参考">
              <div className="workbenchPanelHeading">
                <span>本次写作参考</span>
                <strong>写前准备</strong>
              </div>
              <p className="workbenchPanelHint">写之前，把真正要用到的故事资料准备好。</p>
              <div className="writingReferenceStatusList">
                <article className="writingReferenceStatusRow">
                  <button
                    aria-label={`整本书记忆，${writingReferenceMemoryStatus}，${writingReferenceMemoryAction}`}
                    onClick={handleMemoryReferenceCard}
                    type="button"
                  >
                    <span>整本书记忆</span>
                    <strong>{writingReferenceMemoryStatus}</strong>
                    <small>{writingReferenceMemoryHint}</small>
                    <span className="writingReferenceStatusAction" aria-hidden="true">
                      <i>{hasDeepAnalysis ? "↗" : "✦"}</i>
                      <b>{writingReferenceMemoryAction}</b>
                    </span>
                  </button>
                </article>
                <button onClick={() => handleOpenWritingReference("recent")} type="button">
                  <span>最近剧情</span>
                  <strong>{recentStoryStatus}</strong>
                  <small>只查看本次写作需要的章节标题。</small>
                </button>
                <button onClick={() => handleOpenWritingReference("knowledge")} type="button">
                  <span>人物与设定</span>
                  <strong>{writingKnowledgeRecords.length} 条</strong>
                  <small>人物、地点、物品和世界规则等资料。</small>
                </button>
                <button onClick={() => handleOpenWritingReference("foreshadowings")} type="button">
                  <span>伏笔线索</span>
                  <strong>{pendingForeshadowingCount ? `${pendingForeshadowingCount} 条待确认` : "暂无待确认"}</strong>
                  <small>看看这一章要推进、回收或先放着的线索。</small>
                </button>
                <article className="writingReferenceStatusRow">
                  <button
                    aria-label={`我的要求，${hasTemporaryRequest ? "已填写，编辑" : "待填写，填写"}`}
                    onClick={() => handleOpenWritingReference("request")}
                    type="button"
                  >
                    <span>我的要求</span>
                    <strong>{hasTemporaryRequest ? "已填写" : "待填写"}</strong>
                    <small>留住这章必须发生的事与写作感觉。</small>
                    <span className="writingReferenceStatusAction" aria-hidden="true">
                      <i>{hasTemporaryRequest ? "✎" : "+"}</i>
                      <b>{hasTemporaryRequest ? "编辑" : "填写"}</b>
                    </span>
                  </button>
                </article>
              </div>
              <button
                className="writingReferenceManageButton"
                onClick={() => handleOpenWritingReference("memory")}
                type="button"
              >
                管理写作参考
              </button>
              <div className="workbenchSuggestionHeader">
                <span>AI 建议待确认</span>
                <small>建议不会自动改你的设定</small>
              </div>
              <article className="workbenchSuggestionSummary">
                <div>
                  <strong>
                    {aiSuggestionSummary.pendingCount
                      ? `${aiSuggestionSummary.pendingCount} 条待确认建议`
                      : "暂无待处理建议"}
                  </strong>
                  <p>
                    {aiSuggestionSummary.pendingCount
                      ? aiSuggestionSummary.typeLabel
                      : "完成深度解析后，AI 会把可能新增的人物、伏笔和设定整理给你确认。"}
                  </p>
                  {aiSuggestionSummary.pendingCount ? (
                    <small>已从 {project.chapterAnalyses?.length ?? 0} 章解析中整理</small>
                  ) : null}
                  {aiSuggestionSummary.laterCount ? (
                    <small>另有 {aiSuggestionSummary.laterCount} 条稍后处理</small>
                  ) : null}
                  {!aiSuggestionSummary.pendingCount && allWatchClueSuggestions.length ? (
                    <small>另有 {allWatchClueSuggestions.length} 条线索正在继续观察</small>
                  ) : null}
                </div>
                <button
                  onClick={() => {
                    if (hasReviewableAiSuggestions) {
                      const hasPrimarySuggestions = aiSuggestionSummary.pendingCount > 0;
                      setAiSuggestionReviewStatus(hasPrimarySuggestions ? "pending" : "priority");
                      setAiSuggestionReviewCategory(hasPrimarySuggestions ? "characters" : "clues");
                      setAiSuggestionReviewPageDraft("1");
                      setAiSuggestionReviewPage(1);
                      setIsAiSuggestionReviewDialogOpen(true);
                      return;
                    }
                    handleOpenAiAnalysisFromWritingReference();
                  }}
                  type="button"
                >
                  {hasReviewableAiSuggestions ? "查看建议" : "去解析作品"}
                </button>
              </article>
              {workbenchNotice ? <p className="workbenchNotice">{workbenchNotice}</p> : null}
            </aside>
          </section>

          <section className="workbenchTools" aria-label="我的创作资料">
            <div className="workbenchSectionHeading">
              <div>
                <span>我的创作资料</span>
                <h2>把故事里重要的事，留在随手可用的地方</h2>
              </div>
              <small>每次修改都会成为之后写作的参考</small>
            </div>
            <div className="workbenchToolGrid">
              {worldModules.map((module) => {
                const [primaryTitle, secondaryTitle] = getWorldModuleTitleLines(module.title);
                const detail = WORKBENCH_TOOL_DETAILS[module.tone];

                return (
                  <button
                    className={`workbenchTool ${module.tone}`}
                    key={module.title}
                    onClick={() => openWorkbenchModule(module.tone)}
                    type="button"
                  >
                    <span>{module.title}</span>
                    <strong>
                      {primaryTitle}
                      {secondaryTitle ? ` · ${secondaryTitle}` : ""}
                    </strong>
                    <small>{detail.description}</small>
                    <em>{detail.label}</em>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="workbenchAssistant" aria-label="AI 助手">
            <div className="workbenchSectionHeading">
              <div>
                <span>AI 助手</span>
                <h2>写作时帮你记住，决定权始终在你</h2>
              </div>
              <small>每条建议都能看到它参考了什么</small>
            </div>
            <div className="workbenchAssistantGrid">
              <article>
                <span>续写前准备</span>
                <h3>先读完，再继续</h3>
                <p>前文摘要 · 当前章节目标 · 关键人物状态 · 未回收伏笔 · 世界观规则</p>
              </article>
              <article>
                <span>资料依据</span>
                <h3>每条建议都有来处</h3>
                <p>人物卡 · 伏笔 · 世界观规则 · 章节正文。你可以查看参考来源。</p>
              </article>
              <article>
                <span>写作模式</span>
                <h3>选择这次怎么写</h3>
                <p>续写正文 · 生成章纲 · 润色对白 · 增强冲突 · 检查矛盾</p>
              </article>
              <article>
                <span>矛盾检查</span>
                <h3>写完后再一起看</h3>
                <p>人设 · 时间线 · 设定 · 伏笔 · 文风。重要设定也可以锁定。</p>
              </article>
            </div>
          </section>

          <details className="developerDataOverview">
            <summary>
              <span>数据一览</span>
              <small>开发者</small>
            </summary>
            <div className="developerDataOverviewBody">
              <p>
                <span>数据库状态</span>
                <strong>
                  {databaseStatus === "ready"
                    ? "已同步"
                    : databaseStatus === "backup"
                      ? "暂无作品"
                      : databaseStatus === "checking"
                        ? "检查中"
                        : "暂不可用"}
                </strong>
              </p>
              <p>
                <span>当前小说</span>
                <strong>{project.title} · {project.manuscript?.chapters.length ?? 0} 章</strong>
              </p>
              {databaseStatus === "ready" ? (
                <p>
                  <span>多端同步</span>
                  <strong>
                    {databaseSyncStatus === "syncing"
                      ? "同步中"
                      : databaseSyncStatus === "error"
                        ? "等待重试"
                        : "已连接"}
                  </strong>
                </p>
              ) : null}
              {indexStatus ? (
                <p>
                  <span>检索索引</span>
                  <strong>完成 {indexStatus.completedChapters}/{indexStatus.totalChapters} · 待处理 {indexStatus.pendingChapters} · 失败 {indexStatus.failedChapters}</strong>
                </p>
              ) : null}
              <details className="developerReliabilityOverview">
                <summary>AI 可靠性</summary>
                {reliabilityMetrics.runCount ? (
                  <div className="reliabilityMetricGrid">
                    <article className="reliabilityMetric">
                      <span>续写记录</span>
                      <strong>{reliabilityMetrics.runCount} 次</strong>
                      <small>最近 30 次，仅当前小说</small>
                    </article>
                    <article className="reliabilityMetric">
                      <span>依据评分</span>
                      <strong>{reliabilityMetrics.averageGroundingScore} 分</strong>
                      <small>基于本次引用资料的完整度</small>
                    </article>
                    <article className="reliabilityMetric">
                      <span>保守续写率</span>
                      <strong>{reliabilityMetrics.limitedRate}%</strong>
                      <small>资料不足时明确收缩创作范围</small>
                    </article>
                    <article className="reliabilityMetric">
                      <span>风险检查</span>
                      <strong>
                        <em className="riskHigh">高风险 {reliabilityMetrics.highRiskCount}</em>
                        <em className="riskMedium">中 {reliabilityMetrics.mediumRiskCount}</em>
                        <em className="riskLow">低 {reliabilityMetrics.lowRiskCount}</em>
                      </strong>
                    </article>
                    <article className="reliabilityMetric reliabilityWide">
                      <span>作者反馈</span>
                      <strong>直接采用 {reliabilityMetrics.adoptedCount} · 修改后采用 {reliabilityMetrics.editedCount} · 不采用 {reliabilityMetrics.rejectedCount}</strong>
                    </article>
                  </div>
                ) : (
                  <p className="reliabilityEmpty">暂无续写运行记录，生成一次续写后开始统计。</p>
                )}
                <p className="reliabilityContext">
                  资料底座：索引 {indexStatus?.completedChapters ?? 0}/{indexStatus?.totalChapters ?? project.manuscript?.chapters.length ?? 0} 章 · 锁定设定 {lockedWorldRuleCount} 条 · 待确认建议 {pendingAiSuggestionCount} 条
                </p>
              </details>
              <button
                disabled={isDatabaseRefreshing}
                onClick={() => void handleRefreshProjectsFromDatabase()}
                type="button"
              >
                {isDatabaseRefreshing ? "正在从数据库刷新…" : "立即从数据库刷新"}
              </button>
              <button
                onClick={() => { window.location.href = `/evaluations?projectId=${encodeURIComponent(project.id)}`; }}
                type="button"
              >
                功能评测
              </button>
              {databaseStatus === "ready" ? (
                <button disabled={isProjectIndexing || !project.manuscript?.chapters.length} onClick={handleIndexProject} type="button">
                  {isProjectIndexing ? "正在建立检索索引…" : indexStatus?.pendingChapters ? "继续建立检索索引" : "建立检索索引"}
                </button>
              ) : null}
              {databaseStatus === "ready" ? (
                <button disabled={isSuggestionRebuilding} onClick={handleCanonicalCharacterCleanup} type="button">
                  {isSuggestionRebuilding ? "正在整理人物称呼…" : "整理人物称呼"}
                </button>
              ) : null}
              {databaseStatus === "ready" ? (
                <button disabled={isCharacterAuditing} onClick={() => void handleCharacterAudit(false)} type="button">
                  {isCharacterAuditing ? "正在复核人物重要度…" : "复核人物重要度"}
                </button>
              ) : null}
              {indexingStatus ? <small>{indexingStatus}</small> : null}
              {databaseStatus === "ready" ? (
                <div className="developerRetrievalValidation">
                  <label>
                    <span>检索问题</span>
                    <input
                      aria-label="检索问题"
                      onChange={(event) => setRetrievalQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") handleRetrievalValidation();
                      }}
                      placeholder="例如：龙文第一次出现在哪里？"
                      value={retrievalQuery}
                    />
                  </label>
                  <button disabled={isRetrieving || !retrievalQuery.trim()} onClick={handleRetrievalValidation} type="button">
                    {isRetrieving ? "检索中…" : "测试检索"}
                  </button>
                  {retrievalStatus ? <small>{retrievalStatus}</small> : null}
                  {retrievalEvidence.length ? (
                    <ol>
                      {retrievalEvidence.map((item) => (
                        <li key={item.chunkId}>
                          <details className="developerRetrievalEvidence">
                            <summary>
                              <strong>第 {item.chapterIndex} 章 · {item.chapterTitle}</strong>
                              <span>相似度 {(item.score * 100).toFixed(1)}%</span>
                              <small>点击展开原文</small>
                            </summary>
                            <p>{item.content}</p>
                          </details>
                        </li>
                      ))}
                    </ol>
                  ) : null}
                </div>
              ) : null}
              {databaseStatus === "unavailable" ? <small>请确认本机数据库服务和 DATABASE_URL 配置。</small> : null}
            </div>
          </details>
        </section>
        {todayWritingDialog === "choices" ? (
          <div className="todayWritingModalBackdrop" role="presentation">
            <section
              aria-label="今天想怎么继续"
              aria-modal="true"
              className="todayWritingDialog"
              role="dialog"
            >
              <div className="todayWritingDialogHeader">
                <div>
                  <span>今日创作</span>
                  <h2>今天想怎么继续？</h2>
                </div>
                <button onClick={() => setTodayWritingDialog(null)} type="button">
                  关闭
                </button>
              </div>
              <div className="todayWritingChoices">
                <button onClick={handleStartOwnNextChapter} type="button">
                  <span>01</span>
                  <strong>自己手写下一章</strong>
                  <small>打开下一章草稿，自己继续写。</small>
                </button>
                <button onClick={handleStartAiWriting} type="button">
                  <span>02</span>
                  <strong>AI 陪我写下一章</strong>
                  <small>先确认参考资料，再让 AI 生成草稿。</small>
                </button>
                <button onClick={handleOpenCurrentChapterGoal} type="button">
                  <span>03</span>
                  <strong>先整理本章目标</strong>
                  <small>写下剧情、冲突、伏笔和结尾钩子。</small>
                </button>
              </div>
            </section>
          </div>
        ) : null}
        {todayWritingDialog === "goal" ? (
          <div className="todayWritingModalBackdrop" role="presentation">
            <form
              aria-label="编辑本章目标"
              className="todayWritingDialog todayWritingGoalDialog"
              onSubmit={(event) => {
                event.preventDefault();
                handleSaveCurrentChapterGoal();
              }}
            >
              <div className="todayWritingDialogHeader">
                <div>
                  <span>第 {nextChapterNumber} 章</span>
                  <h2>本章想写到哪里？</h2>
                </div>
                <button onClick={() => setTodayWritingDialog(null)} type="button">
                  关闭
                </button>
              </div>
              <p className="todayWritingDialogHint">不用一次写完整，先留住这章最重要的方向。</p>
              <div className="todayWritingGoalFields">
                <label>
                  <span>剧情目标</span>
                  <textarea
                    autoFocus
                    onChange={(event) =>
                      setCurrentChapterGoalDraft((draft) => ({ ...draft, plot: event.target.value }))
                    }
                    placeholder="这一章要推进什么？"
                    value={currentChapterGoalDraft.plot}
                  />
                </label>
                <label>
                  <span>角色变化</span>
                  <textarea
                    onChange={(event) =>
                      setCurrentChapterGoalDraft((draft) => ({
                        ...draft,
                        characterChange: event.target.value,
                      }))
                    }
                    placeholder="谁会做出新的选择，或改变看法？"
                    value={currentChapterGoalDraft.characterChange}
                  />
                </label>
                <label>
                  <span>冲突 / 看点</span>
                  <textarea
                    onChange={(event) =>
                      setCurrentChapterGoalDraft((draft) => ({ ...draft, conflict: event.target.value }))
                    }
                    placeholder="这一章最值得读下去的张力是什么？"
                    value={currentChapterGoalDraft.conflict}
                  />
                </label>
                <label>
                  <span>伏笔安排</span>
                  <textarea
                    onChange={(event) =>
                      setCurrentChapterGoalDraft((draft) => ({
                        ...draft,
                        foreshadowing: event.target.value,
                      }))
                    }
                    placeholder="要埋下或推进哪一条线索？"
                    value={currentChapterGoalDraft.foreshadowing}
                  />
                </label>
                <label>
                  <span>结尾钩子</span>
                  <textarea
                    onChange={(event) =>
                      setCurrentChapterGoalDraft((draft) => ({
                        ...draft,
                        endingHook: event.target.value,
                      }))
                    }
                    placeholder="这一章结束时，要留下什么问题？"
                    value={currentChapterGoalDraft.endingHook}
                  />
                </label>
                <label>
                  <span>禁止违背的设定</span>
                  <textarea
                    onChange={(event) =>
                      setCurrentChapterGoalDraft((draft) => ({
                        ...draft,
                        lockedRules: event.target.value,
                      }))
                    }
                    placeholder="这一章不能碰的底线或规则"
                    value={currentChapterGoalDraft.lockedRules}
                  />
                </label>
              </div>
              <div className="todayWritingDialogFooter">
                <span>重要设定会一直留在你的作品资料里。</span>
                <button type="submit">保存本章目标</button>
              </div>
            </form>
          </div>
        ) : null}
        {writingReferenceDialogSection ? (
          <div className="todayWritingModalBackdrop" role="presentation">
            <section
              aria-label="管理写作参考"
              aria-modal="true"
              className="todayWritingDialog writingReferenceDialog"
              role="dialog"
            >
              <div className="todayWritingDialogHeader">
                <div>
                  <span>写前准备</span>
                  <h2>管理写作参考</h2>
                </div>
                <button onClick={() => setWritingReferenceDialogSection(null)} type="button">
                  关闭
                </button>
              </div>
              <div className="writingReferenceTabs" role="tablist" aria-label="写作参考分组">
                {[
                  ["memory", "整本书记忆"],
                  ["recent", "最近剧情"],
                  ["knowledge", "人物与设定"],
                  ["foreshadowings", "伏笔线索"],
                  ["request", "我的要求"],
                ].map(([section, label]) => (
                  <button
                    aria-selected={writingReferenceDialogSection === section}
                    className={writingReferenceDialogSection === section ? "active" : ""}
                    key={section}
                    onClick={() =>
                      setWritingReferenceDialogSection(section as Exclude<WritingReferenceDialogSection, null>)
                    }
                    role="tab"
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="writingReferenceDialogBody">
                {writingReferenceDialogSection === "memory" ? (
                  <section className="writingReferenceMemory">
                    <span className={`workbenchStatus ${hasDeepAnalysis ? "updated" : "review"}`}>
                      {writingReferenceMemoryStatus}
                    </span>
                    <h3>
                      {hasDeepAnalysis
                        ? "全书脉络已经准备好"
                        : chapterAnalysisProgressState.state === "running"
                          ? "正在整理整本书的记忆"
                          : chapterAnalysisProgressState.state === "partial"
                            ? "还有部分章节等待解析"
                            : "先让故事被好好读一遍"}
                    </h3>
                    <p>
                      {hasDeepAnalysis
                        ? "全书摘要、章节记忆和线索报告已经可供这次写作参考。"
                        : "解析不会改动你的正文或设定，只会帮助之后的写作更连贯。"}
                    </p>
                    {!hasDeepAnalysis ? (
                      <button onClick={handleOpenAiAnalysisFromWritingReference} type="button">
                        {chapterAnalysisProgressState.state === "partial" ? "继续解析" : "前往解析"}
                      </button>
                    ) : null}
                  </section>
                ) : null}
                {writingReferenceDialogSection === "recent" ? (
                  <section className="writingReferenceGroup">
                    <div className="writingReferenceGroupLead">
                      <span>最近剧情</span>
                      <strong>{recentStoryStatus}</strong>
                      <p>只列出章节标题，正文仍留在章节管理中。</p>
                    </div>
                    {recentChapters.length ? (
                      recentChapters.map((chapter) => {
                        const isSelected = preparation.selectedIds.includes(chapter.id);
                        const isLocked = preparation.lockedIds.includes(chapter.id);
                        const chapterLabel = chapter.displayLabel ?? "章节";
                        const chapterTitle = chapter.title
                          .replace(chapterLabel, "")
                          .replace(/^[\s:：、，,。．\-—]+/, "")
                          .trim();
                        return (
                          <article className="writingReferenceEntry" key={chapter.id}>
                            <div>
                              <span>章节</span>
                              <strong>
                                {chapterLabel}
                                {chapterTitle ? ` · ${chapterTitle}` : ""}
                              </strong>
                              <p>{getRecentChapterPreview(chapter, project.chapterAnalyses ?? [])}</p>
                            </div>
                            <div className="writingReferenceEntryActions">
                              <button onClick={() => handleToggleWritingReference(chapter.id)} type="button">
                                {isSelected ? "本次参考" : "本章暂不处理"}
                              </button>
                              <button
                                aria-pressed={isLocked}
                                className={isLocked ? "active" : ""}
                                onClick={() => handleToggleWritingReferenceLocked(chapter.id)}
                                type="button"
                              >
                                {isLocked ? "必须参考" : "设为必须"}
                              </button>
                            </div>
                          </article>
                        );
                      })
                    ) : (
                      <p className="writingReferenceEmpty">先导入或创建章节正文，这里会自动准备最近剧情。</p>
                    )}
                  </section>
                ) : null}
                {writingReferenceDialogSection === "knowledge" ? (
                  <section className="writingReferenceGroup">
                    <div className="writingReferenceGroupLead">
                      <span>人物与设定</span>
                      <strong>{writingKnowledgeRecords.length} 条</strong>
                      <p>选出这次写作真正需要带上的人物、地点和规则。</p>
                    </div>
                    <section className="writingReferenceCharacterPicker" aria-label="下一章出场人物">
                      <div className="writingReferenceCharacterPickerLead">
                        <div>
                          <span>下一章想让谁登场？</span>
                          <small>选中的人物会作为这次写作的参考。</small>
                        </div>
                        <button
                          aria-expanded={isWritingReferenceCharacterPickerOpen}
                          onClick={() => setIsWritingReferenceCharacterPickerOpen((isOpen) => !isOpen)}
                          type="button"
                        >
                          {isWritingReferenceCharacterPickerOpen ? "收起" : "选择人物"}
                        </button>
                      </div>
                      {selectedNextChapterCharacters.length ? (
                        <div className="writingReferenceCharacterTags" aria-label="已选人物">
                          {selectedNextChapterCharacters.map((character) => (
                            <button
                              key={character.id}
                              onClick={() => handleToggleNextChapterCharacter(character.id)}
                              title={`移除 ${character.name}`}
                              type="button"
                            >
                              {character.name || "未命名人物"} ×
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {isWritingReferenceCharacterPickerOpen ? (
                        <div className="writingReferenceCharacterPickerBody">
                          <input
                            aria-label="搜索人物"
                            onChange={(event) => setWritingReferenceCharacterQuery(event.target.value)}
                            placeholder="搜索人物"
                            type="search"
                            value={writingReferenceCharacterQuery}
                          />
                          {characters.length ? (
                            <div className="writingReferenceCharacterOptions" role="listbox" aria-multiselectable="true">
                              {visibleWritingReferenceCharacters.length ? visibleWritingReferenceCharacters.map((character) => {
                                const isSelected = nextChapterCharacterIds.includes(character.id);
                                return (
                                  <button
                                    aria-pressed={isSelected}
                                    className={isSelected ? "active" : ""}
                                    key={character.id}
                                    onClick={() => handleToggleNextChapterCharacter(character.id)}
                                    role="option"
                                    type="button"
                                  >
                                    <span>{character.name || "未命名人物"}</span>
                                    <small>{isSelected ? "已选" : "加入本章"}</small>
                                  </button>
                                );
                              }) : <p className="writingReferenceEmpty">没有找到匹配人物。</p>}
                            </div>
                          ) : <p className="writingReferenceEmpty">先在人物管理中建立人物资料，再为下一章选择出场人物。</p>}
                        </div>
                      ) : null}
                    </section>
                    {writingKnowledgeRecords.length ? writingKnowledgeRecords.slice(0, 12).map((record) => {
                      const isSelected = preparation.selectedIds.includes(record.id);
                      const isLocked = preparation.lockedIds.includes(record.id);
                      return (
                        <article className="writingReferenceEntry" key={record.id}>
                          <div>
                            <span>{typeLabels[record.type]}</span>
                            <strong>{record.name}</strong>
                            <p>{record.summary || "暂无说明"}</p>
                          </div>
                          <div className="writingReferenceEntryActions">
                            <button onClick={() => handleToggleWritingReference(record.id)} type="button">
                              {isSelected ? "本次参考" : "本章暂不处理"}
                            </button>
                            <button
                              aria-pressed={isLocked}
                              className={isLocked ? "active" : ""}
                              onClick={() => handleToggleWritingReferenceLocked(record.id)}
                              type="button"
                            >
                              {isLocked ? "必须参考" : "设为必须"}
                            </button>
                          </div>
                        </article>
                      );
                    }) : <p className="writingReferenceEmpty">还没有额外的地点、物品或世界设定资料，可以先从创作资料开始整理。</p>}
                  </section>
                ) : null}
                {writingReferenceDialogSection === "foreshadowings" ? (
                  <section className="writingReferenceGroup">
                    <div className="writingReferenceGroupLead">
                      <span>伏笔线索</span>
                      <strong>{pendingForeshadowingCount ? `${pendingForeshadowingCount} 条待确认` : "暂无待确认"}</strong>
                      <p>决定这章要带上哪条线索，或先把它放在一边。</p>
                    </div>
                    {pendingForeshadowingCount ? foreshadowings
                      .filter((item) => item.status === "unresolved" || item.status === "inProgress")
                      .map((item) => {
                        const isSelected = preparation.selectedIds.includes(item.id);
                        const isLocked = preparation.lockedIds.includes(item.id);
                        return (
                          <article className="writingReferenceEntry" key={item.id}>
                            <div>
                              <span>{foreshadowingStatusLabels[item.status]}</span>
                              <strong>{item.title}</strong>
                              <p>{item.plan || item.summary || "尚未安排回收时机"}</p>
                            </div>
                            <div className="writingReferenceEntryActions">
                              <button onClick={() => handleToggleWritingReference(item.id)} type="button">
                                {isSelected ? "本章参考" : "本章暂不处理"}
                              </button>
                              <button
                                aria-pressed={isLocked}
                                className={isLocked ? "active" : ""}
                                onClick={() => handleToggleWritingReferenceLocked(item.id)}
                                type="button"
                              >
                                {isLocked ? "必须参考" : "设为必须"}
                              </button>
                            </div>
                          </article>
                        );
                      }) : <p className="writingReferenceEmpty">目前没有需要跟进的伏笔线索。</p>}
                  </section>
                ) : null}
                {writingReferenceDialogSection === "request" ? (
                  <form
                    className="writingReferenceRequestForm"
                    onSubmit={(event) => {
                      event.preventDefault();
                      handleSaveWritingReferenceRequest();
                    }}
                  >
                    <p>这些要求只服务于这一章，写完后也会留在你的作品里。</p>
                    {[
                      ["mustHappen", "本章必须发生什么", "例如：主角必须到达旧港口"],
                      ["mustAvoid", "本章不要发生什么", "例如：不要立刻揭晓幕后真相"],
                      ["atmosphere", "想要的氛围", "例如：潮湿、压迫、带一点希望"],
                      ["other", "其他临时要求", "任何希望写作时记住的事"],
                    ].map(([field, label, placeholder]) => (
                      <label key={field}>
                        <span>{label}</span>
                        <textarea
                          onChange={(event) =>
                            setWritingReferenceRequestDraft((draft) => ({
                              ...draft,
                              [field]: event.target.value,
                            }))
                          }
                          placeholder={placeholder}
                          value={writingReferenceRequestDraft[field as keyof typeof writingReferenceRequestDraft]}
                        />
                      </label>
                    ))}
                    <div className="todayWritingDialogFooter">
                      <span>这些要求不会自动改写你的故事。</span>
                      <button type="submit">保存我的要求</button>
                    </div>
                  </form>
                ) : null}
              </div>
            </section>
          </div>
        ) : null}
        {isAiSuggestionReviewDialogOpen ? (
          <div className="todayWritingModalBackdrop" role="presentation">
            <section
              aria-label="AI 建议待确认"
              aria-modal="true"
              className="todayWritingDialog aiSuggestionReviewDialog"
              role="dialog"
            >
              <div className="todayWritingDialogHeader">
                <div>
                  <span>写作资料审核</span>
                  <h2>AI 建议待确认</h2>
                </div>
                <button onClick={() => setIsAiSuggestionReviewDialogOpen(false)} type="button">
                  关闭
                </button>
              </div>
              <p className="todayWritingDialogHint">每条建议都要经过你的确认，才会进入作品资料库。</p>
              <div className="aiSuggestionReviewList">
                <div className="aiSuggestionCategoryCards" aria-label="建议资料类型">
                  {([
                    ["characters", "人物", ""],
                    ["clues", "线索", "按全书证据合并同一主题。"],
                  ] as const).map(([category, label, description]) => {
                    const categoryCount =
                      category === "clues"
                        ? aiSuggestionPool.filter(
                            (suggestion) =>
                              getAiSuggestionCategory(suggestion.type) === "clues" &&
                              suggestion.status === "pending" &&
                              getClueSuggestionTier(suggestion) === "priority",
                          ).length
                        : pendingAiSuggestions.filter(
                            (suggestion) => getAiSuggestionCategory(suggestion.type) === category,
                          ).length;
                    const categoryWatchCount =
                      category === "clues"
                        ? aiSuggestionPool.filter(
                            (suggestion) =>
                              getAiSuggestionCategory(suggestion.type) === "clues" &&
                              suggestion.status === "pending" &&
                              getClueSuggestionTier(suggestion) === "watch",
                          ).length
                        : 0;
                    return (
                      <button
                        aria-pressed={aiSuggestionReviewCategory === category}
                        className={`aiSuggestionCategoryCard ${
                          aiSuggestionReviewCategory === category ? "active" : ""
                        }`}
                        key={category}
                        onClick={() => {
                          setAiSuggestionReviewCategory(category);
                          setAiSuggestionReviewStatus(category === "clues" ? "priority" : "pending");
                          setSuggestionReviewPage(1);
                        }}
                        type="button"
                      >
                        <span>{label}</span>
                        <strong>
                          {category === "clues" ? `${categoryCount} 条优先确认` : `${categoryCount} 条待确认`}
                        </strong>
                        <small>
                          {category === "characters"
                            ? `本次发现 ${pendingNewCharacterCount} 个新人物 · ${pendingCharacterChangeCount} 处人物变化。`
                            : category === "clues"
                              ? categoryWatchCount
                                ? `${description} 另有 ${categoryWatchCount} 条继续观察。`
                                : description
                              : description}
                        </small>
                      </button>
                    );
                  })}
                </div>
                <div className="aiSuggestionReviewTabs" role="tablist" aria-label="建议状态筛选">
                  {(aiSuggestionReviewCategory === "clues"
                    ? [
                        ["priority", "优先确认", priorityClueSuggestions.length],
                        ["watch", "继续观察", watchClueSuggestions.length],
                        ["record", "解析记录", recordClueSuggestions.length],
                        ["later", "稍后处理", laterCategoryAiSuggestions.length],
                        ["resolved", "已处理", resolvedCategoryAiSuggestions.length],
                      ]
                    : [
                        ["pending", "待确认", pendingCategoryAiSuggestions.length],
                        ["later", "稍后处理", laterCategoryAiSuggestions.length],
                        ["resolved", "已处理", resolvedCategoryAiSuggestions.length],
                      ])
                    .map(([status, label, count]) => (
                    <button
                      aria-selected={aiSuggestionReviewStatus === status}
                      className={aiSuggestionReviewStatus === status ? "active" : ""}
                      key={status}
                      onClick={() => {
                        setAiSuggestionReviewStatus(status as AiSuggestionReviewStatus);
                        setSuggestionReviewPage(1);
                      }}
                      role="tab"
                      type="button"
                    >
                      {label} {count}
                    </button>
                  ))}
                </div>
                <section>
                  <div className="aiSuggestionReviewSectionHeading">
                    <span>{suggestionReviewHeadingLabel[aiSuggestionReviewStatus]}</span>
                    <strong>{reviewedAiSuggestions.length} 条</strong>
                    {aiSuggestionReviewCategory === "clues" ? (
                      <button
                        className="aiSuggestionRediagnoseButton"
                        disabled={isClueDiagnosisRunning}
                        onClick={() => void handleRunClueDiagnosis(true)}
                        type="button"
                      >
                        {isClueDiagnosisRunning ? "正在整理全书线索" : "重新整理线索"}
                      </button>
                    ) : null}
                    {isCharacterImportanceReview ? (
                      <button
                        className="aiSuggestionRediagnoseButton"
                        disabled={isCharacterAuditing}
                        onClick={() => void handleCharacterAudit(false)}
                        type="button"
                      >
                        {isCharacterAuditing ? "正在复核人物重要度…" : "复核人物重要度"}
                      </button>
                    ) : null}
                  </div>
                  {isCharacterImportanceReview ? (
                    <div className="aiSuggestionImportanceGroupCards" aria-label="人物重要度分级">
                      {characterImportanceGroups.map((group) => (
                        <details
                          aria-label={group.label}
                          className={`aiSuggestionImportanceGroupCard ${group.level}`}
                          open={group.level === "main" || (group.level === "important" && !characterImportanceGroups[0].suggestions.length)}
                          key={group.level}
                        >
                          <summary>
                            <span>{group.label}</span><strong>{group.suggestions.length} 条</strong>
                            <small>{group.level === "main" ? "优先核对主线与核心同伴" : group.level === "important" ? "保留影响剧情的重要人物" : "先收纳，按需提升"}{group.reviewCount ? ` · 需重点确认 ${group.reviewCount} 条` : ""}</small>
                          </summary>
                          <div className="aiSuggestionImportanceGroupContent">
                            {group.suggestions.map((suggestion) => (
                            <article className="aiSuggestionReviewCard" key={suggestion.id}>
                              <div className="aiSuggestionReviewCardLead"><span className={`workbenchStatus ${suggestionStatusTones[suggestion.status]}`}>{suggestionStatusLabels[suggestion.status]}</span><small>{suggestion.auditScore !== undefined ? `审核分 ${suggestion.auditScore}` : `${suggestion.importanceScore ?? 0} 分`}</small></div>
                              <div className="aiSuggestionCharacterTitle"><strong>{suggestion.title}</strong><button onClick={() => handleOpenCharacterSuggestionMerge(suggestion.id)} type="button">并入已有人物</button></div><p>{suggestion.detail}</p>
                              <div className="aiSuggestionReasonTags">{(suggestion.importanceReasons ?? []).map((reason) => <span key={`${suggestion.id}-${reason}`}>{reason}</span>)}</div>
                              <div className="aiSuggestionAuditBadges">
                                {suggestion.importanceOverride ? <span className="aiSuggestionManualBadge">已人工调整</span> : null}
                                {suggestion.auditNeedsHumanReview ? <span className="aiSuggestionHumanReviewBadge">人工重点确认</span> : null}
                              </div>
                              {suggestion.auditRiskFlags?.length ? <div className="aiSuggestionReasonTags" aria-label="人工确认原因">{suggestion.auditRiskFlags.map((flag) => characterAuditRiskLabels[flag] ? <span key={`${suggestion.id}-risk-${flag}`}>{characterAuditRiskLabels[flag]}</span> : null)}</div> : null}
                              {suggestion.auditReasons?.length ? <div className="aiSuggestionReasonTags" aria-label="独立复核依据">{suggestion.auditReasons.map((reason) => <span key={`${suggestion.id}-audit-${reason}`}>{reason}</span>)}</div> : null}
                              {suggestion.auditCounterEvidence?.length ? <p className="aiSuggestionAuditCounterEvidence">反向证据：{suggestion.auditCounterEvidence.join("；")}</p> : null}
                              {suggestion.auditNeedsHumanReview ? <p className="aiSuggestionAuditReview">人工重点确认</p> : null}
                              <div className="aiSuggestionReviewActions"><button onClick={() => handleReviewAiSuggestion(suggestion.id, "accepted")} type="button">确认加入</button><button onClick={() => handleSetAiSuggestionImportance(suggestion.id, group.level === "minor" ? "important" : group.level === "main" ? "important" : "main")} type="button">{group.level === "minor" ? "设为重要" : group.level === "main" ? "降为重要" : "设为主要"}</button><button onClick={() => handleReviewAiSuggestion(suggestion.id, "later")} type="button">稍后处理</button></div>
                            </article>
                            ))}
                          </div>
                        </details>
                      ))}
                    </div>
                  ) : aiSuggestionReviewPagination.items.map((suggestion) => (
                    <article className="aiSuggestionReviewCard" key={suggestion.id}>
                      <div className="aiSuggestionReviewCardLead">
                        <span className={`workbenchStatus ${suggestionStatusTones[suggestion.status]}`}>
                          {suggestionStatusLabels[suggestion.status]}
                        </span>
                        <small>{getAiSuggestionTypeLabel(suggestion.type)}</small>
                      </div>
                      <div className="aiSuggestionCharacterTitle"><strong>{suggestion.title}</strong>{(suggestion.type === "newCharacter" || suggestion.type === "characterUpdate") && suggestion.status === "pending" ? <button onClick={() => handleOpenCharacterSuggestionMerge(suggestion.id)} type="button">并入已有人物</button> : null}</div>
                      <p>{suggestion.detail}</p>
                      {suggestion.identityStatus === "ambiguous" ? (
                        <section className="aiSuggestionCharacterChanges" aria-label="人物身份待确认">
                          <span>人物身份待确认：该称呼可能指向多位现有人物</span>
                          <div className="aiSuggestionReviewActions">
                            {(suggestion.identityCandidateIds ?? []).map((characterId) => {
                              const candidate = projectCharactersForReview.find((character) => character.id === characterId);
                              return candidate ? (
                                <button
                                  key={`${suggestion.id}-${candidate.id}`}
                                  onClick={() => handleResolveAiSuggestionIdentity(suggestion.id, candidate.id)}
                                  type="button"
                                >
                                  归一到“{candidate.name}”
                                </button>
                              ) : null;
                            })}
                          </div>
                        </section>
                      ) : null}
                      {suggestion.clueDiagnosisReasons?.length ? (
                        <div className="aiSuggestionReasonTags" aria-label="线索优先级依据">
                          {suggestion.clueDiagnosisReasons.map((reason) => (
                            <span key={`${suggestion.id}-${reason}`}>{reason}</span>
                          ))}
                        </div>
                      ) : null}
                      {suggestion.characterChanges?.length ? (
                        <section className="aiSuggestionCharacterChanges" aria-label="本次人物资料变化">
                          <span>本次提炼的人物资料</span>
                          {suggestion.characterChanges.map((change) => {
                            const existingAttribute = projectCharactersForReview
                              .find((character) => character.name.trim() === suggestion.targetName?.trim())
                              ?.attributes.find((attribute) => attribute.title === change.title);
                            return (
                              <article key={`${suggestion.id}-${change.title}`}>
                                <div>
                                  <strong>{change.title}</strong>
                                  {suggestion.type === "characterUpdate" ? (
                                    <small>
                                      当前：{existingAttribute?.value || "资料尚未填写"}
                                      {existingAttribute?.locked ? "（已保护）" : ""}
                                    </small>
                                  ) : null}
                                </div>
                                <p>建议：{change.value}</p>
                                <em>依据：{change.evidence || suggestion.source}</em>
                              </article>
                            );
                          })}
                        </section>
                      ) : null}
                      {suggestion.sources && suggestion.sources.length > 1 ? (
                        <details className="aiSuggestionSourceDetails">
                          <summary>{suggestion.source}</summary>
                          {suggestion.sources.map((source) => (
                            <p key={source.chapterId}>
                              <strong>{source.chapterTitle}</strong>
                              {source.detail}
                            </p>
                          ))}
                        </details>
                      ) : (
                        <em>{suggestion.source}</em>
                      )}
                      {aiSuggestionReviewStatus !== "resolved" ? (
                        <div className="aiSuggestionReviewActions">
                          <button
                            onClick={() => handleReviewAiSuggestion(suggestion.id, "accepted")}
                            type="button"
                          >
                            {suggestion.type === "characterUpdate" ? "确认同步" : "确认加入"}
                          </button>
                          {aiSuggestionReviewStatus === "pending" ? (
                            <button
                              onClick={() => handleReviewAiSuggestion(suggestion.id, "later")}
                              type="button"
                            >
                              稍后处理
                            </button>
                          ) : null}
                          <button
                            onClick={() => handleReviewAiSuggestion(suggestion.id, "ignored")}
                            type="button"
                          >
                            忽略
                          </button>
                        </div>
                      ) : null}
                    </article>
                  ))}
                  {!(isCharacterImportanceReview ? pendingCategoryAiSuggestions.length : aiSuggestionReviewPagination.items.length) ? (
                    <p className="workbenchSuggestionEmpty">这个分组暂时没有建议。</p>
                  ) : null}
                </section>
                {!isCharacterImportanceReview && aiSuggestionReviewPagination.totalPages > 1 ? (
                  <nav className="aiSuggestionReviewPagination" aria-label="建议分页">
                    <button
                      disabled={aiSuggestionReviewPagination.page === 1}
                      onClick={() => setSuggestionReviewPage(aiSuggestionReviewPagination.page - 1)}
                      type="button"
                    >
                      上一页
                    </button>
                    <div className="aiSuggestionReviewPageNumbers" aria-label="页码选择">
                      {aiSuggestionReviewPageNumbers.map((page, index) =>
                        page === "ellipsis" ? (
                          <span aria-hidden="true" key={`ellipsis-${index}`}>…</span>
                        ) : (
                          <button
                            aria-current={page === aiSuggestionReviewPagination.page ? "page" : undefined}
                            className={page === aiSuggestionReviewPagination.page ? "active" : ""}
                            key={page}
                            onClick={() => setSuggestionReviewPage(page)}
                            type="button"
                          >
                            {page}
                          </button>
                        ),
                      )}
                    </div>
                    <label className="aiSuggestionReviewPageJump">
                      <span>跳至</span>
                      <input
                        aria-label="跳转页码"
                        inputMode="numeric"
                        min={1}
                        onChange={(event) => setAiSuggestionReviewPageDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            setSuggestionReviewPage(Number(aiSuggestionReviewPageDraft));
                          }
                        }}
                        type="number"
                        value={aiSuggestionReviewPageDraft}
                      />
                      <button
                        onClick={() => setSuggestionReviewPage(Number(aiSuggestionReviewPageDraft))}
                        type="button"
                      >
                        页
                      </button>
                    </label>
                    <span className="aiSuggestionReviewPageStatus">
                      第 {aiSuggestionReviewPagination.page} / {aiSuggestionReviewPagination.totalPages} 页
                    </span>
                    <button
                      disabled={aiSuggestionReviewPagination.page === aiSuggestionReviewPagination.totalPages}
                      onClick={() => setSuggestionReviewPage(aiSuggestionReviewPagination.page + 1)}
                      type="button"
                    >
                      下一页
                    </button>
                  </nav>
                ) : null}
              </div>
            </section>
          </div>
        ) : null}
        {characterSuggestionMergeDialog && characterSuggestionMergeSuggestion ? (
          <div className="todayWritingModalBackdrop" role="presentation">
            <section aria-label="并入已有人物" aria-modal="true" className="todayWritingDialog characterSuggestionMergeDialog" role="dialog">
              <div className="todayWritingDialogHeader">
                <div><span>人物资料合并</span><h2>并入已有人物</h2></div>
                <button onClick={() => setCharacterSuggestionMergeDialog(null)} type="button">关闭</button>
              </div>
              <p className="todayWritingDialogHint">“{characterSuggestionMergeSuggestion.targetName ?? characterSuggestionMergeSuggestion.title}”会作为别名保留，目标人物的标准姓名不会改变。</p>
              <label className="fieldGroup">
                <span>选择目标人物</span>
                <input
                  onChange={(event) => setCharacterSuggestionMergeDialog((draft) => draft ? { ...draft, query: event.target.value } : draft)}
                  placeholder="搜索已确认人物"
                  value={characterSuggestionMergeDialog.query}
                />
                <select
                  onChange={(event) => setCharacterSuggestionMergeDialog((draft) => draft ? { ...draft, targetCharacterId: event.target.value, choices: {} } : draft)}
                  value={characterSuggestionMergeDialog.targetCharacterId}
                >
                  <option value="">请选择目标人物</option>
                  {(project.characters ?? [])
                    .filter((character) => character.name.includes(characterSuggestionMergeDialog.query.trim()))
                    .map((character) => <option key={character.id} value={character.id}>{character.name} · {character.attributes.length} 项资料</option>)}
                </select>
              </label>
              {characterSuggestionMergeTarget ? (
                <div className="characterSuggestionMergeFields">
                  <article className="characterSuggestionMergeRow">
                    <strong>标准姓名</strong><span>{characterSuggestionMergeSuggestion.targetName ?? characterSuggestionMergeSuggestion.title}</span><span>{characterSuggestionMergeTarget.name}</span><em>保留目标人物；当前名称将加入别名</em>
                  </article>
                  {characterSuggestionMergeFields.map((change) => {
                    const targetAttribute = characterSuggestionMergeTarget.attributes.find((attribute) => attribute.title === change.title);
                    const currentChoice = characterSuggestionMergeDialog.choices[change.title];
                    const defaultSource = targetAttribute ? "target" : "suggestion";
                    const source = currentChoice?.source ?? defaultSource;
                    return (
                      <article className="characterSuggestionMergeRow" key={change.title}>
                        <strong>{change.title}{targetAttribute?.locked ? "（已锁定）" : ""}</strong>
                        <span>当前建议：{change.value || "未提供"}</span>
                        <span>目标人物：{targetAttribute?.value || "未填写"}</span>
                        <label className="characterSuggestionMergeChoice"><span>合并结果</span><select onChange={(event) => setCharacterSuggestionMergeDialog((draft) => draft ? { ...draft, choices: { ...draft.choices, [change.title]: { field: change.title, source: event.target.value as CharacterSuggestionMergeChoice["source"], value: event.target.value === "custom" ? (draft.choices[change.title]?.value ?? change.value) : undefined } } } : draft)} value={source}><option value="suggestion">保留当前建议</option><option value="target">保留目标人物</option><option value="custom">自定义</option></select></label>
                        {source === "custom" ? <input aria-label={`${change.title}自定义值`} onChange={(event) => setCharacterSuggestionMergeDialog((draft) => draft ? { ...draft, choices: { ...draft.choices, [change.title]: { field: change.title, source: "custom", value: event.target.value } } } : draft)} value={currentChoice?.value ?? change.value} /> : null}
                      </article>
                    );
                  })}
                </div>
              ) : null}
              <div className="todayWritingDialogFooter"><span>相同字段会按你的选择合并，章节证据和原建议会保留。</span><button disabled={!characterSuggestionMergeTarget} onClick={handleConfirmCharacterSuggestionMerge} type="button">确认并入</button></div>
            </section>
          </div>
        ) : null}
        {isWorldSynopsisDialogOpen ? (
          <div className="worldSynopsisModalBackdrop" role="presentation">
            <form
              aria-label="编辑小说简介"
              className="worldSynopsisModal"
              onSubmit={(event) => {
                event.preventDefault();
                handleSaveWorldSynopsis();
              }}
            >
              <div className="worldSynopsisModalHeader">
                <strong>编辑简介</strong>
                <button
                  onClick={() => setIsWorldSynopsisDialogOpen(false)}
                  type="button"
                >
                  关闭
                </button>
              </div>
              <label className="worldSynopsisField">
                <span>简介</span>
                <textarea
                  maxLength={80}
                  onChange={(event) => setWorldSynopsisDraft(event.target.value.slice(0, 80))}
                  value={worldSynopsisDraft}
                />
                <span className="worldSynopsisCounter">{worldSynopsisDraft.length}/80</span>
              </label>
              <button className="worldSynopsisSubmit" type="submit">
                完成
              </button>
            </form>
          </div>
        ) : null}
      </main>
    );
  }

  if (view === "aiContinuation") {
    const lengthOptions: Array<{
      value: AiContinuationLength;
      title: string;
      hint: string;
    }> = [
      { value: 1000, title: "续写1000字", hint: "适合短段落，把已有想法转成正文。" },
      { value: 3000, title: "续写3000字", hint: "适合接近一章长度的剧情推进。" },
      { value: 10000, title: "续写10000字", hint: "适合长段剧情脉络、伏笔和人物高光。" },
    ];
    const chapterAnalysisStats = getChapterAnalysisStats(project);
    const chapterAnalyses = [...(project.chapterAnalyses ?? [])].sort(
      (left, right) => left.chapterIndex - right.chapterIndex,
    );
    const chapterAnalysisProgressState = getChapterAnalysisProgressState(project, {
      isRunning: isChapterAnalysisRunning,
      progress: chapterAnalysisProgress,
    });
    const isFullChapterAnalysisComplete = chapterAnalysisProgressState.state === "complete";
    const countAnalysisClues = (analysis: ChapterAnalysis) =>
      (analysis.clues?.mentions.length ?? 0) ||
      analysis.foreshadowings.setups.length +
        analysis.foreshadowings.payoffs.length +
        analysis.foreshadowings.updates.length;
    const matchedAnalysisCharacters = getMatchedAnalysisCharacters(chapterAnalyses);
    const candidateAnalysisCharacters = getCandidateAnalysisCharacters(chapterAnalyses);
    const analysisClueGroups = getAnalysisClueGroups(chapterAnalyses);
    const aiAnalysisCharacterRows =
      aiAnalysisCharacterDialog === "matched"
        ? matchedAnalysisCharacters
        : aiAnalysisCharacterDialog === "candidate"
          ? candidateAnalysisCharacters
          : analysisClueGroups;
    const aiAnalysisCharacterDialogTitle =
      aiAnalysisCharacterDialog === "matched"
        ? "命中人物"
        : aiAnalysisCharacterDialog === "candidate"
          ? "候选人物"
          : "线索总览";
    const aiAnalysisCharacterDialogDescription =
      aiAnalysisCharacterDialog === "matched"
        ? "以下人物已在章节解析中命中，可先勾选查看，后续会开放同步到人物管理。"
        : aiAnalysisCharacterDialog === "candidate"
          ? "以下人物是模型从正文中识别出的候选项，可先勾选查看，后续会开放同步到人物管理。"
          : "以下线索按名称归纳了它们在不同章节里的提及情况，可先勾选查看，后续会开放同步到重要伏笔。";
    const aiAnalysisSyncLabel =
      aiAnalysisCharacterDialog === "candidateClue"
        ? "选择并同步到重要伏笔"
        : "选择并同步到人物管理";
    const aiFeatureTabs: Array<{ mode: "continuation" | "analysis"; label: string }> = [
      { mode: "continuation", label: "AI续写" },
      { mode: "analysis", label: "AI解析" },
    ];

    return (
      <main className="worldConsole aiContinuationConsole">
        <div className="worldConsoleGrid" aria-hidden="true" />
        <header className="worldConsoleHeader">
          <strong>Air to World</strong>
          <button onClick={() => setView("workspace")} type="button">
            返回
          </button>
        </header>

        <section className="aiContinuationStage" aria-label="AI功能">
          <aside className="aiFeatureSideNav">
            {aiFeatureTabs.map((tab) => (
              <button
                className={aiFeatureMode === tab.mode ? "active" : ""}
                key={tab.mode}
                onClick={() => setAiFeatureMode(tab.mode)}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </aside>

          <section className="aiFeaturePanel">
          <div className="aiContinuationSide">
            <div>
              <span>{aiFeatureMode === "continuation" ? "AI续写" : "AI解析"}</span>
              <strong>
                {aiFeatureMode === "continuation"
                  ? aiContinuationStatus
                  : isFullChapterAnalysisComplete
                    ? "报告已生成"
                    : "等待深度解析"}
              </strong>
            </div>
            <div className="aiProgressTrack" aria-label="AI功能进度">
              <span
                style={{
                  width:
                    aiFeatureMode === "continuation"
                      ? `${aiContinuationProgress}%`
                      : `${chapterAnalysisProgressState.progress}%`,
                }}
              />
            </div>
            <small>
              {aiFeatureMode === "continuation"
                ? `${aiContinuationProgress}%`
                : `${chapterAnalysisStats.analyzedChapters}/${chapterAnalysisStats.totalChapters} 章`}
            </small>
            <div className="aiContinuationStats">
              <span>正文：{project.manuscript?.chapters.length ?? 0} 章</span>
              <span>人物：{characters.length}</span>
              <span>伏笔：{foreshadowings.length}</span>
              {aiFeatureMode === "analysis" ? (
                <span>
                  候选：
                  {chapterAnalysisStats.candidateCharacters +
                    chapterAnalysisStats.candidateClues}
                </span>
              ) : null}
              {aiFeatureMode === "analysis" ? (
                <button
                  className="aiAnalysisStartButton"
                  disabled={isChapterAnalysisRunning || !project.manuscript?.chapters.length}
                  onClick={() => handleStartChapterAnalysis("fast")}
                  type="button"
                >
                  快速解析全书
                </button>
              ) : null}
              {aiFeatureMode === "analysis" && chapterAnalyses.length ? (
                <button
                  className="aiAnalysisClearButton"
                  onClick={handleClearChapterAnalyses}
                  type="button"
                >
                  清空解析
                </button>
              ) : null}
            </div>
          </div>

          {aiFeatureMode === "continuation" ? (
            <div className="aiContinuationWorkspace">

          {aiContinuationHomeHint ? (
            <p className="aiContinuationHomeHint">{aiContinuationHomeHint}</p>
          ) : null}

          <section className="aiContinuationMain">
            <div className="aiContinuationToolbar">
              {lengthOptions.map((option) => (
                <button
                  className={aiContinuationLength === option.value ? "active" : ""}
                  key={option.value}
                  onClick={() => setAiContinuationLength(option.value)}
                  type="button"
                >
                  <strong>{option.title}</strong>
                  <span>{option.hint}</span>
                </button>
              ))}
            </div>

            <label className="aiContinuationPrompt">
              <span>本次续写要求</span>
              <textarea
                onChange={(event) => setAiContinuationInstruction(event.target.value)}
                placeholder="例如：让旧钟楼伏笔推进一步，突出主角的判断力，不要立刻揭晓幕后黑手。"
                rows={4}
                value={aiContinuationInstruction}
              />
            </label>

            {aiContinuationLength === 10000 ? (
              <section className="aiCreativePanel" aria-label="长篇续写意图">
                <label>
                  <span>需要回收的伏笔</span>
                  <input
                    onChange={(event) =>
                      setAiCreativeAnswers((current) => ({
                        ...current,
                        foreshadowingToPayoff: event.target.value,
                      }))
                    }
                    placeholder="可以不填"
                    value={aiCreativeAnswers.foreshadowingToPayoff}
                  />
                </label>
                <label>
                  <span>新增铺垫或钩子</span>
                  <input
                    onChange={(event) =>
                      setAiCreativeAnswers((current) => ({
                        ...current,
                        newHooks: event.target.value,
                      }))
                    }
                    placeholder="可以不填"
                    value={aiCreativeAnswers.newHooks}
                  />
                </label>
                <label>
                  <span>人物高光</span>
                  <input
                    onChange={(event) =>
                      setAiCreativeAnswers((current) => ({
                        ...current,
                        characterHighlights: event.target.value,
                      }))
                    }
                    placeholder="例如：让林照完成一次关键判断"
                    value={aiCreativeAnswers.characterHighlights}
                  />
                </label>
                <label>
                  <span>必须发生 / 禁止发生</span>
                  <input
                    onChange={(event) =>
                      setAiCreativeAnswers((current) => ({
                        ...current,
                        mustHaveOrAvoid: event.target.value,
                      }))
                    }
                    placeholder="可以不填"
                    value={aiCreativeAnswers.mustHaveOrAvoid}
                  />
                </label>
                <label className="aiCreativeToggle">
                  <input
                    checked={aiCreativeAnswers.needDirectionOptions}
                    onChange={(event) =>
                      setAiCreativeAnswers((current) => ({
                        ...current,
                        needDirectionOptions: event.target.checked,
                      }))
                    }
                    type="checkbox"
                  />
                  <span>让 AI 内部先规划多个续写方向</span>
                </label>
              </section>
            ) : null}

            <div className="aiContinuationActions">
              <div className="aiContinuationStrategyButtons" aria-label="选择续写方式">
                {continuationStrategies.map((strategy) => {
                  const estimate = estimateContinuationStrategy(strategy.id, aiContinuationLength);
                  return (
                    <div className="aiContinuationStrategy" key={strategy.id}>
                      <button
                        aria-label={`${strategy.label}：${strategy.tooltip}`}
                        data-tooltip={strategy.tooltip}
                        disabled={isAiContinuationRunning}
                        onClick={() => void handleStartAiContinuation(strategy.id)}
                        type="button"
                      >
                        <strong>{strategy.label}</strong>
                        <small>方案 {strategy.variant}</small>
                      </button>
                      <span>预计 ¥{estimate.costCny.toFixed(3)} · 约 {estimate.waitSeconds} 秒</span>
                    </div>
                  );
                })}
              </div>
              <button
                disabled={!isAiContinuationRunning}
                onClick={handleStopAiContinuation}
                type="button"
              >
                停止
              </button>
              {aiContinuationError ? <span>{aiContinuationError}</span> : null}
            </div>

            <section className="aiContinuationOutput" aria-label="AI续写正文">
              {aiContinuationOutput ? (
                <pre>{aiContinuationOutput}</pre>
              ) : (
                <div className="aiContinuationEmpty">
                  选择一种续写方式，正文会流式显示在这里。
                </div>
              )}
            </section>
          </section>

          <aside className="aiContinuationResult">
            <section>
              <strong>保存正文</strong>
              <button onClick={handleCopyAiContinuation} type="button">
                复制
              </button>
              <button onClick={handleAppendAiContinuationToLastChapter} type="button">
                保存到最后一章末尾
              </button>
              <label>
                <span>下一章标题</span>
                <input
                  onChange={(event) => setAiNextChapterTitle(event.target.value)}
                  placeholder="例如：第三章 钟声之后"
                  value={aiNextChapterTitle}
                />
              </label>
              <button onClick={handleSaveAiContinuationAsNextChapter} type="button">
                保存为下一章
              </button>
            </section>

            <section>
              <strong>资料命中</strong>
              {aiContinuationReport ? (
                <div className="aiReportList">
                  <span>使用资料：{aiContinuationReport.usedMaterials.join("、") || "无"}</span>
                  <span>人物：{aiContinuationReport.characterHits.length}</span>
                  <span>大纲：{aiContinuationReport.outlineHits.length}</span>
                  <span>伏笔：{aiContinuationReport.foreshadowingHits.length}</span>
                  {aiContinuationReport.warnings.map((warning) => (
                    <em key={warning}>{warning}</em>
                  ))}
                </div>
              ) : (
                <p>生成完成后显示本次使用的正文、人物、大纲和伏笔资料。</p>
              )}
            </section>

            <section className="aiContinuationGrounding">
              <strong>本次依据</strong>
              {aiContinuationReport ? (
                <>
                  <span>
                    {aiContinuationReport.grounding.mode === "grounded" ? "资料充分" : "保守续写"}
                    · 覆盖分 {aiContinuationReport.grounding.score}
                  </span>
                  {aiContinuationReport.grounding.gaps.map((gap) => <em key={gap}>{gap}</em>)}
                  <details>
                    <summary>查看参考来源（{aiContinuationReport.sourcePreview.length}）</summary>
                    {aiContinuationReport.sourcePreview.map((source) => (
                      <p key={`${source.kind}-${source.sourceId}`}>{source.label}：{source.summary}</p>
                    ))}
                  </details>
                </>
              ) : <p>生成前会检查近期正文、锁定设定和检索证据。</p>}
            </section>

            <section className="aiContinuationCheck">
              <div className="aiContinuationCheckHeader">
                <strong>一致性检查</strong>
                <button
                  disabled={!aiContinuationOutput.trim() || isAiContinuationChecking}
                  onClick={() => void handleCheckAiContinuation(true)}
                  type="button"
                >
                  {isAiContinuationChecking ? "检查中" : "重新检查"}
                </button>
              </div>
              {aiContinuationCheckError ? <em>{aiContinuationCheckError}</em> : null}
              {aiContinuationConsistencyReport ? (
                aiContinuationConsistencyReport.findings.length ? (
                  <div className="aiContinuationRiskList">
                    {aiContinuationConsistencyReport.findings.map((finding) => (
                      <article className={`continuationRisk${finding.severity[0].toUpperCase()}${finding.severity.slice(1)}`} key={finding.id}>
                        <strong>{finding.severity === "high" ? "人工重点确认" : finding.severity === "medium" ? "建议核对" : "轻度提醒"}</strong>
                        <span>{finding.message}</span>
                        <small>依据：{finding.evidence}</small>
                      </article>
                    ))}
                  </div>
                ) : <p>未发现可核对的设定矛盾。</p>
              ) : <p>生成完成后自动检查；你也可以手动重新检查。</p>}
            </section>

            {aiContinuationRunId ? (
              <section className="continuationFeedback">
                <strong>这次续写是否可用？</strong>
                <div>
                  <button
                    className={aiContinuationFeedback?.decision === "adopted" ? "active" : ""}
                    onClick={() => handleContinuationFeedback("adopted")}
                    type="button"
                  >直接采用</button>
                  <button
                    className={aiContinuationFeedback?.decision === "edited" ? "active" : ""}
                    onClick={() => handleContinuationFeedback("edited")}
                    type="button"
                  >修改后采用</button>
                  <button
                    className={aiContinuationFeedback?.decision === "rejected" ? "active rejected" : ""}
                    onClick={() => handleContinuationFeedback("rejected")}
                    type="button"
                  >不采用</button>
                </div>
                {aiContinuationFeedback?.decision === "rejected" ? (
                  <div className="continuationFeedbackReason">
                    <span>不采用原因（可选）</span>
                    {([
                      ["constraint", "设定冲突"], ["plot", "剧情不符"], ["style", "文风不符"],
                      ["information", "信息错误"], ["pacing", "节奏问题"], ["other", "其他"],
                    ] as const).map(([value, label]) => (
                      <button
                        className={aiContinuationFeedbackReason === value ? "active" : ""}
                        key={value}
                        onClick={() => {
                          setAiContinuationFeedbackReason(value);
                          handleContinuationFeedback("rejected", value);
                        }}
                        type="button"
                      >{label}</button>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}
          </aside>
            </div>
          ) : (
            <section className="aiAnalysisPanel" aria-label="AI解析报告">
              {aiAnalysisHomeHint ? (
                <p className="aiContinuationHomeHint">{aiAnalysisHomeHint}</p>
              ) : null}
              {isFullChapterAnalysisComplete ? (
                <>
                  <div className="aiAnalysisMetrics">
                    <article>
                      <span>已解析章节</span>
                      <strong>{chapterAnalysisStats.analyzedChapters}</strong>
                    </article>
                    <button
                      className="aiAnalysisMetricButton"
                      onClick={() => handleOpenAiAnalysisCharacterDialog("matched")}
                      type="button"
                    >
                      <span>命中人物</span>
                      <strong>{matchedAnalysisCharacters.length}</strong>
                    </button>
                    <button
                      className="aiAnalysisMetricButton"
                      onClick={() => handleOpenAiAnalysisCharacterDialog("candidate")}
                      type="button"
                    >
                      <span>候选人物</span>
                      <strong>{chapterAnalysisStats.candidateCharacters}</strong>
                    </button>
                    <button
                      className="aiAnalysisMetricButton"
                      onClick={() => handleOpenAiAnalysisCharacterDialog("candidateClue")}
                      type="button"
                    >
                      <span>线索总览</span>
                      <strong>{analysisClueGroups.length}</strong>
                    </button>
                  </div>
                  <div className="aiAnalysisChapterList">
                    {chapterAnalyses.map((analysis) => {
                      const mode = analysis.parseMode ?? "structured";
                      const clueCount = countAnalysisClues(analysis);
                      const displayCharacters = analysis.characters
                        .map((character) => character.name)
                        .filter(Boolean)
                        .slice(0, 5);
                      const displayEvents = analysis.plot.mainEvents.slice(0, 3);
                      const displayClues = getAnalysisClueRows(analysis);

                      return (
                        <article className="aiAnalysisChapterCard" key={analysis.chapterId}>
                          <header>
                            <div>
                              <span>第 {analysis.chapterIndex + 1} 章</span>
                              <strong>{analysis.chapterTitle}</strong>
                            </div>
                            <div className="aiAnalysisTags">
                              <span>
                                {mode === "structured"
                                  ? "结构化"
                                  : mode === "repaired"
                                    ? "已修复"
                                    : "降级摘要"}
                              </span>
                              <span>{analysis.wordCount} 字</span>
                              <span>线索 {clueCount}</span>
                            </div>
                          </header>
                          <p>{analysis.summary.short || analysis.summary.detailed || "暂无摘要"}</p>
                          <div className="aiAnalysisDetailGrid">
                            <section>
                              <h2>剧情</h2>
                              {displayEvents.length ? (
                                displayEvents.map((event) => (
                                  <small key={`${analysis.chapterId}-${event.title}`}>
                                    {event.title}：{event.summary}
                                  </small>
                                ))
                              ) : (
                                <small>暂无主要事件</small>
                              )}
                            </section>
                            <section>
                              <h2>人物</h2>
                              <small>{displayCharacters.join("、") || "暂无人物记录"}</small>
                            </section>
                            <section>
                              <h2>线索</h2>
                              {displayClues.length ? (
                                <div className="aiAnalysisForeshadowingRows">
                                  {displayClues.map((row) => (
                                    <div
                                      className={
                                        selectedAiAnalysisForeshadowingKey === row.key
                                          ? "aiAnalysisForeshadowingRow active"
                                          : "aiAnalysisForeshadowingRow"
                                      }
                                      key={row.key}
                                    >
                                      <label>
                                        <input
                                          checked={selectedAiAnalysisForeshadowingKey === row.key}
                                          name={`analysis-foreshadowing-${analysis.chapterId}`}
                                          onChange={() => setSelectedAiAnalysisForeshadowingKey(row.key)}
                                          type="radio"
                                        />
                                        <span>
                                          <strong>{row.label}</strong>
                                          <small>{row.detail || "暂无证据说明"}</small>
                                        </span>
                                      </label>
                                      <div className="aiAnalysisForeshadowingActions">
                                        <button
                                          aria-label={`编辑${row.label}`}
                                          className="aiAnalysisForeshadowingEditButton"
                                          onClick={() =>
                                            handleOpenAiAnalysisForeshadowingEdit(
                                              analysis.chapterId,
                                              row.index,
                                              row.label,
                                              row.detail,
                                            )
                                          }
                                          type="button"
                                        >
                                          <EditIcon />
                                        </button>
                                        <button
                                          aria-label={`删除${row.label}`}
                                          onClick={() =>
                                            handleDeleteAiAnalysisForeshadowing(
                                              analysis.chapterId,
                                              row.index,
                                            )
                                          }
                                          type="button"
                                        >
                                          <DeleteIcon />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <small>暂无线索记录</small>
                              )}
                            </section>
                            <section>
                              <h2>续写建议</h2>
                              <small>
                                {analysis.continuationHints.nextLeads.slice(0, 3).join("、") ||
                                  analysis.craft.chapterHook ||
                                  "暂无后续引导"}
                              </small>
                            </section>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="aiAnalysisEmpty">
                  请在章纲管理-我的小说-深度解析内完成对整本小说的AI深度解析，完成后可查看报告
                </div>
              )}
            </section>
          )}
          </section>
        </section>
        {aiAnalysisCharacterDialog ? (
          <div className="modalBackdrop authBackdrop" role="presentation">
            <section
              aria-label={`${aiAnalysisCharacterDialogTitle}清单`}
              className="recordDialog authDialog worldDialog aiAnalysisCharacterDialog"
            >
              <div className="recordDialogHeader">
                <div>
                  <span>AI解析</span>
                  <strong>{aiAnalysisCharacterDialogTitle}</strong>
                </div>
                <button onClick={handleCloseAiAnalysisCharacterDialog} type="button">
                  关闭
                </button>
              </div>
              <p>{aiAnalysisCharacterDialogDescription}</p>
              <div className="aiAnalysisCharacterList">
                {aiAnalysisCharacterRows.length ? (
                  aiAnalysisCharacterRows.map((row) => (
                    <label className="aiAnalysisCharacterRow" key={row.name}>
                      <input
                        checked={selectedAiAnalysisCharacterNames.includes(row.name)}
                        onChange={() => handleToggleAiAnalysisCharacter(row.name)}
                        type="checkbox"
                      />
                      <span>
                        <strong>{row.name}</strong>
                        <small>
                          {row.count} 次｜{row.chapters.slice(0, 4).join("、")}
                          {row.confidence !== undefined
                            ? `｜置信度 ${Math.round(row.confidence * 100)}%`
                            : ""}
                        </small>
                        {row.detail ? <em>{row.detail}</em> : null}
                      </span>
                    </label>
                  ))
                ) : (
                  <div className="aiAnalysisCharacterEmpty">
                    {aiAnalysisCharacterDialog === "candidateClue" ? "暂无线索记录" : "暂无人物记录"}
                  </div>
                )}
              </div>
              <div className="aiAnalysisDialogActions">
                <span>已选择 {selectedAiAnalysisCharacterNames.length} 个</span>
                <button disabled title="后续开放" type="button">
                  {aiAnalysisSyncLabel}
                </button>
              </div>
            </section>
          </div>
        ) : null}
        {aiAnalysisForeshadowingEditDraft ? (
          <div className="modalBackdrop authBackdrop" role="presentation">
            <section
              aria-label="编辑AI解析线索"
              className="recordDialog authDialog worldDialog aiAnalysisForeshadowingEditDialog"
            >
              <div className="recordDialogHeader">
                <div>
                  <span>AI解析</span>
                  <strong>编辑线索</strong>
                </div>
                <button onClick={() => setAiAnalysisForeshadowingEditDraft(null)} type="button">
                  关闭
                </button>
              </div>
              <label className="fieldGroup">
                <span>标题</span>
                <input
                  onChange={(event) =>
                    setAiAnalysisForeshadowingEditDraft((currentDraft) =>
                      currentDraft ? { ...currentDraft, title: event.target.value } : currentDraft,
                    )
                  }
                  value={aiAnalysisForeshadowingEditDraft.title}
                />
              </label>
              <label className="fieldGroup">
                <span>说明 / 证据</span>
                <textarea
                  onChange={(event) =>
                    setAiAnalysisForeshadowingEditDraft((currentDraft) =>
                      currentDraft ? { ...currentDraft, detail: event.target.value } : currentDraft,
                    )
                  }
                  rows={6}
                  value={aiAnalysisForeshadowingEditDraft.detail}
                />
              </label>
              <div className="dialogFooter">
                <button onClick={() => setAiAnalysisForeshadowingEditDraft(null)} type="button">
                  取消
                </button>
                <button onClick={handleSaveAiAnalysisForeshadowingEdit} type="button">
                  完成编辑
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </main>
    );
  }

  if (view === "clues") {
    const activeClueBoard = selectedClueBoard;
    const activeClueNode = selectedClueNode;
    const visibleClueNodes = activeClueBoard ? getVisibleClueNodes(activeClueBoard) : [];
    const visibleClueNodeIds = new Set(visibleClueNodes.map((node) => node.id));
    const clueNodeConnections =
      activeClueBoard?.nodes.flatMap((node) => {
        if (!node.parentId || !visibleClueNodeIds.has(node.id)) {
          return [];
        }

        const parent = activeClueBoard.nodes.find((item) => item.id === node.parentId);
        if (!parent || !visibleClueNodeIds.has(parent.id)) {
          return [];
        }

        const controlOffset = Math.max(8, Math.abs(node.x - parent.x) * 0.45);
        return [
          {
            id: `${parent.id}-${node.id}`,
            d: `M ${parent.x} ${parent.y} C ${parent.x + controlOffset} ${parent.y}, ${
              node.x - controlOffset
            } ${node.y}, ${node.x} ${node.y}`,
          },
        ];
      }) ?? [];
    const clueRelationConnections =
      activeClueBoard?.relations?.flatMap((relation) => {
        const fromNode = activeClueBoard.nodes.find((node) => node.id === relation.fromNodeId);
        const toNode = activeClueBoard.nodes.find((node) => node.id === relation.toNodeId);

        if (
          !fromNode ||
          !toNode ||
          !visibleClueNodeIds.has(fromNode.id) ||
          !visibleClueNodeIds.has(toNode.id)
        ) {
          return [];
        }

        return [
          {
            ...relation,
            d: `M ${fromNode.x} ${fromNode.y} L ${toNode.x} ${toNode.y}`,
            labelX: (fromNode.x + toNode.x) / 2,
            labelY: (fromNode.y + toNode.y) / 2,
          },
        ];
      }) ?? [];
    const clueSummaryRanges =
      activeClueBoard?.summaries?.flatMap((summary) => {
        const summaryNodes = summary.nodeIds
          .map((nodeId) => activeClueBoard.nodes.find((node) => node.id === nodeId))
          .filter((node): node is ClueNode => {
            if (!node) {
              return false;
            }
            return visibleClueNodeIds.has(node.id);
          });

        if (!summaryNodes.length) {
          return [];
        }

        const minX = Math.min(...summaryNodes.map((node) => node.x));
        const maxX = Math.max(...summaryNodes.map((node) => node.x));
        const minY = Math.min(...summaryNodes.map((node) => node.y));
        const maxY = Math.max(...summaryNodes.map((node) => node.y));
        const left = Math.max(2, minX - 10);
        const top = Math.max(2, minY - 10);
        const right = Math.min(98, maxX + 10);
        const bottom = Math.min(98, maxY + 10);

        return [
          {
            ...summary,
            left,
            top,
            width: Math.max(14, right - left),
            height: Math.max(10, bottom - top),
            labelX: Math.min(92, right + 1),
            labelY: top,
          },
        ];
      }) ?? [];
    const editingClueRelation = clueRelationConnections.find(
      (relation) => relation.id === editingClueRelationId,
    );
    const clueBoardManagerDialogTitle =
      clueBoardManagerDialog?.mode === "create"
        ? "新建导图命名"
        : clueBoardManagerDialog?.mode === "open"
          ? "请选择要打开的导图"
          : clueBoardManagerDialog?.mode === "delete"
            ? "请选择要删除的导图"
            : clueBoardManagerDialog?.mode === "rename"
              ? "重命名导图"
              : "";
    const clueBoardManagerSubmitLabel =
      clueBoardManagerDialog?.mode === "open"
        ? "打开"
        : clueBoardManagerDialog?.mode === "delete"
          ? "删除"
          : "确认";
    const clueBoardManagerSelectedId =
      clueBoardManagerDialog && clueBoardManagerDialog.mode !== "create"
        ? clueBoardManagerDialog.selectedBoardId
        : "";
    const activeRelationshipGraph = selectedRelationshipGraph;
    const activeRelationshipNode = selectedRelationshipNode;
    const activeRelationshipCharacter = activeRelationshipNode
      ? characters.find((character) => character.id === activeRelationshipNode.characterId)
      : undefined;
    const relationshipCharacterQueryValue = relationshipCharacterQuery.trim().toLowerCase();
    const relationshipNodeCharacterIds = new Set(
      activeRelationshipGraph?.nodes.map((node) => node.characterId) ?? [],
    );
    const relationshipCharacterOptions = characters.filter((character) => {
      if (relationshipNodeCharacterIds.has(character.id)) {
        return false;
      }
      if (!relationshipCharacterQueryValue) {
        return true;
      }
      return character.name.toLowerCase().includes(relationshipCharacterQueryValue);
    });
    const relationshipConnections =
      activeRelationshipGraph?.relations?.flatMap((relation) => {
        const fromNode = activeRelationshipGraph.nodes.find((node) => node.id === relation.fromNodeId);
        const toNode = activeRelationshipGraph.nodes.find((node) => node.id === relation.toNodeId);
        if (!fromNode || !toNode) {
          return [];
        }

        return [
          {
            ...relation,
            d: `M ${fromNode.x} ${fromNode.y} L ${toNode.x} ${toNode.y}`,
            labelX: (fromNode.x + toNode.x) / 2,
            labelY: (fromNode.y + toNode.y) / 2,
          },
        ];
      }) ?? [];
    const editingRelationshipLine = relationshipConnections.find(
      (relation) => relation.id === editingRelationshipLineId,
    );
    const relationshipGraphManagerDialogTitle =
      relationshipGraphManagerDialog?.mode === "create"
        ? "新建关系图命名"
        : relationshipGraphManagerDialog?.mode === "open"
          ? "请选择要打开的关系图"
          : relationshipGraphManagerDialog?.mode === "delete"
            ? "请选择要删除的关系图"
            : relationshipGraphManagerDialog?.mode === "rename"
              ? "重命名关系图"
              : "";
    const relationshipGraphManagerSubmitLabel =
      relationshipGraphManagerDialog?.mode === "open"
        ? "打开"
        : relationshipGraphManagerDialog?.mode === "delete"
          ? "删除"
          : "确认";
    const relationshipGraphManagerSelectedId =
      relationshipGraphManagerDialog && relationshipGraphManagerDialog.mode !== "create"
        ? relationshipGraphManagerDialog.selectedGraphId
        : "";
    const foreshadowingChapterOptions =
      project.manuscript?.chapters.map((chapter, chapterIndex) => ({
        id: chapter.id,
        label: `${chapter.displayLabel ?? `第${chapterIndex + 1}章`} ${chapter.title}`,
      })) ?? [];
    const foreshadowingCharacterOptions = characters.map((character) => ({
      id: character.id,
      label: character.name,
    }));
    const filterOption = (query: string) => (option: { label: string }) =>
      option.label.toLowerCase().includes(query.trim().toLowerCase());
    const setupChapterOptions = foreshadowingChapterOptions.filter(
      filterOption(foreshadowingSetupChapterQuery),
    );
    const payoffChapterOptions = foreshadowingChapterOptions.filter(
      filterOption(foreshadowingPayoffChapterQuery),
    );
    const foreshadowingDialogCharacterOptions = foreshadowingCharacterOptions.filter(
      filterOption(foreshadowingCharacterQuery),
    );
    const getForeshadowingChapterLabel = (chapterId: string) =>
      foreshadowingChapterOptions.find((chapter) => chapter.id === chapterId)?.label ?? chapterId;
    const getForeshadowingCharacterLabel = (characterId: string) =>
      foreshadowingCharacterOptions.find((character) => character.id === characterId)?.label ??
      characterId;

    const renderClueTitle = (node: ClueNode) => {
      const mentions = extractCharacterMentions(node.title, characters);
      if (!mentions.length) {
        return node.title;
      }

      const segments: ReactNode[] = [];
      let cursor = 0;

      mentions.forEach((mention) => {
        if (mention.start > cursor) {
          segments.push(node.title.slice(cursor, mention.start));
        }
        segments.push(
          <button
            className="clueMentionToken"
            key={`${node.id}-${mention.start}-${mention.characterId}`}
            onClick={(event) => {
              event.stopPropagation();
              setClueMentionCharacterId(mention.characterId);
            }}
            type="button"
          >
            {mention.text}
          </button>,
        );
        cursor = mention.end;
      });

      if (cursor < node.title.length) {
        segments.push(node.title.slice(cursor));
      }

      return segments;
    };

    return (
      <main className="worldConsole clueConsole">
        <div className="worldConsoleGrid" aria-hidden="true" />
        <header className="worldConsoleHeader">
          <strong>Air to World</strong>
          <button onClick={handleLeaveClues} type="button">
            返回
          </button>
        </header>

        <section className="clueConsoleStage" aria-label="线索管理">
          <aside className="clueBoardListPanel">
            <div className="cluePanelHeader">
              <span>线索管理</span>
              <small>{isClueDraftDirty ? "未保存" : "已同步"}</small>
            </div>

            <div className="clueSectionNav" aria-label="线索管理分区">
              {[
                ["mindMap", "思维导图"],
                ["relationships", "人物关系"],
                ["foreshadowing", "重要伏笔"],
              ].map(([section, label]) => (
                <button
                  className={clueSection === section ? "active" : ""}
                  key={section}
                  onClick={() => setClueSection(section as ClueSection)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
          </aside>

          <section className="clueCanvasShell">
            <div className="clueCanvasHeader">
              {clueSection === "mindMap" ? (
                <div className="clueMindToolbar">
                  <div className="clueBoardManager">
                    <button
                      aria-expanded={isClueBoardManagerMenuOpen}
                      className="clueBoardManagerButton"
                      onClick={() => setIsClueBoardManagerMenuOpen((isOpen) => !isOpen)}
                      type="button"
                    >
                      管理导图
                      <span aria-hidden="true" />
                    </button>
                    {isClueBoardManagerMenuOpen ? (
                      <div className="clueBoardManagerMenu" role="menu">
                        <button
                          onClick={() => handleOpenClueBoardManagerDialog("create")}
                          role="menuitem"
                          type="button"
                        >
                          新增导图
                        </button>
                        <button
                          disabled={!clueBoards.length}
                          onClick={() => handleOpenClueBoardManagerDialog("open")}
                          role="menuitem"
                          type="button"
                        >
                          打开导图
                        </button>
                        <button
                          disabled={!clueBoards.length}
                          onClick={() => handleOpenClueBoardManagerDialog("delete")}
                          role="menuitem"
                          type="button"
                        >
                          删除导图
                        </button>
                        <button
                          disabled={!clueBoards.length}
                          onClick={() => handleOpenClueBoardManagerDialog("rename")}
                          role="menuitem"
                          type="button"
                        >
                          重命名导图
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <div className="clueMindIconTools">
                    <button
                      className="clueIconTool theme"
                      disabled={!activeClueBoard}
                      onClick={() => handleAddClueNode("sibling")}
                      type="button"
                    >
                      <span aria-hidden="true" />
                      <b>主题</b>
                    </button>
                    <button
                      className="clueIconTool child"
                      disabled={!activeClueBoard}
                      onClick={() => handleAddClueNode("child")}
                      type="button"
                    >
                      <span aria-hidden="true" />
                      <b>子主题</b>
                    </button>
                    <button
                      className="clueIconTool free"
                      disabled={!activeClueBoard}
                      onClick={() => handleAddClueNode("free")}
                      type="button"
                    >
                      <span aria-hidden="true" />
                      <b>自由节点</b>
                    </button>
                    <button
                      className="clueIconTool relation"
                      disabled={!activeClueNode}
                      onClick={() => activeClueNode && handleStartClueRelation(activeClueNode.id, "single")}
                      type="button"
                    >
                      <span aria-hidden="true" />
                      <b>联系</b>
                    </button>
                    <button
                      className="clueIconTool summary"
                      disabled={!activeClueNode}
                      onClick={handleAddClueSummary}
                      type="button"
                    >
                      <span aria-hidden="true" />
                      <b>概要</b>
                    </button>
                  </div>
                </div>
              ) : clueSection === "relationships" ? (
                <div className="clueMindToolbar relationshipToolbar">
                  <div className="clueBoardManager">
                    <button
                      aria-expanded={isRelationshipGraphManagerMenuOpen}
                      className="clueBoardManagerButton"
                      onClick={() => setIsRelationshipGraphManagerMenuOpen((isOpen) => !isOpen)}
                      type="button"
                    >
                      管理关系图
                      <span aria-hidden="true" />
                    </button>
                    {isRelationshipGraphManagerMenuOpen ? (
                      <div className="clueBoardManagerMenu" role="menu">
                        <button
                          onClick={() => handleOpenRelationshipGraphManagerDialog("create")}
                          role="menuitem"
                          type="button"
                        >
                          新增关系图
                        </button>
                        <button
                          disabled={!relationshipGraphs.length}
                          onClick={() => handleOpenRelationshipGraphManagerDialog("open")}
                          role="menuitem"
                          type="button"
                        >
                          打开关系图
                        </button>
                        <button
                          disabled={!relationshipGraphs.length}
                          onClick={() => handleOpenRelationshipGraphManagerDialog("delete")}
                          role="menuitem"
                          type="button"
                        >
                          删除关系图
                        </button>
                        <button
                          disabled={!relationshipGraphs.length}
                          onClick={() => handleOpenRelationshipGraphManagerDialog("rename")}
                          role="menuitem"
                          type="button"
                        >
                          重命名关系图
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <div className="clueMindIconTools relationshipIconTools">
                    <button
                      className="clueIconTool addCharacter"
                      disabled={!activeRelationshipGraph}
                      onClick={() => setIsRelationshipCharacterPickerOpen(true)}
                      type="button"
                    >
                      <span aria-hidden="true" />
                      <b>添加人物</b>
                    </button>
                    <button
                      className="clueIconTool singleArrow"
                      disabled={!activeRelationshipNode}
                      onClick={() => handleStartRelationshipLine("single")}
                      type="button"
                    >
                      <span aria-hidden="true" />
                      <b>单箭头</b>
                    </button>
                    <button
                      className="clueIconTool doubleArrow"
                      disabled={!activeRelationshipNode}
                      onClick={() => handleStartRelationshipLine("double")}
                      type="button"
                    >
                      <span aria-hidden="true" />
                      <b>双箭头</b>
                    </button>
                    <button
                      className="clueIconTool deleteLine"
                      disabled={!editingRelationshipLineId}
                      onClick={() => editingRelationshipLineId && handleDeleteRelationshipLine(editingRelationshipLineId)}
                      type="button"
                    >
                      <DeleteIcon />
                      <b>删除关系</b>
                    </button>
                    <button className="clueIconTool summary" disabled={!activeRelationshipNode} type="button">
                      <span aria-hidden="true" />
                      <b>概要</b>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="foreshadowingToolbar">
                  <button onClick={handleOpenAddForeshadowingDialog} type="button">
                    新增伏笔
                  </button>
                  <label>
                    筛选
                    <select
                      onChange={(event) =>
                        setForeshadowingStatusFilter(event.target.value as ForeshadowingStatusFilter)
                      }
                      value={foreshadowingStatusFilter}
                    >
                      <option value="all">全部</option>
                      {foreshadowingStatusOptions.map((status) => (
                        <option key={status} value={status}>
                          {foreshadowingStatusLabels[status]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <input
                    aria-label="搜索伏笔"
                    onChange={(event) => setForeshadowingSearchQuery(event.target.value)}
                    placeholder="搜索伏笔"
                    value={foreshadowingSearchQuery}
                  />
                  <div className="foreshadowingStats" aria-label="伏笔状态统计">
                    <span>未回收 {foreshadowingStats.unresolved}</span>
                    <span>回收中 {foreshadowingStats.inProgress}</span>
                    <span>已回收 {foreshadowingStats.resolved}</span>
                  </div>
                </div>
              )}
              <div className="clueCanvasActions">
                <button onClick={handleSaveClueBoards} type="button">
                  保存
                </button>
                {clueSection === "relationships" ? (
                  isRelationshipDraftDirty ? (
                    <strong>未保存修改</strong>
                  ) : (
                    <strong>{activeRelationshipGraph?.nodes.length ?? 0} 人物</strong>
                  )
                ) : clueSection === "foreshadowing" ? (
                  isForeshadowingDraftDirty ? (
                    <strong>未保存修改</strong>
                  ) : (
                    <strong>{foreshadowings.length} 伏笔</strong>
                  )
                ) : isMindMapDraftDirty ? (
                  <strong>未保存修改</strong>
                ) : (
                  <strong>{activeClueBoard?.nodes.length ?? 0} 节点</strong>
                )}
              </div>
            </div>

            {clueSection === "foreshadowing" ? (
              <div className="foreshadowingLedger">
                <div className="foreshadowingLedgerHead">
                  <span>状态</span>
                  <span>伏笔</span>
                  <span>埋设章节</span>
                  <span>回收章节</span>
                  <span>关联人物</span>
                  <span>更新时间</span>
                  <span>操作</span>
                </div>
                {filteredForeshadowings.length ? (
                  filteredForeshadowings.map((item) => (
                    <article className="foreshadowingRow" key={item.id}>
                      <span className={`foreshadowingStatus ${item.status}`}>
                        {foreshadowingStatusLabels[item.status]}
                      </span>
                      <button
                        className="foreshadowingTitleCell"
                        onClick={() => handleOpenEditForeshadowingDialog(item)}
                        type="button"
                      >
                        <strong>{item.title}</strong>
                        <small>{item.summary || item.plan || "暂无说明"}</small>
                      </button>
                      <span>{item.setupChapterIds.length} 章</span>
                      <span>{item.payoffChapterIds.length} 章</span>
                      <span>
                        {item.characterIds.length
                          ? item.characterIds.map(getForeshadowingCharacterLabel).join(" / ")
                          : "未关联"}
                      </span>
                      <span>{item.updatedAt.slice(5, 10)}</span>
                      <div className="foreshadowingRowActions">
                        <button onClick={() => handleOpenEditForeshadowingDialog(item)} type="button">
                          编辑
                        </button>
                        <button
                          aria-label={`删除伏笔 ${item.title}`}
                          onClick={() => handleDeleteForeshadowingItem(item.id)}
                          type="button"
                        >
                          <DeleteIcon />
                        </button>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="foreshadowingEmpty">
                    <strong>重要伏笔</strong>
                    <p>点击新增伏笔，记录第一次埋设和后续回收计划。</p>
                  </div>
                )}
              </div>
            ) : clueSection === "mindMap" ? (
              <>
                <div
                  className="clueNodeQuickEdit"
                  aria-label="当前节点编辑"
                >
                  {activeClueBoard ? (
                    <label className="clueCurrentBoardField">
                      当前导图
                      <input aria-label="当前导图" readOnly value={activeClueBoard.title} />
                    </label>
                  ) : null}
                  {activeClueNode ? (
                    <>
                      <label>
                        当前节点
                        <input
                          onChange={(event) =>
                            handleUpdateClueNode(activeClueNode.id, { title: event.target.value })
                          }
                          value={activeClueNode.title}
                        />
                      </label>
                      <label>
                        简介
                        <input
                          onChange={(event) =>
                            handleUpdateClueNode(activeClueNode.id, { detail: event.target.value })
                          }
                          placeholder="记录这条线索的证据、疑点或用途"
                          value={activeClueNode.detail}
                        />
                      </label>
                    </>
                  ) : (
                    <span>选择一个节点后可编辑标题和简介。</span>
                  )}
                </div>

            <div
              className="clueCanvasFrame"
              onClick={() => setClueContextMenu(null)}
              onContextMenu={handleClueCanvasContextMenu}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleClueCanvasDrop}
              ref={clueCanvasRef}
            >
              {activeClueBoard ? (
                <div
                  className="clueMindMapViewport"
                  style={{
                    height: `${activeClueBoard.zoom}%`,
                    width: `${activeClueBoard.zoom}%`,
                  }}
                >
                  <div
                    className="clueMindMap"
                    style={{
                      height: `${10000 / activeClueBoard.zoom}%`,
                      transform: `scale(${activeClueBoard.zoom / 100})`,
                      width: `${10000 / activeClueBoard.zoom}%`,
                    }}
                  >
                    <svg
                      aria-label="线索关系"
                      className="clueConnectionLayer"
                      height="100%"
                      preserveAspectRatio="none"
                      viewBox="0 0 100 100"
                      width="100%"
                    >
                      <defs>
                        <marker
                          id="clueRelationArrowEnd"
                          markerHeight="6"
                          markerWidth="7"
                          orient="auto"
                          refX="6"
                          refY="3"
                          viewBox="0 0 7 6"
                        >
                          <path className="clueRelationMarker" d="M 0 0 L 7 3 L 0 6 z" />
                        </marker>
                        <marker
                          id="clueRelationArrowStart"
                          markerHeight="6"
                          markerWidth="7"
                          orient="auto-start-reverse"
                          refX="1"
                          refY="3"
                          viewBox="0 0 7 6"
                        >
                          <path className="clueRelationMarker" d="M 7 0 L 0 3 L 7 6 z" />
                        </marker>
                      </defs>
                      {clueNodeConnections.map((connection) => (
                        <path className="clueTreePath" d={connection.d} key={connection.id} />
                      ))}
                      {clueRelationConnections.map((relation) => (
                        <path
                          className={`clueRelationPath ${relation.kind}`}
                          d={relation.d}
                          key={relation.id}
                          markerEnd="url(#clueRelationArrowEnd)"
                          markerStart={relation.kind === "double" ? "url(#clueRelationArrowStart)" : undefined}
                          onDoubleClick={(event) => {
                            event.stopPropagation();
                            setEditingClueRelationId(relation.id);
                            setClueRelationLabelDraft(relation.label);
                          }}
                        />
                      ))}
                    </svg>

                    {clueRelationConnections.map((relation) => (
                      <button
                        className="clueRelationLabel"
                        key={`${relation.id}-label`}
                        onClick={(event) => event.stopPropagation()}
                        onDoubleClick={(event) => {
                          event.stopPropagation();
                          setEditingClueRelationId(relation.id);
                          setClueRelationLabelDraft(relation.label);
                        }}
                        style={{
                          left: `${relation.labelX}%`,
                          top: `${relation.labelY}%`,
                        }}
                        type="button"
                      >
                        {relation.label || (relation.kind === "double" ? "双向关系" : "关系")}
                      </button>
                    ))}

                    {editingClueRelation ? (
                      <form
                        className="clueRelationEditor"
                        onClick={(event) => event.stopPropagation()}
                        onSubmit={(event) => {
                          event.preventDefault();
                          handleUpdateClueRelationLabel(editingClueRelation.id);
                        }}
                        style={{
                          left: `${editingClueRelation.labelX}%`,
                          top: `${editingClueRelation.labelY}%`,
                        }}
                      >
                        <label>
                          关系备注
                          <input
                            autoFocus
                            onChange={(event) => setClueRelationLabelDraft(event.target.value)}
                            placeholder="例如：同盟、敌对、互相隐瞒"
                            value={clueRelationLabelDraft}
                          />
                        </label>
                        <div>
                          <button type="submit">保存</button>
                          <button
                            aria-label="删除线"
                            onClick={() => handleDeleteClueRelation(editingClueRelation.id)}
                            type="button"
                          >
                            <DeleteIcon />
                          </button>
                          <button
                            onClick={() => {
                              setEditingClueRelationId("");
                              setClueRelationLabelDraft("");
                            }}
                            type="button"
                          >
                            取消
                          </button>
                        </div>
                      </form>
                    ) : null}

                    {clueSummaryRanges.map((summary) => (
                      <div
                        className="clueSummaryRange"
                        key={summary.id}
                        style={{
                          height: `${summary.height}%`,
                          left: `${summary.left}%`,
                          top: `${summary.top}%`,
                          width: `${summary.width}%`,
                        }}
                      >
                        <button
                          className="clueSummaryLabel"
                          onDoubleClick={(event) => {
                            event.stopPropagation();
                            setEditingClueSummaryId(summary.id);
                            setClueSummaryTextDraft(summary.text);
                          }}
                          style={{
                            left: `${summary.width}%`,
                            top: 0,
                          }}
                          type="button"
                        >
                          {summary.text}
                        </button>
                      </div>
                    ))}

                    {clueSummaryRanges.map((summary) =>
                      editingClueSummaryId === summary.id ? (
                        <form
                          className="clueSummaryEditor"
                          key={`${summary.id}-editor`}
                          onClick={(event) => event.stopPropagation()}
                          onSubmit={(event) => {
                            event.preventDefault();
                            handleUpdateClueSummaryText(summary.id);
                          }}
                          style={{
                            left: `${summary.labelX}%`,
                            top: `${summary.labelY}%`,
                          }}
                        >
                          <label>
                            概要
                            <input
                              autoFocus
                              onChange={(event) => setClueSummaryTextDraft(event.target.value)}
                              value={clueSummaryTextDraft}
                            />
                          </label>
                          <div>
                            <button type="submit">保存</button>
                            <button
                              aria-label="删除概要"
                              onClick={() => handleDeleteClueSummary(summary.id)}
                              type="button"
                            >
                              <DeleteIcon />
                            </button>
                            <button
                              onClick={() => {
                                setEditingClueSummaryId("");
                                setClueSummaryTextDraft("");
                              }}
                              type="button"
                            >
                              取消
                            </button>
                          </div>
                        </form>
                      ) : null,
                    )}

                    {visibleClueNodes.map((node) => {
                      const isSelected = node.id === activeClueBoard.selectedNodeId;
                      const isEditing = editingClueNodeId === node.id;
                      const childCount = activeClueBoard.nodes.filter((child) => child.parentId === node.id).length;
                      const isRelationSource = clueRelationDraft?.sourceNodeId === node.id;

                      return (
                        <article
                          className={`clueNode ${isSelected ? "selected" : ""} ${
                            node.parentId ? "" : "root"
                          } ${node.collapsed ? "collapsed" : ""} ${
                            isRelationSource ? "relationSource" : ""
                          }`}
                          draggable
                          key={node.id}
                          onClick={() => handleSelectClueNode(node.id)}
                          onContextMenu={(event) => handleClueNodeContextMenu(event, node.id)}
                          onDragEnd={() => {
                            setClueLinkDragNodeId("");
                          }}
                          onDragOver={handleClueNodeDragOver}
                          onDragStart={(event) => {
                            event.dataTransfer.setData("application/x-clue-node-id", node.id);
                          }}
                          onDrop={(event) => handleClueNodeDrop(event, node.id)}
                          style={{
                            left: `${node.x}%`,
                            top: `${node.y}%`,
                          } as React.CSSProperties}
                        >
                          {isEditing ? (
                            <input
                              autoFocus
                              onBlur={() => setEditingClueNodeId("")}
                              onChange={(event) =>
                                handleUpdateClueNode(node.id, { title: event.target.value })
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  setEditingClueNodeId("");
                                }
                                if (event.key === "Escape") {
                                  setEditingClueNodeId("");
                                }
                              }}
                              value={node.title}
                            />
                          ) : (
                            <button
                              className="clueNodeTitle"
                              onDoubleClick={() => setEditingClueNodeId(node.id)}
                              type="button"
                            >
                              {renderClueTitle(node)}
                            </button>
                          )}
                          {node.detail ? <p>{node.detail}</p> : null}
                          {node.tags?.length ? (
                            <div className="clueNodeTags">
                              {node.tags.map((tag) => (
                                <span key={tag}>{tag}</span>
                              ))}
                            </div>
                          ) : null}
                          {childCount ? (
                            <button
                              aria-label={node.collapsed ? "展开子主题" : "折叠子主题"}
                              className="clueFoldButton"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleToggleClueNodeCollapsed(node.id);
                              }}
                              type="button"
                            >
                              {node.collapsed ? `+${childCount}` : "-"}
                            </button>
                          ) : null}
                          {["top", "right", "bottom", "left"].map((position) => (
                            <span
                              aria-hidden="true"
                              className={`clueLinkHandle ${position} ${
                                clueLinkDragNodeId === node.id ? "dragging" : ""
                              }`}
                              draggable
                              key={position}
                              onDragEnd={() => {
                                setClueLinkDragNodeId("");
                                setClueRelationDraft(null);
                              }}
                              onDragStart={(event) => {
                                event.stopPropagation();
                                event.dataTransfer.effectAllowed = "link";
                                if (clueRelationDraft?.sourceNodeId === node.id) {
                                  event.dataTransfer.setData("application/x-clue-relation-node-id", node.id);
                                  event.dataTransfer.setData("application/x-clue-relation-kind", clueRelationDraft.kind);
                                } else {
                                  event.dataTransfer.setData("application/x-clue-link-node-id", node.id);
                                }
                                setClueLinkDragNodeId(node.id);
                              }}
                            />
                          ))}
                        </article>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="clueCanvasEmpty">点击新增导图，创建你的第一张导图</div>
              )}

              {clueMentionCharacter ? (
                <aside className="clueCharacterPopover">
                  <button
                    aria-label="关闭人物浮窗"
                    onClick={() => setClueMentionCharacterId("")}
                    type="button"
                  >
                    ×
                  </button>
                  <div className="clueCharacterPortrait">
                    {clueMentionCharacter.portrait ? (
                      <img
                        alt={clueMentionCharacter.portrait.name}
                        src={clueMentionCharacter.portrait.url}
                      />
                    ) : (
                      <span>{clueMentionCharacter.name.slice(0, 1)}</span>
                    )}
                  </div>
                  <strong>{clueMentionCharacter.name}</strong>
                  <small>{clueMentionCharacter.gender || "性别未设定"}</small>
                  <p>{clueMentionCharacter.catchphrase || "还没有口头禅。"}</p>
                  {clueMentionCharacter.attributes.slice(0, 3).map((attribute) => (
                    <div className="clueCharacterAttribute" key={attribute.id}>
                      <span>{attribute.title}</span>
                      <em>{attribute.value || "未填写"}</em>
                    </div>
                  ))}
                </aside>
              ) : null}

              {clueContextMenu ? (
                <div
                  className="clueContextMenu"
                  onClick={(event) => event.stopPropagation()}
                  style={{
                    left: clueContextMenu.menuX,
                    top: clueContextMenu.menuY,
                  }}
                >
                  {clueContextMenu.kind === "canvas" ? (
                    <button
                      onClick={() =>
                        handleCreateClueNodeAt(clueContextMenu.mapX, clueContextMenu.mapY)
                      }
                      type="button"
                    >
                      在此新建节点
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => handleStartClueRelation(clueContextMenu.nodeId, "single")}
                        type="button"
                      >
                        关联节点：单箭头
                      </button>
                      <button
                        onClick={() => handleStartClueRelation(clueContextMenu.nodeId, "double")}
                        type="button"
                      >
                        关联节点：双箭头
                      </button>
                      <button
                        onClick={() => handleToggleClueNodeCollapsed(clueContextMenu.nodeId)}
                        type="button"
                      >
                        折叠/展开子主题
                      </button>
                      <button
                        onClick={() => handleDeleteClueNodeOnly(clueContextMenu.nodeId)}
                        type="button"
                      >
                        删除该节点
                      </button>
                      <button
                        className="danger"
                        onClick={() => handleDeleteClueNodeSubtree(clueContextMenu.nodeId)}
                        type="button"
                      >
                        删除该节点及全部子节点
                      </button>
                    </>
                  )}
                </div>
              ) : null}

              <div className="clueCanvasZoomDock" aria-label="思维导图缩放">
                <button disabled={!activeClueBoard} onClick={() => handleAdjustClueZoom(-10)} type="button">
                  -
                </button>
                <strong>{activeClueBoard?.zoom ?? 100}%</strong>
                <button disabled={!activeClueBoard} onClick={() => handleAdjustClueZoom(10)} type="button">
                  +
                </button>
              </div>
            </div>
              </>
            ) : (
              <>
                <div className="clueNodeQuickEdit relationshipQuickEdit" aria-label="当前人物关系编辑">
                  {activeRelationshipGraph ? (
                    <label className="clueCurrentBoardField">
                      当前关系图
                      <input aria-label="当前关系图" readOnly value={activeRelationshipGraph.title} />
                    </label>
                  ) : null}
                  {activeRelationshipCharacter ? (
                    <>
                      <label>
                        当前人物
                        <input readOnly value={activeRelationshipCharacter.name} />
                      </label>
                      <label>
                        简介
                        <input
                          readOnly
                          value={
                            activeRelationshipCharacter.attributes.find(
                              (attribute) => attribute.kind === "summary",
                            )?.value ||
                            activeRelationshipCharacter.catchphrase ||
                            "人物档案中暂未填写简介"
                          }
                        />
                      </label>
                    </>
                  ) : (
                    <span>新建关系图后，点击添加人物开始绘制人物关系。</span>
                  )}
                </div>

                <div
                  className="relationshipCanvasFrame"
                  onClick={() => {
                    setRelationshipContextMenu(null);
                    setIsRelationshipGraphManagerMenuOpen(false);
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={handleRelationshipCanvasDrop}
                >
                  {activeRelationshipGraph ? (
                    <>
                      <svg
                        aria-label="人物关系线"
                        className="relationshipConnectionLayer"
                        height="100%"
                        preserveAspectRatio="none"
                        viewBox="0 0 100 100"
                        width="100%"
                      >
                        <defs>
                          <marker
                            id="relationshipArrowEnd"
                            markerHeight="6"
                            markerWidth="7"
                            orient="auto"
                            refX="6"
                            refY="3"
                            viewBox="0 0 7 6"
                          >
                            <path className="relationshipMarker" d="M 0 0 L 7 3 L 0 6 z" />
                          </marker>
                          <marker
                            id="relationshipArrowStart"
                            markerHeight="6"
                            markerWidth="7"
                            orient="auto-start-reverse"
                            refX="1"
                            refY="3"
                            viewBox="0 0 7 6"
                          >
                            <path className="relationshipMarker" d="M 7 0 L 0 3 L 7 6 z" />
                          </marker>
                        </defs>
                        {relationshipConnections.map((relation) => (
                          <path
                            className={`relationshipPath ${relation.direction}`}
                            d={relation.d}
                            key={relation.id}
                            markerEnd="url(#relationshipArrowEnd)"
                            markerStart={relation.direction === "double" ? "url(#relationshipArrowStart)" : undefined}
                            onClick={(event) => {
                              event.stopPropagation();
                              setEditingRelationshipLineId(relation.id);
                              setRelationshipLineLabelDraft(relation.label);
                            }}
                          />
                        ))}
                      </svg>

                      {relationshipConnections.map((relation) => (
                        <button
                          className="relationshipLabel"
                          key={`${relation.id}-label`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setEditingRelationshipLineId(relation.id);
                            setRelationshipLineLabelDraft(relation.label);
                          }}
                          style={{
                            left: `${relation.labelX}%`,
                            top: `${relation.labelY}%`,
                          }}
                          type="button"
                        >
                          {relation.label || (relation.direction === "double" ? "互相关联" : "关系")}
                        </button>
                      ))}

                      {editingRelationshipLine ? (
                        <form
                          className="relationshipLineEditor"
                          onClick={(event) => event.stopPropagation()}
                          onSubmit={(event) => {
                            event.preventDefault();
                            handleUpdateRelationshipLineLabel(editingRelationshipLine.id);
                          }}
                          style={{
                            left: `${editingRelationshipLine.labelX}%`,
                            top: `${editingRelationshipLine.labelY}%`,
                          }}
                        >
                          <label>
                            关系
                            <input
                              autoFocus
                              onChange={(event) => setRelationshipLineLabelDraft(event.target.value)}
                              placeholder="例如：盟友、对手、长辈"
                              value={relationshipLineLabelDraft}
                            />
                          </label>
                          <div>
                            <button type="submit">保存</button>
                            <button
                              aria-label="删除关系线"
                              onClick={() => handleDeleteRelationshipLine(editingRelationshipLine.id)}
                              type="button"
                            >
                              <DeleteIcon />
                            </button>
                            <button
                              onClick={() => {
                                setEditingRelationshipLineId("");
                                setRelationshipLineLabelDraft("");
                              }}
                              type="button"
                            >
                              取消
                            </button>
                          </div>
                        </form>
                      ) : null}

                      {activeRelationshipGraph.nodes.map((node) => {
                        const character = characters.find((item) => item.id === node.characterId);
                        const isSelected = node.id === activeRelationshipGraph.selectedNodeId;
                        const isLineSource = relationshipLineDraft?.sourceNodeId === node.id;

                        return (
                          <article
                            className={`relationshipCharacterNode ${isSelected ? "selected" : ""} ${
                              isLineSource ? "lineSource" : ""
                            }`}
                            draggable
                            key={node.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (relationshipLineDraft && relationshipLineDraft.sourceNodeId !== node.id) {
                                handleFinishRelationshipLine(node.id);
                                return;
                              }
                              handleSelectRelationshipNode(node.id);
                            }}
                            onContextMenu={(event) => handleRelationshipNodeContextMenu(event, node.id)}
                            onDragStart={(event) => {
                              event.dataTransfer.setData("application/x-relationship-node-id", node.id);
                            }}
                            style={{
                              left: `${node.x}%`,
                              top: `${node.y}%`,
                            }}
                          >
                            <div className="relationshipAvatar">
                              {character?.portrait ? (
                                <img alt={character.portrait.name} src={character.portrait.url} />
                              ) : (
                                <span>{(character?.name ?? "?").slice(0, 1)}</span>
                              )}
                            </div>
                            <strong>{character?.name ?? "未知人物"}</strong>
                          </article>
                        );
                      })}

                      {relationshipContextMenu ? (
                        <div
                          className="relationshipContextMenu"
                          onClick={(event) => event.stopPropagation()}
                          style={{
                            left: relationshipContextMenu.menuX,
                            top: relationshipContextMenu.menuY,
                          }}
                        >
                          <button
                            onClick={() => handleDeleteRelationshipNode(relationshipContextMenu.nodeId)}
                            type="button"
                          >
                            从关系图移除
                          </button>
                        </div>
                      ) : null}

                      {relationshipLineDraft ? (
                        <div className="relationshipHint">
                          点击目标人物，建立
                          {relationshipLineDraft.direction === "double" ? "双箭头" : "单箭头"}
                          关系
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="clueCanvasEmpty">点击管理关系图，创建第一张人物关系图</div>
                  )}

                  <div className="clueCanvasZoomDock" aria-label="人物关系图缩放">
                    <button
                      disabled={!activeRelationshipGraph}
                      onClick={() => handleAdjustRelationshipZoom(-10)}
                      type="button"
                    >
                      -
                    </button>
                    <strong>{activeRelationshipGraph?.zoom ?? 100}%</strong>
                    <button
                      disabled={!activeRelationshipGraph}
                      onClick={() => handleAdjustRelationshipZoom(10)}
                      type="button"
                    >
                      +
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>

          <aside className="clueControlPanel">
            <div className="cluePanelHeader">
              <span>控件栏</span>
              <small>拖入/新增</small>
            </div>

            <div className="clueControlStack">
              <button onClick={() => handleAddClueNode("child")} type="button">
                子线索
              </button>
              <button onClick={() => handleAddClueNode("sibling")} type="button">
                同级线索
              </button>
              <button onClick={() => handleAddClueNode("free")} type="button">
                自由节点
              </button>
              <button className="danger" onClick={handleDeleteSelectedClueNode} type="button">
                删除节点
              </button>
            </div>

            <div className="clueNodeInspector">
              <span>当前节点</span>
              {activeClueNode ? (
                <>
                  <label>
                    标题
                    <input
                      onChange={(event) =>
                        handleUpdateClueNode(activeClueNode.id, { title: event.target.value })
                      }
                      value={activeClueNode.title}
                    />
                  </label>
                  <label>
                    备注
                    <textarea
                      onChange={(event) =>
                        handleUpdateClueNode(activeClueNode.id, { detail: event.target.value })
                      }
                      placeholder="记录这条线索的证据、疑点、反转或后续用途。"
                      value={activeClueNode.detail}
                    />
                  </label>
                  <label>
                    标签
                    <input
                      onChange={(event) =>
                        handleUpdateClueNode(activeClueNode.id, {
                          tags: event.target.value.split(/[，,]/),
                        })
                      }
                      placeholder="伏笔, 反转, 待确认"
                      value={activeClueNode.tags?.join(", ") ?? ""}
                    />
                  </label>
                  <button
                    className="clueInspectorAction"
                    onClick={() => handleToggleClueNodeCollapsed(activeClueNode.id)}
                    type="button"
                  >
                    {activeClueNode.collapsed ? "展开子主题" : "折叠子主题"}
                  </button>
                </>
              ) : (
                <p>先选择一个节点。</p>
              )}
            </div>

            <div className="clueMentionLibrary">
              <span>@人物</span>
              {characters.length ? (
                characters.slice(0, 8).map((character) => (
                  <button
                    key={character.id}
                    onClick={() => handleInsertCharacterMention(character.name)}
                    type="button"
                  >
                    @{character.name}
                  </button>
                ))
              ) : (
                <p>先在人物管理里建立角色。</p>
              )}
            </div>

            <div className="clueMcpPanel">
              <span>XMind MCP</span>
              <p>当前先生成结构化主题树；接入 MCP 后可用于导入、同步和 AI 整理。</p>
              <button onClick={handlePrepareXmindMcpSnapshot} type="button">
                生成同步结构
              </button>
              <div className="clueMcpFutureActions" aria-label="XMind MCP 预留功能">
                <button disabled type="button">
                  从 XMind 导入
                </button>
                <button disabled type="button">
                  同步到 XMind
                </button>
              </div>
              {clueMcpStatus ? <small>{clueMcpStatus}</small> : null}
            </div>

            <div className="clueZoomDock">
              <button onClick={() => handleAdjustClueZoom(-10)} type="button">
                -
              </button>
              <strong>{activeClueBoard?.zoom ?? 100}%</strong>
              <button onClick={() => handleAdjustClueZoom(10)} type="button">
                +
              </button>
            </div>
          </aside>
        </section>
        {foreshadowingDialog ? (
          <div className="clueBoardDialogBackdrop" role="presentation">
            <form
              aria-label={foreshadowingDialog.mode === "add" ? "新增伏笔" : "编辑伏笔"}
              className="clueBoardDialog foreshadowingDialog"
              onSubmit={(event) => {
                event.preventDefault();
                handleSubmitForeshadowingDialog();
              }}
            >
              <div className="clueBoardDialogHeader">
                <strong>{foreshadowingDialog.mode === "add" ? "新增伏笔" : "编辑伏笔"}</strong>
                <button onClick={() => setForeshadowingDialog(null)} type="button">
                  ×
                </button>
              </div>

              <label className="clueBoardNameField">
                <span>伏笔名称</span>
                <input
                  autoFocus
                  onChange={(event) =>
                    updateForeshadowingDialogDraft({ title: event.target.value })
                  }
                  value={foreshadowingDialog.draft.title}
                />
              </label>

              <div className="foreshadowingStatusSegment" aria-label="伏笔状态">
                {foreshadowingStatusOptions.map((status) => (
                  <button
                    className={foreshadowingDialog.draft.status === status ? "active" : ""}
                    key={status}
                    onClick={() => updateForeshadowingDialogDraft({ status })}
                    type="button"
                  >
                    {foreshadowingStatusLabels[status]}
                  </button>
                ))}
              </div>

              <div className="foreshadowingDialogGrid">
                <label className="foreshadowingPicker">
                  <span>埋设章节</span>
                  <div className="foreshadowingChips">
                    {foreshadowingDialog.draft.setupChapterIds.map((chapterId) => (
                      <button
                        key={chapterId}
                        onClick={() => toggleForeshadowingDraftId("setupChapterIds", chapterId)}
                        type="button"
                      >
                        {getForeshadowingChapterLabel(chapterId)} ×
                      </button>
                    ))}
                  </div>
                  <input
                    onChange={(event) => setForeshadowingSetupChapterQuery(event.target.value)}
                    placeholder="搜索并选择埋设章节"
                    value={foreshadowingSetupChapterQuery}
                  />
                  <div className="foreshadowingOptionList">
                    {setupChapterOptions.length ? (
                      setupChapterOptions.map((chapter) => (
                        <button
                          className={
                            foreshadowingDialog.draft.setupChapterIds.includes(chapter.id)
                              ? "active"
                              : ""
                          }
                          key={chapter.id}
                          onClick={() => toggleForeshadowingDraftId("setupChapterIds", chapter.id)}
                          type="button"
                        >
                          {chapter.label}
                        </button>
                      ))
                    ) : (
                      <p>暂无匹配章节。</p>
                    )}
                  </div>
                </label>

                <label className="foreshadowingPicker">
                  <span>回收章节</span>
                  <div className="foreshadowingChips">
                    {foreshadowingDialog.draft.payoffChapterIds.map((chapterId) => (
                      <button
                        key={chapterId}
                        onClick={() => toggleForeshadowingDraftId("payoffChapterIds", chapterId)}
                        type="button"
                      >
                        {getForeshadowingChapterLabel(chapterId)} ×
                      </button>
                    ))}
                  </div>
                  <input
                    onChange={(event) => setForeshadowingPayoffChapterQuery(event.target.value)}
                    placeholder="搜索并选择回收章节"
                    value={foreshadowingPayoffChapterQuery}
                  />
                  <div className="foreshadowingOptionList">
                    {payoffChapterOptions.length ? (
                      payoffChapterOptions.map((chapter) => (
                        <button
                          className={
                            foreshadowingDialog.draft.payoffChapterIds.includes(chapter.id)
                              ? "active"
                              : ""
                          }
                          key={chapter.id}
                          onClick={() => toggleForeshadowingDraftId("payoffChapterIds", chapter.id)}
                          type="button"
                        >
                          {chapter.label}
                        </button>
                      ))
                    ) : (
                      <p>暂无匹配章节。</p>
                    )}
                  </div>
                </label>

                <label className="foreshadowingPicker">
                  <span>关联人物</span>
                  <div className="foreshadowingChips">
                    {foreshadowingDialog.draft.characterIds.map((characterId) => (
                      <button
                        key={characterId}
                        onClick={() => toggleForeshadowingDraftId("characterIds", characterId)}
                        type="button"
                      >
                        {getForeshadowingCharacterLabel(characterId)} ×
                      </button>
                    ))}
                  </div>
                  <input
                    onChange={(event) => setForeshadowingCharacterQuery(event.target.value)}
                    placeholder="输入人物名的一部分"
                    value={foreshadowingCharacterQuery}
                  />
                  <div className="foreshadowingOptionList">
                    {foreshadowingDialogCharacterOptions.length ? (
                      foreshadowingDialogCharacterOptions.map((character) => (
                        <button
                          className={
                            foreshadowingDialog.draft.characterIds.includes(character.id)
                              ? "active"
                              : ""
                          }
                          key={character.id}
                          onClick={() => toggleForeshadowingDraftId("characterIds", character.id)}
                          type="button"
                        >
                          {character.label}
                        </button>
                      ))
                    ) : (
                      <p>暂无匹配人物。</p>
                    )}
                  </div>
                </label>
              </div>

              <label className="clueBoardNameField">
                <span>标签</span>
                <input
                  onChange={(event) =>
                    updateForeshadowingDialogDraft({ tagsText: event.target.value })
                  }
                  placeholder="用逗号分隔，例如：主线, 反派, 世界观"
                  value={foreshadowingDialog.draft.tagsText}
                />
              </label>

              <label className="clueBoardNameField">
                <span>埋设说明</span>
                <textarea
                  onChange={(event) =>
                    updateForeshadowingDialogDraft({ summary: event.target.value })
                  }
                  placeholder="记录伏笔在正文中的表现"
                  value={foreshadowingDialog.draft.summary}
                />
              </label>
              <label className="clueBoardNameField">
                <span>回收计划</span>
                <textarea
                  onChange={(event) => updateForeshadowingDialogDraft({ plan: event.target.value })}
                  placeholder="计划在何处解释、兑现或反转"
                  value={foreshadowingDialog.draft.plan}
                />
              </label>
              <label className="clueBoardNameField">
                <span>回收结果</span>
                <textarea
                  onChange={(event) =>
                    updateForeshadowingDialogDraft({ result: event.target.value })
                  }
                  placeholder="实际回收后的结果，可以暂时留空"
                  value={foreshadowingDialog.draft.result}
                />
              </label>

              <div className="clueBoardDialogActions">
                <button onClick={() => setForeshadowingDialog(null)} type="button">
                  关闭
                </button>
                <button type="submit">完成</button>
              </div>
            </form>
          </div>
        ) : null}
        {clueBoardManagerDialog ? (
          <div className="clueBoardDialogBackdrop" role="presentation">
            <form
              aria-label={clueBoardManagerDialogTitle}
              className="clueBoardDialog"
              onSubmit={(event) => {
                event.preventDefault();
                handleSubmitClueBoardManagerDialog();
              }}
            >
              <div className="clueBoardDialogHeader">
                <strong>{clueBoardManagerDialogTitle}</strong>
                <button onClick={() => setClueBoardManagerDialog(null)} type="button">
                  ×
                </button>
              </div>

              {clueBoardManagerDialog.mode === "create" ? (
                <label className="clueBoardNameField">
                  <span>新建导图命名</span>
                  <input
                    autoFocus
                    onChange={(event) =>
                      setClueBoardManagerDialog({
                        ...clueBoardManagerDialog,
                        titleDraft: event.target.value,
                      })
                    }
                    value={clueBoardManagerDialog.titleDraft}
                  />
                </label>
              ) : (
                <>
                  <div className="clueBoardFileList" role="listbox">
                    {clueBoards.length ? (
                      clueBoards.map((board) => (
                        <button
                          aria-selected={board.id === clueBoardManagerSelectedId}
                          className={board.id === clueBoardManagerSelectedId ? "active" : ""}
                          key={board.id}
                          onClick={() => handleSelectClueBoardInManagerDialog(board.id)}
                          role="option"
                          type="button"
                        >
                          <span>{board.title}</span>
                          <small>{board.nodes.length} 节点</small>
                        </button>
                      ))
                    ) : (
                      <p>暂无导图。</p>
                    )}
                  </div>
                  {clueBoardManagerDialog.mode === "rename" ? (
                    <label className="clueBoardNameField">
                      <span>新名称</span>
                      <input
                        autoFocus
                        onChange={(event) =>
                          setClueBoardManagerDialog({
                            ...clueBoardManagerDialog,
                            titleDraft: event.target.value,
                          })
                        }
                        value={clueBoardManagerDialog.titleDraft}
                      />
                    </label>
                  ) : null}
                </>
              )}

              <div className="clueBoardDialogActions">
                <button onClick={() => setClueBoardManagerDialog(null)} type="button">
                  关闭
                </button>
                <button
                  className={clueBoardManagerDialog.mode === "delete" ? "danger" : ""}
                  disabled={
                    clueBoardManagerDialog.mode !== "create" && !clueBoardManagerSelectedId
                  }
                  type="submit"
                >
                  {clueBoardManagerSubmitLabel}
                </button>
              </div>
            </form>
          </div>
        ) : null}
        {relationshipGraphManagerDialog ? (
          <div className="clueBoardDialogBackdrop" role="presentation">
            <form
              aria-label={relationshipGraphManagerDialogTitle}
              className="clueBoardDialog"
              onSubmit={(event) => {
                event.preventDefault();
                handleSubmitRelationshipGraphManagerDialog();
              }}
            >
              <div className="clueBoardDialogHeader">
                <strong>{relationshipGraphManagerDialogTitle}</strong>
                <button onClick={() => setRelationshipGraphManagerDialog(null)} type="button">
                  ×
                </button>
              </div>

              {relationshipGraphManagerDialog.mode === "create" ? (
                <label className="clueBoardNameField">
                  <span>新建关系图命名</span>
                  <input
                    autoFocus
                    onChange={(event) =>
                      setRelationshipGraphManagerDialog({
                        ...relationshipGraphManagerDialog,
                        titleDraft: event.target.value,
                      })
                    }
                    value={relationshipGraphManagerDialog.titleDraft}
                  />
                </label>
              ) : (
                <>
                  <div className="clueBoardFileList" role="listbox">
                    {relationshipGraphs.length ? (
                      relationshipGraphs.map((graph) => (
                        <button
                          aria-selected={graph.id === relationshipGraphManagerSelectedId}
                          className={graph.id === relationshipGraphManagerSelectedId ? "active" : ""}
                          key={graph.id}
                          onClick={() => handleSelectRelationshipGraphInManagerDialog(graph.id)}
                          role="option"
                          type="button"
                        >
                          <span>{graph.title}</span>
                          <small>{graph.nodes.length} 人物</small>
                        </button>
                      ))
                    ) : (
                      <p>暂无关系图。</p>
                    )}
                  </div>
                  {relationshipGraphManagerDialog.mode === "rename" ? (
                    <label className="clueBoardNameField">
                      <span>新名称</span>
                      <input
                        autoFocus
                        onChange={(event) =>
                          setRelationshipGraphManagerDialog({
                            ...relationshipGraphManagerDialog,
                            titleDraft: event.target.value,
                          })
                        }
                        value={relationshipGraphManagerDialog.titleDraft ?? ""}
                      />
                    </label>
                  ) : null}
                </>
              )}

              <div className="clueBoardDialogActions">
                <button onClick={() => setRelationshipGraphManagerDialog(null)} type="button">
                  关闭
                </button>
                <button
                  className={relationshipGraphManagerDialog.mode === "delete" ? "danger" : ""}
                  disabled={
                    relationshipGraphManagerDialog.mode !== "create" &&
                    !relationshipGraphManagerSelectedId
                  }
                  type="submit"
                >
                  {relationshipGraphManagerSubmitLabel}
                </button>
              </div>
            </form>
          </div>
        ) : null}
        {isRelationshipCharacterPickerOpen ? (
          <div className="clueBoardDialogBackdrop" role="presentation">
            <div className="clueBoardDialog relationshipCharacterPicker" role="dialog">
              <div className="clueBoardDialogHeader">
                <strong>添加人物</strong>
                <button onClick={() => setIsRelationshipCharacterPickerOpen(false)} type="button">
                  ×
                </button>
              </div>
              <label className="clueBoardNameField">
                <span>检索人物</span>
                <input
                  autoFocus
                  onChange={(event) => setRelationshipCharacterQuery(event.target.value)}
                  placeholder="输入人物名的一部分"
                  value={relationshipCharacterQuery}
                />
              </label>
              <div className="relationshipCharacterPickerList">
                {relationshipCharacterOptions.length ? (
                  relationshipCharacterOptions.map((character) => (
                    <button
                      key={character.id}
                      onClick={() => handleAddRelationshipCharacter(character.id)}
                      type="button"
                    >
                      <span className="relationshipPickerAvatar">
                        {character.portrait ? (
                          <img alt={character.portrait.name} src={character.portrait.url} />
                        ) : (
                          character.name.slice(0, 1)
                        )}
                      </span>
                      <strong>{character.name}</strong>
                      <small>{character.gender || "性别未设定"}</small>
                    </button>
                  ))
                ) : (
                  <p>没有可添加的人物。先在人物管理里建立人物，或换个关键词。</p>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </main>
    );
  }

  if (view === "maps") {
    const categoryLabels: Record<string, string> = {
      western: "西幻世界",
      xianxia: "仙侠世界",
      cosmic: "宇宙星图",
      city: "城市地图",
      custom: "自定义",
    };
    const basesByCategory = BUILT_IN_MAP_BASES.reduce<
      Record<string, typeof BUILT_IN_MAP_BASES>
    >((groups, base) => {
      groups[base.category] = [...(groups[base.category] ?? []), base];
      return groups;
    }, {});

    return (
      <main className="worldConsole mapConsole">
        <div className="worldConsoleGrid" aria-hidden="true" />
        <header className="worldConsoleHeader">
          <strong>Air to World</strong>
          <button onClick={() => setView("workspace")} type="button">
            返回
          </button>
        </header>

        <section className="mapConsoleStage" aria-label="地图管理">
          <aside className="mapLibraryPanel">
            <div className="mapPanelHeader">
              <span>地图选择</span>
              <button onClick={() => setIsMapBasePickerOpen(true)} type="button">
                新建地图
              </button>
            </div>

            <div className="mapLibraryList">
              {storyMaps.length ? (
                storyMaps.map((map) => (
                  <button
                    className={map.id === selectedMap?.id ? "active" : ""}
                    key={map.id}
                    onClick={() => setSelectedMapId(map.id)}
                    type="button"
                  >
                    <img alt="" src={map.baseImageUrl} />
                    <span>{map.title}</span>
                    <small>{categoryLabels[map.category] ?? "地图"}</small>
                  </button>
                ))
              ) : (
                <p>还没有地图。右侧选择内置底图，或上传自己的地图底图。</p>
              )}
            </div>
          </aside>

          <section className="mapEditorPanel">
            <div className="mapEditorHeader">
              <div>
                <span>地图编辑</span>
                <input
                  aria-label="地图名称"
                  disabled={!selectedMap}
                  onChange={(event) => handleUpdateSelectedMapTitle(event.target.value)}
                  placeholder="选择或创建地图"
                  value={selectedMap?.title ?? ""}
                />
              </div>
              <div className="mapEditorActions">
                <button disabled={!selectedMap} onClick={handleAddMapMarker} type="button">
                  新增标记
                </button>
                <button disabled={!selectedMap} onClick={handleDeleteSelectedMap} type="button">
                  删除地图
                </button>
              </div>
            </div>

            <div className="mapCanvasFrame" ref={mapCanvasFrameRef}>
              {selectedMap ? (
                <div
                  className="mapCanvasViewport"
                  onContextMenu={handleMapCanvasContextMenu}
                  onPointerLeave={handleMapCanvasPointerUp}
                  onPointerMove={handleMapCanvasPointerMove}
                  onPointerUp={handleMapCanvasPointerUp}
                >
                  <div
                    className="mapCanvas"
                    ref={mapCanvasRef}
                    style={{ transform: `scale(${selectedMap.zoom / 100})` }}
                  >
                    <img alt={`${selectedMap.title}底图`} src={selectedMap.baseImageUrl} />
                    {(selectedMap.texts ?? []).map((text) => (
                      <div
                        className="mapTextOverlay"
                        key={text.id}
                        onDoubleClick={(event) => {
                          event.stopPropagation();
                          handleOpenMapTextEdit(text);
                        }}
                        style={{
                          color: getMapTextColorHex(text.color),
                          fontFamily: getMapTextFontFamily(text.font),
                          fontSize: `${text.fontSize}px`,
                          left: `${text.x}%`,
                          top: `${text.y}%`,
                        }}
                      >
                        {text.text}
                      </div>
                    ))}
                    {(selectedMap.images ?? []).map((image) => (
                      <div
                        className="mapImageOverlay"
                        key={image.id}
                        onPointerDown={(event) =>
                          handleStartMapImageGesture(event, image, "move")
                        }
                        style={{
                          height: `${image.height}px`,
                          left: `${image.x}%`,
                          top: `${image.y}%`,
                          width: `${image.width}px`,
                        }}
                      >
                        <img alt={image.name} src={image.url} />
                        <button
                          aria-label="缩放图片"
                          className="mapImageResizeHandle"
                          onPointerDown={(event) =>
                            handleStartMapImageGesture(event, image, "resize")
                          }
                          type="button"
                        />
                      </div>
                    ))}
                    {selectedMap.markers.map((marker) => (
                      <button
                        className="mapMarker"
                        key={marker.id}
                        style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
                        title={marker.note || marker.title}
                        type="button"
                      >
                        <span />
                        <b>{marker.title}</b>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mapEmptyCanvas">
                  <strong>选择一张底图开始建图</strong>
                  <p>
                    内置底图按西幻、仙侠、宇宙和城市分类，也可以上传自己的地图作为底图。
                  </p>
                </div>
              )}

              <div className="mapZoomControls" aria-label="地图缩放">
                <button disabled={!selectedMap} onClick={() => handleAdjustMapZoom(10)} type="button">
                  +
                </button>
                <span>{selectedMap?.zoom ?? 100}%</span>
                <button disabled={!selectedMap} onClick={() => handleAdjustMapZoom(-10)} type="button">
                  -
                </button>
              </div>
              {mapContextMenu && selectedMap ? (
                <div
                  className="mapContextMenu"
                  onContextMenu={(event) => event.preventDefault()}
                  style={{
                    left: `${mapContextMenu.menuX}px`,
                    top: `${mapContextMenu.menuY}px`,
                  }}
                >
                  <div className="mapContextHeader">
                    <strong>地图操作</strong>
                    <button onClick={() => setMapContextMenu(null)} type="button">
                      关闭
                    </button>
                  </div>
                  <section className="mapContextSection">
                    <span>新增文本</span>
                    <input
                      onChange={(event) =>
                        setMapTextDraft({ ...mapTextDraft, text: event.target.value })
                      }
                      placeholder="输入地图文字"
                      value={mapTextDraft.text}
                    />
                    <div className="mapContextGrid">
                      <select
                        onChange={(event) =>
                          setMapTextDraft({
                            ...mapTextDraft,
                            color: event.target.value as MapTextColor,
                          })
                        }
                        value={mapTextDraft.color}
                      >
                        {MAP_TEXT_COLORS.map((color) => (
                          <option key={color.value} value={color.value}>
                            {color.label}
                          </option>
                        ))}
                      </select>
                      <select
                        onChange={(event) =>
                          setMapTextDraft({
                            ...mapTextDraft,
                            font: event.target.value as MapTextFont,
                          })
                        }
                        value={mapTextDraft.font}
                      >
                        {MAP_TEXT_FONTS.map((font) => (
                          <option key={font.value} value={font.value}>
                            {font.label}
                          </option>
                        ))}
                      </select>
                      <input
                        max={72}
                        min={12}
                        onChange={(event) =>
                          setMapTextDraft({
                            ...mapTextDraft,
                            fontSize: Number(event.target.value),
                          })
                        }
                        type="number"
                        value={mapTextDraft.fontSize}
                      />
                    </div>
                    <button onClick={handleAddMapText} type="button">
                      放置文本
                    </button>
                  </section>
                  <button
                    className="mapContextAction"
                    onClick={() => handleAddMapMarkerAt(mapContextMenu.mapX, mapContextMenu.mapY)}
                    type="button"
                  >
                    新增标记
                  </button>
                  <label className="mapContextAction">
                    插入图片
                    <input
                      accept="image/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          void handleInsertMapImage(file);
                          event.target.value = "";
                        }
                      }}
                      type="file"
                    />
                  </label>
                </div>
              ) : null}
              {mapTextEdit ? (
                <div className="mapTextEditPanel">
                  <div className="mapContextHeader">
                    <strong>编辑文本属性</strong>
                    <button onClick={() => setMapTextEdit(null)} type="button">
                      关闭
                    </button>
                  </div>
                  <label>
                    <span>文本</span>
                    <textarea
                      onChange={(event) =>
                        setMapTextEdit({
                          ...mapTextEdit,
                          draft: { ...mapTextEdit.draft, text: event.target.value },
                        })
                      }
                      rows={3}
                      value={mapTextEdit.draft.text}
                    />
                  </label>
                  <div className="mapContextGrid">
                    <label>
                      <span>颜色</span>
                      <select
                        onChange={(event) =>
                          setMapTextEdit({
                            ...mapTextEdit,
                            draft: {
                              ...mapTextEdit.draft,
                              color: event.target.value as MapTextColor,
                            },
                          })
                        }
                        value={mapTextEdit.draft.color}
                      >
                        {MAP_TEXT_COLORS.map((color) => (
                          <option key={color.value} value={color.value}>
                            {color.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>字体</span>
                      <select
                        onChange={(event) =>
                          setMapTextEdit({
                            ...mapTextEdit,
                            draft: {
                              ...mapTextEdit.draft,
                              font: event.target.value as MapTextFont,
                            },
                          })
                        }
                        value={mapTextEdit.draft.font}
                      >
                        {MAP_TEXT_FONTS.map((font) => (
                          <option key={font.value} value={font.value}>
                            {font.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>字号</span>
                      <input
                        max={72}
                        min={12}
                        onChange={(event) =>
                          setMapTextEdit({
                            ...mapTextEdit,
                            draft: {
                              ...mapTextEdit.draft,
                              fontSize: Number(event.target.value),
                            },
                          })
                        }
                        type="number"
                        value={mapTextEdit.draft.fontSize}
                      />
                    </label>
                  </div>
                  <button onClick={handleSaveMapTextEdit} type="button">
                    完成
                  </button>
                </div>
              ) : null}
            </div>
          </section>

          <aside className={isMapBasePickerOpen ? "mapBasePanel active" : "mapBasePanel"}>
            <div className="mapPanelHeader">
              <span>底图库</span>
              <label>
                上传底图
                <input
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void handleUploadCustomMapBase(file);
                      event.target.value = "";
                    }
                  }}
                  type="file"
                />
              </label>
            </div>

            <div className="mapBaseScroll">
              {Object.entries(categoryLabels)
                .filter(([category]) => category !== "custom")
                .map(([category, label]) => (
                  <section className="mapBaseGroup" key={category}>
                    <h2>{label}</h2>
                    <div className="mapBaseGrid">
                      {(basesByCategory[category] ?? []).map((base) => (
                        <button
                          key={base.id}
                          onClick={() => handleCreateMapFromBase(base)}
                          type="button"
                        >
                          <img alt={base.title} src={base.thumbnailUrl} />
                          <span>{base.title}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
            </div>
          </aside>
        </section>
      </main>
    );
  }

  if (view === "characters") {
    const characterAttributeModules: Array<{
      kind: CharacterAttributeKind;
      title: string;
      hint: string;
    }> = [
      { kind: "custom", title: "自定义", hint: "拖入后先命名，再填写任意属性" },
      { kind: "weapon", title: "人物武器", hint: "适合战斗、冒险、玄幻题材" },
      { kind: "hometown", title: "人物家乡", hint: "出生地、成长环境或阵营归属" },
      { kind: "goal", title: "人物目标", hint: "短期欲望、长期执念或主线动机" },
      { kind: "faction", title: "所属势力", hint: "所属组织、阵营、门派或家族" },
      { kind: "summary", title: "简介", hint: "概括身份、定位和核心看点" },
      { kind: "ending", title: "人物结局", hint: "记录最终归宿、牺牲或转折" },
    ];
    const characterCoreFields = {
      "core:name": {
        label: "人物姓名",
        field: "name" as const,
        placeholder: "",
        value: selectedCharacter?.name ?? "",
      },
      "core:gender": {
        label: "性别",
        field: "gender" as const,
        placeholder: "男 / 女 / 未知 / 自定义",
        value: selectedCharacter?.gender ?? "",
      },
      "core:catchphrase": {
        label: "口头禅",
        field: "catchphrase" as const,
        placeholder: "这个人物常说的一句话",
        value: selectedCharacter?.catchphrase ?? "",
      },
    };
    const characterAttributeOrder = selectedCharacter
      ? getCharacterAttributeOrder(selectedCharacter)
      : [];
    const characterAttributeMap = new Map(
      (selectedCharacter?.attributes ?? []).map((attribute) => [attribute.id, attribute]),
    );

    return (
      <main className="worldConsole characterConsole">
        <div className="worldConsoleGrid" aria-hidden="true" />
        <header className="worldConsoleHeader">
          <strong>Air to World</strong>
          <button onClick={() => setView("workspace")} type="button">
            返回
          </button>
        </header>

        <section className="characterConsoleStage" aria-label="人物管理">
          <aside className="characterListPanel">
            <div className="characterPanelHeader">
              <span>人物列表</span>
              <button onClick={handleAddCharacter} type="button">
                新增人物
              </button>
            </div>
            <div className="characterList">
              {characters.length ? (
                characters.map((character) => (
                  <article
                    className={
                      selectedCharacter?.id === character.id
                        ? "characterListItem active"
                        : "characterListItem"
                    }
                    key={character.id}
                  >
                    <button
                      className="characterListSelect"
                      onClick={() => setSelectedCharacterId(character.id)}
                      type="button"
                    >
                      <strong>{character.name}</strong>
                      <small>{character.gender || "性别未设置"}</small>
                    </button>
                    <button
                      aria-label={`删除人物 ${character.name}`}
                      className="characterListDeleteButton characterAttributeIconButton delete"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDeleteCharacter(character.id);
                      }}
                      type="button"
                    >
                      <DeleteIcon />
                    </button>
                  </article>
                ))
              ) : (
                <p>还没有人物。先新增一个人物档案</p>
              )}
            </div>
          </aside>

          <section
            className={
              draggedCharacterAttributeKind || draggedCharacterAttributeToken
                ? "characterProfilePanel dragging"
                : "characterProfilePanel"
            }
            onDragOver={(event) => {
              if (!selectedCharacter || !draggedCharacterAttributeKind) {
                return;
              }
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
            }}
            onDrop={(event) => {
              event.preventDefault();
              const kind =
                (event.dataTransfer.getData(
                  "application/x-character-attribute-kind",
                ) as CharacterAttributeKind) ||
                draggedCharacterAttributeKind;
              if (kind) {
                handleAddCharacterAttribute(kind);
              }
            }}
          >
            {selectedCharacter ? (
              <>
                <div className="characterProfileHeader">
                  <span>人物档案</span>
                  <h1>{selectedCharacter.name}</h1>
                </div>

                <div className="characterProfileBody">
                  <div className="characterPortraitColumn">
                    <label className="characterPortraitSlot">
                      {selectedCharacter.portrait ? (
                        <img
                          alt={`${selectedCharacter.name}立绘`}
                          src={selectedCharacter.portrait.url}
                        />
                      ) : (
                        <span aria-hidden="true">+</span>
                      )}
                      <input
                        accept="image/*"
                        aria-label="上传人物立绘"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) {
                            handleUploadCharacterPortrait(file);
                            event.target.value = "";
                          }
                        }}
                        type="file"
                      />
                    </label>
                    <button
                      className="characterGalleryButton"
                      onClick={() => setIsCharacterGalleryOpen(true)}
                      type="button"
                    >
                      <span aria-hidden="true">+</span>
                      <strong>人物图集</strong>
                      <small>{selectedCharacter.gallery?.length ?? 0} </small>
                    </button>
                  </div>

                  <section className="characterAttributeDropZone">
                    <div className="characterPanelHeader">
                      <span>属性</span>
                      <small className="characterDropHint">把右侧属性拖入</small>
                    </div>
                    <div className="characterOrderedAttributes">
                      {characterAttributeOrder.map((token) => {
                        const coreField =
                          characterCoreFields[token as keyof typeof characterCoreFields];
                        const attribute = characterAttributeMap.get(token);

                        if (coreField) {
                          return (
                            <label
                              className="characterAttributeCard core sortable"
                              draggable
                              key={token}
                              onDragEnd={() => setDraggedCharacterAttributeToken("")}
                              onDragOver={(event) => {
                                event.preventDefault();
                                event.dataTransfer.dropEffect = "move";
                              }}
                              onDragStart={(event) => {
                                setDraggedCharacterAttributeToken(token);
                                event.dataTransfer.setData(
                                  "application/x-character-attribute-token",
                                  token,
                                );
                                event.dataTransfer.effectAllowed = "move";
                              }}
                              onDrop={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                const sourceToken =
                                  event.dataTransfer.getData(
                                    "application/x-character-attribute-token",
                                  ) || draggedCharacterAttributeToken;
                                if (sourceToken) {
                                  handleMoveCharacterAttribute(sourceToken, token);
                                }
                              }}
                            >
                              <div className="characterAttributeTitleRow">
                                <span>{coreField.label}</span>
                                {coreField.field !== "name" ? (
                                  <button
                                    aria-label={`删除${coreField.label}`}
                                    className="characterAttributeIconButton delete"
                                    onClick={(event) => {
                                      event.preventDefault();
                                      handleClearCharacterCoreField(coreField.field);
                                    }}
                                    type="button"
                                  >
                                    <DeleteIcon />
                                  </button>
                                ) : null}
                              </div>
                              <input
                                onChange={(event) =>
                                  handleUpdateCharacterBase(coreField.field, event.target.value)
                                }
                                placeholder={coreField.placeholder}
                                value={coreField.value}
                              />
                            </label>
                          );
                        }

                        if (!attribute) {
                          return null;
                        }

                        return (
                          <article
                            className="characterAttributeCard sortable"
                            draggable
                            key={attribute.id}
                            onDragEnd={() => setDraggedCharacterAttributeToken("")}
                            onDragOver={(event) => {
                              event.preventDefault();
                              event.dataTransfer.dropEffect = "move";
                            }}
                            onDragStart={(event) => {
                              setDraggedCharacterAttributeToken(attribute.id);
                              event.dataTransfer.setData(
                                "application/x-character-attribute-token",
                                attribute.id,
                              );
                              event.dataTransfer.effectAllowed = "move";
                            }}
                            onDrop={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              const sourceToken =
                                event.dataTransfer.getData(
                                  "application/x-character-attribute-token",
                                ) || draggedCharacterAttributeToken;
                              if (sourceToken) {
                                handleMoveCharacterAttribute(sourceToken, attribute.id);
                              }
                            }}
                          >
                          <div className="characterAttributeTitleRow">
                            {editingCharacterAttributeId === attribute.id ? (
                              <input
                                autoFocus
                                className="characterAttributeTitleInput"
                                onBlur={() => handleSaveCharacterAttributeTitle(attribute.id)}
                                onChange={(event) =>
                                  setCharacterAttributeTitleDraft(event.target.value)
                                }
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    handleSaveCharacterAttributeTitle(attribute.id);
                                  }
                                  if (event.key === "Escape") {
                                    setEditingCharacterAttributeId("");
                                    setCharacterAttributeTitleDraft("");
                                  }
                                }}
                                value={characterAttributeTitleDraft}
                              />
                            ) : (
                              <span>{attribute.title}</span>
                            )}
                            <div className="characterAttributeActions">
                              <button
                                aria-label={`${attribute.locked ? "解除保护" : "保护"}${attribute.title}`}
                                className={`characterAttributeLockButton ${attribute.locked ? "locked" : ""}`}
                                onClick={() =>
                                  handleUpdateCharacterAttribute(attribute.id, {
                                    locked: !attribute.locked,
                                  })
                                }
                                type="button"
                              >
                                {attribute.locked ? "已保护" : "保护"}
                              </button>
                              <button
                                aria-label={`修改${attribute.title}名称`}
                                className="characterAttributeIconButton edit"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() =>
                                  handleStartEditCharacterAttributeTitle(
                                    attribute.id,
                                    attribute.title,
                                  )
                                }
                                type="button"
                              >
                                <span aria-hidden="true" />
                              </button>
                              <button
                                aria-label={`删除${attribute.title}`}
                                className="characterAttributeIconButton delete"
                                onClick={() => handleDeleteCharacterAttribute(attribute.id)}
                                type="button"
                              >
                                <DeleteIcon />
                              </button>
                            </div>
                          </div>
                          <textarea
                            onChange={(event) =>
                              handleUpdateCharacterAttribute(attribute.id, {
                                value: event.target.value,
                              })
                            }
                            placeholder="填写这个属性的具体内容"
                            value={attribute.value}
                          />
                        </article>
                        );
                      })}
                    </div>
                  </section>
                </div>
                {isCharacterGalleryOpen ? (
                  <div className="modalBackdrop">
                    <section className="characterGalleryDialog">
                      <div className="characterGalleryHeader">
                        <div>
                          <span>人物图集</span>
                          <h2>{selectedCharacter.name}</h2>
                        </div>
                        <button onClick={() => setIsCharacterGalleryOpen(false)} type="button">
                          关闭
                        </button>
                      </div>
                      <label className="characterGalleryUpload">
                        <span aria-hidden="true">+</span>
                        <strong>上传人物立绘</strong>
                        <input
                          accept="image/*"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) {
                              handleUploadCharacterGalleryImage(file);
                              event.target.value = "";
                            }
                          }}
                          type="file"
                        />
                      </label>
                      <div className="characterGalleryGrid">
                        {selectedCharacter.gallery?.length ? (
                          selectedCharacter.gallery.map((image) => (
                            <button
                              key={image.id}
                              onClick={() => handleUseCharacterGalleryImage(image)}
                              type="button"
                            >
                              <img alt={image.name} src={image.url} />
                              <span>{image.name}</span>
                            </button>
                          ))
                        ) : (
                          <p>还没有上传过人物立绘。先上传一张图片，它会保存在这个人物图集中</p>
                        )}
                      </div>
                    </section>
                  </div>
                ) : null}
                {isCustomCharacterAttributeDialogOpen ? (
                  <div className="modalBackdrop">
                    <form
                      className="characterCustomAttributeDialog"
                      onSubmit={handleConfirmCustomCharacterAttribute}
                    >
                      <div className="characterCustomAttributeHeader">
                        <div>
                          <span>自定义属性</span>
                          <h2>命名属性</h2>
                        </div>
                        <button
                          aria-label="关闭自定义属性命名"
                          onClick={handleCloseCustomCharacterAttributeDialog}
                          type="button"
                        >
                          关闭
                        </button>
                      </div>
                      <label>
                        <span>属性名称</span>
                        <input
                          autoFocus
                          onChange={(event) =>
                            setCustomCharacterAttributeTitleDraft(event.target.value)
                          }
                          placeholder="例如：人物秘密"
                          value={customCharacterAttributeTitleDraft}
                        />
                      </label>
                      <div className="characterCustomAttributeActions">
                        <button type="submit">确认</button>
                      </div>
                    </form>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="characterEmptyState">
                <p>请先新增人物</p>
                <button onClick={handleAddCharacter} type="button">
                  新增人物
                </button>
              </div>
            )}
          </section>

          <aside className="characterModulePanel">
            <div className="characterPanelHeader">
              <span>可拖入属性</span>
              <small>拖入人物档案</small>
            </div>
            <div className="characterModuleList">
              {characterAttributeModules.map((module) => (
                <article
                  className="characterAttributeModule"
                  draggable
                  key={module.kind}
                  onDragEnd={() => setDraggedCharacterAttributeKind("")}
                  onDragStart={(event) => {
                    setDraggedCharacterAttributeKind(module.kind);
                    event.dataTransfer.setData(
                      "application/x-character-attribute-kind",
                      module.kind,
                    );
                    event.dataTransfer.effectAllowed = "copy";
                  }}
                >
                  <strong>{module.title}</strong>
                  <small>{module.hint}</small>
                </article>
              ))}
            </div>
          </aside>
        </section>
      </main>
    );
  }

  if (view === "timeline") {
    const timelineLanes: Array<{
      lane: TimelineEventLane;
      title: string;
      hint: string;
    }> = [
      {
        lane: "story",
        title: "故事时间线",
        hint: "记录正文中真实发生的剧情节点、人物状态变化和伏笔回收。",
      },
      {
        lane: "world",
        title: "世界观时间线",
        hint: "记录背景历史、纪年、战争、组织成立和传说事件。",
      },
    ];
    const timelineRelationOptions = timelineRelationPicker
      ? getTimelineRelationOptions(timelineRelationPicker.kind, timelineRelationPicker.sortMode)
      : [];
    const timelineRelationTitle =
      timelineRelationPicker?.kind === "chapters" ? "选择关联章节" : "选择关联人物";
    const timelineRelationHint =
      timelineRelationPicker?.kind === "chapters"
        ? "可以同时关联多个正文章节，按章节顺序或标题名称排序。"
        : "可以同时关联多个人物，按录入顺序或人物姓名排序。";

    return (
      <main className="worldConsole timelineConsole">
        <div className="worldConsoleGrid" aria-hidden="true" />
        <header className="worldConsoleHeader">
          <strong>Air to World</strong>
          <button onClick={() => setView("workspace")} type="button">
            返回
          </button>
        </header>

        <section className="timelineConsoleStage" aria-label="时间线管理">
          <div className="timelineConsoleIntro">
            <span>时间线管理</span>
            <h1>{project.title}</h1>
            <p>
              左侧记录正文推进，右侧记录世界历史。事件可以关联章节和人物。
            </p>
          </div>

          <div className="timelineLaneGrid">
            {timelineLanes.map((laneConfig) => {
              const laneEvents = timelineEvents.filter(
                (event) => event.lane === laneConfig.lane,
              );
              const laneZoom = timelineZoom[laneConfig.lane];
              const eventGap = Math.round(42 + laneZoom * 0.92);
              const timelineCanvasHeight = calculateTimelineCanvasHeight(
                laneEvents.length,
                laneZoom,
              );
              const orbitCount = calculateTimelineOrbitCount(laneEvents.length);
              const timelineFlightLayouts = laneEvents.map((_, index) =>
                calculateTimelineFlightLayout(index, laneEvents.length),
              );
              const timelineFlightPath = calculateTimelineFlightPath(
                timelineFlightLayouts,
              );

              return (
                <section className={`timelineLane ${laneConfig.lane}`} key={laneConfig.lane}>
                  <div className="timelineLaneHeader">
                    <div>
                      <span>{laneConfig.title}</span>
                      <small>{laneConfig.hint}</small>
                    </div>
                    <button
                      className="timelineLaneAdd"
                      onClick={() => handleAddTimelineEvent(laneConfig.lane)}
                      type="button"
                    >
                      新增
                    </button>
                  </div>
                  <div className="timelineEventList">
                    <div
                      className="timelineEventCanvas"
                      onDragOver={(dragEvent) => {
                        dragEvent.preventDefault();
                        dragEvent.dataTransfer.dropEffect = "move";
                      }}
                      onDrop={(dragEvent) => {
                        dragEvent.preventDefault();
                        const sourceEventId =
                          dragEvent.dataTransfer.getData(
                            "application/x-timeline-event-id",
                          ) || draggedTimelineEventId;
                        if (!sourceEventId) {
                          return;
                        }

                        const sourceEventIndex = laneEvents.findIndex(
                          (event) => event.id === sourceEventId,
                        );
                        if (sourceEventIndex === -1) {
                          setDraggedTimelineEventId("");
                          return;
                        }

                        const dropIndex = getTimelineDropIndex(
                          dragEvent.currentTarget,
                          dragEvent.clientY,
                        );
                        const targetIndex =
                          sourceEventIndex < dropIndex ? dropIndex - 1 : dropIndex;
                        handleMoveTimelineEventToIndex(sourceEventId, targetIndex);
                      }}
                      style={
                        {
                          "--timeline-event-gap": `${eventGap}px`,
                          "--timeline-canvas-height": `${timelineCanvasHeight}px`,
                        } as React.CSSProperties
                      }
                    >
                      <svg
                        aria-hidden="true"
                        className="timelineFlightPath"
                        focusable="false"
                        preserveAspectRatio="none"
                        viewBox="0 0 100 100"
                      >
                        <path d={timelineFlightPath} />
                      </svg>
                      <div className="timelineOrbitLayer" aria-hidden="true">
                        {Array.from({ length: orbitCount }).map((_, orbitIndex) => (
                          <span
                            className="timelineOrbit"
                            key={`${laneConfig.lane}-orbit-${orbitIndex}`}
                            style={
                              {
                                "--timeline-orbit-index": orbitIndex,
                                "--timeline-orbit-count": orbitCount,
                                "--timeline-orbit-opacity": Math.max(
                                  0.1,
                                  0.24 - orbitIndex * 0.012,
                                ),
                                "--timeline-orbit-top": `${
                                  orbitCount === 1
                                    ? timelineCanvasHeight * 0.5
                                    : 74 +
                                      (timelineCanvasHeight - 260) *
                                        (orbitIndex / Math.max(1, orbitCount - 1))
                                }px`,
                              } as React.CSSProperties
                            }
                          />
                        ))}
                      </div>
                      {laneEvents.length ? (
                        laneEvents.map((event, index) => {
                          const isSelected = selectedTimelineEventId === event.id;
                          const isDragTarget =
                            draggedTimelineEventId.length > 0 &&
                            draggedTimelineEventId !== event.id;
                          const flightLayout = timelineFlightLayouts[index];

                          return (
                            <button
                              aria-label={`查看${event.title}`}
                              className={[
                                "timelineEventNode",
                                flightLayout.side === "left" ? "sideLeft" : "sideRight",
                                isSelected ? "active" : "",
                                isDragTarget ? "dropTarget" : "",
                              ]
                                .filter(Boolean)
                                .join(" ")}
                              draggable
                              key={event.id}
                              onClick={() => {
                                setSelectedTimelineEventId(event.id);
                                setTimelineDetailEventId(event.id);
                              }}
                              onDragEnd={() => setDraggedTimelineEventId("")}
                              onDragOver={(dragEvent) => {
                                dragEvent.preventDefault();
                                dragEvent.dataTransfer.dropEffect = "move";
                              }}
                              onDragStart={(dragEvent) => {
                                setDraggedTimelineEventId(event.id);
                                dragEvent.dataTransfer.setData(
                                  "application/x-timeline-event-id",
                                  event.id,
                                );
                                dragEvent.dataTransfer.effectAllowed = "move";
                              }}
                              style={
                                {
                                  "--timeline-anchor-x": `${flightLayout.anchorX}%`,
                                  "--timeline-line-left": `${flightLayout.lineLeft}%`,
                                  "--timeline-line-width": `${flightLayout.lineWidth}%`,
                                  "--timeline-node-x": `${flightLayout.nodeX}%`,
                                } as React.CSSProperties
                              }
                              title={event.title}
                              type="button"
                            >
                              <span className="timelineEventPreview" aria-hidden="true">
                                {event.image ? (
                                  <img src={event.image.url} alt="" />
                                ) : (
                                  event.title.trim().slice(0, 1) || "事"
                                )}
                              </span>
                              <div className="timelineNodeTooltip">
                                <strong>{event.title}</strong>
                                {event.timeLabel.trim() ? (
                                  <small>{event.timeLabel}</small>
                                ) : null}
                              </div>
                            </button>
                          );
                        })
                      ) : (
                        <div className="timelineEmptyState">
                          <p>
                            {laneConfig.lane === "story"
                              ? "还没有故事事件。先记录一个正文中发生的关键节点。"
                              : "还没有世界观事件。先记录一段背景历史或重大传说。"}
                          </p>
                          <button onClick={() => handleAddTimelineEvent(laneConfig.lane)} type="button">
                            新增事件
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="timelineZoomDock">
                    <button
                      aria-label={`放大${laneConfig.title}`}
                      onClick={() => handleAdjustTimelineZoom(laneConfig.lane, 20)}
                      type="button"
                    >
                      +
                    </button>
                    <strong>{laneZoom}%</strong>
                    <button
                      aria-label={`缩小${laneConfig.title}`}
                      onClick={() => handleAdjustTimelineZoom(laneConfig.lane, -20)}
                      type="button"
                    >
                      -
                    </button>
                    <button
                      onClick={() => handleFitTimelineZoom(laneConfig.lane, laneEvents.length)}
                      type="button"
                    >
                      适配
                    </button>
                  </div>
                </section>
              );
            })}
          </div>
          {timelineDetailEventId && timelineDetailEvent && timelineDraftEvent ? (
            <div
              className="modalBackdrop"
              onClick={(mouseEvent) => {
                if (mouseEvent.target === mouseEvent.currentTarget) {
                  handleTimelineDetailCloseEvent(mouseEvent);
                }
              }}
              onPointerDown={(pointerEvent) => {
                if (pointerEvent.target === pointerEvent.currentTarget) {
                  handleTimelineDetailCloseEvent(pointerEvent);
                }
              }}
              onWheel={(wheelEvent) => {
                wheelEvent.preventDefault();
                wheelEvent.stopPropagation();
              }}
            >
              <aside
                className="timelineDetailPanel timelineDetailModal"
                onClick={(mouseEvent) => mouseEvent.stopPropagation()}
                onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()}
                onWheel={(wheelEvent) => wheelEvent.stopPropagation()}
              >
                <div className="timelineDetailHeader">
                  <div>
                    <span>事件详情</span>
                    <strong>{timelineDraftEvent.title}</strong>
                  </div>
                  <div className="timelineDetailHeaderActions">
                    <button
                      aria-label="关闭事件详情"
                      onClick={handleTimelineDetailCloseEvent}
                      onClickCapture={handleTimelineDetailCloseEvent}
                      onPointerDown={handleTimelineDetailCloseEvent}
                      onPointerDownCapture={handleTimelineDetailCloseEvent}
                      type="button"
                    >
                      关闭
                    </button>
                  </div>
                </div>
                <div className="timelineEventEditor">
                  <div className="timelineEventLeadGrid">
                    <div className="timelineEventLeadFields">
                      <label className="timelineEventCompactField">
                        <span>事件</span>
                        <input
                          onChange={(inputEvent) =>
                            setTimelineDraftEvent({
                              ...timelineDraftEvent,
                              title: inputEvent.target.value,
                            })
                          }
                          value={timelineDraftEvent.title}
                        />
                      </label>
                      <label className="timelineEventCompactField">
                        <span>时间标记</span>
                        <input
                          onChange={(inputEvent) =>
                            setTimelineDraftEvent({
                              ...timelineDraftEvent,
                              timeLabel: inputEvent.target.value,
                            })
                          }
                          placeholder="第12章当天 / 新历207年 / 主线开始前十年"
                          value={timelineDraftEvent.timeLabel}
                        />
                      </label>
                    </div>
                    <label
                      className={[
                        "timelineEventImageUpload",
                        "timelineEventImageUploadLarge",
                        timelineDraftEvent.image ? "hasImage" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <input
                        accept="image/*"
                        onChange={(inputEvent) => {
                          const file = inputEvent.target.files?.[0];
                          if (file) {
                            void handleUploadTimelineEventImage(file);
                          }
                          inputEvent.currentTarget.value = "";
                        }}
                        type="file"
                      />
                      {timelineDraftEvent.image ? (
                        <img src={timelineDraftEvent.image.url} alt={timelineDraftEvent.image.name} />
                      ) : (
                        <>
                          <span aria-hidden="true">+</span>
                          <small>事件图片</small>
                        </>
                      )}
                    </label>
                  </div>
                  <label>
                    <span>简介</span>
                    <textarea
                      onChange={(inputEvent) =>
                        setTimelineDraftEvent({
                          ...timelineDraftEvent,
                          summary: inputEvent.target.value,
                        })
                      }
                      placeholder="这个事件发生了什么？"
                      value={timelineDraftEvent.summary}
                    />
                  </label>
                  <label>
                    <span>影响结果</span>
                    <textarea
                      onChange={(inputEvent) =>
                        setTimelineDraftEvent({
                          ...timelineDraftEvent,
                          impact: inputEvent.target.value,
                        })
                      }
                      placeholder="这个事件改变了谁的状态、道具归属、势力关系或伏笔进度？"
                      value={timelineDraftEvent.impact}
                    />
                  </label>

                  <div className="timelineRelations">
                    <div className="timelineRelationField">
                      <span>关联章节</span>
                      <button
                        className="timelineRelationButton"
                        onClick={() => handleOpenTimelineRelationPicker("chapters")}
                        type="button"
                      >
                        <strong>
                          {getTimelineRelationSummary(
                            "chapters",
                            timelineDraftEvent.relatedChapterIds,
                          )}
                        </strong>
                        <small>{timelineDraftEvent.relatedChapterIds.length} 项已关联</small>
                      </button>
                    </div>
                    <div className="timelineRelationField">
                      <span>关联人物</span>
                      <button
                        className="timelineRelationButton"
                        onClick={() => handleOpenTimelineRelationPicker("characters")}
                        type="button"
                      >
                        <strong>
                          {getTimelineRelationSummary(
                            "characters",
                            timelineDraftEvent.relatedCharacterIds,
                          )}
                        </strong>
                        <small>{timelineDraftEvent.relatedCharacterIds.length} 项已关联</small>
                      </button>
                    </div>
                  </div>

                  <div className="timelineDetailActions">
                    <button
                      aria-label={`删除事件 ${timelineDetailEvent.title}`}
                      className="timelineDeleteButton"
                      onClick={() => handleDeleteTimelineEvent(timelineDetailEvent.id)}
                      type="button"
                    >
                      <DeleteIcon />
                    </button>
                    <button
                      className="timelineCompleteButton"
                      onClick={() => {
                        handleUpdateTimelineEvent(timelineDetailEvent.id, {
                          title: timelineDraftEvent.title,
                          image: timelineDraftEvent.image,
                          timeLabel: timelineDraftEvent.timeLabel,
                          summary: timelineDraftEvent.summary,
                          impact: timelineDraftEvent.impact,
                          relatedChapterIds: timelineDraftEvent.relatedChapterIds,
                          relatedCharacterIds: timelineDraftEvent.relatedCharacterIds,
                          relatedLocationIds: [],
                          relatedOrganizationIds: [],
                        });
                        handleCloseTimelineDetail();
                      }}
                      type="button"
                    >
                      完成
                    </button>
                  </div>
                </div>
              </aside>
            </div>
          ) : null}
          {timelineRelationPicker ? (
            <div
              className="modalBackdrop timelineRelationBackdrop"
              onClick={() => setTimelineRelationPicker(null)}
            >
              <aside
                className="timelineRelationDialog"
                onClick={(mouseEvent) => mouseEvent.stopPropagation()}
              >
                <div className="timelineRelationDialogHeader">
                  <div>
                    <span>{timelineRelationTitle}</span>
                    <strong>{timelineRelationPicker.selectedIds.length} 项已选择</strong>
                    <small>{timelineRelationHint}</small>
                  </div>
                  <button onClick={() => setTimelineRelationPicker(null)} type="button">
                    关闭
                  </button>
                </div>
                <div className="timelineRelationToolbar">
                  <span>排序</span>
                  <button
                    className={timelineRelationPicker.sortMode === "time" ? "active" : ""}
                    onClick={() =>
                      setTimelineRelationPicker({
                        ...timelineRelationPicker,
                        sortMode: "time",
                      })
                    }
                    type="button"
                  >
                    按时间
                  </button>
                  <button
                    className={timelineRelationPicker.sortMode === "name" ? "active" : ""}
                    onClick={() =>
                      setTimelineRelationPicker({
                        ...timelineRelationPicker,
                        sortMode: "name",
                      })
                    }
                    type="button"
                  >
                    按名称
                  </button>
                </div>
                <div className="timelineRelationOptionList">
                  {timelineRelationOptions.length ? (
                    timelineRelationOptions.map((option) => {
                      const isSelected = timelineRelationPicker.selectedIds.includes(option.id);

                      return (
                        <button
                          className={`timelineRelationOption ${isSelected ? "selected" : ""}`}
                          key={option.id}
                          onClick={() => handleToggleTimelineRelationOption(option.id)}
                          type="button"
                        >
                          <span className="timelineRelationFolder" aria-hidden="true" />
                          <div>
                            <strong>{option.title}</strong>
                            <small>{option.meta}</small>
                          </div>
                          <span className="timelineRelationCheck" aria-hidden="true">
                            {isSelected ? "✓" : ""}
                          </span>
                        </button>
                      );
                    })
                  ) : (
                    <div className="timelineRelationEmpty">
                      {timelineRelationPicker.kind === "chapters"
                        ? "还没有可关联章节。先在章纲管理里上传或创建章节。"
                        : "还没有可关联人物。先在人物管理里新增人物。"}
                    </div>
                  )}
                </div>
                <div className="timelineRelationDialogActions">
                  <button onClick={() => setTimelineRelationPicker(null)} type="button">
                    关闭
                  </button>
                  <button onClick={handleSaveTimelineRelationPicker} type="button">
                    保存
                  </button>
                </div>
              </aside>
            </div>
          ) : null}
        </section>
      </main>
    );
  }

  if (view === "outline") {
    const manuscript = project.manuscript;
    const wordCount = getManuscriptWordCount(manuscript);
    const chapterAnalysisStats = getChapterAnalysisStats(project);
    const outlineParts = ensureOutlineParts(project);
    const chapterOptions = (manuscript?.chapters ?? []).map((chapter, index) => ({
      id: chapter.id,
      label: `${chapter.displayLabel ?? `第${index + 1}章`} ${chapter.title}`,
    }));
    const characterOptions = characters.map((character) => ({
      id: character.id,
      label: character.name,
    }));
    const chapterOptionMap = new Map(chapterOptions.map((option) => [option.id, option]));
    const characterOptionMap = new Map(characterOptions.map((option) => [option.id, option]));
    const editingOutlinePart = outlineParts.find((part) => part.id === editingOutlinePartId);
    const filteredChapterOptions = searchOutlineOptions(chapterOptions, outlinePartChapterQuery);
    const filteredCharacterOptions = searchOutlineOptions(characterOptions, outlinePartCharacterQuery);
    const editingManuscriptChapter = manuscript?.chapters.find(
      (chapter) => chapter.id === editingManuscriptChapterId,
    );

    return (
      <main className="worldConsole outlineConsole">
        <div className="worldConsoleGrid" aria-hidden="true" />
        <header className="worldConsoleHeader">
          <strong>Air to World</strong>
          <button onClick={() => setView("workspace")} type="button">
            返回
          </button>
        </header>

        <section className="outlineConsoleStage" aria-label="章纲管理">
          <aside className="outlineSideNav">
            {manuscriptModeTabs.map((tab) => (
              <button
                className={outlineMode === tab.mode ? "active" : ""}
                key={tab.mode}
                onClick={() => setOutlineMode(tab.mode)}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </aside>

          <section className={`manuscriptPanel ${outlineMode}`}>
            <div className="manuscriptPanelHeader">
              <div>
                <span>章纲管理</span>
                <h1>{project.title}</h1>
              </div>
              <div className="manuscriptPanelActions">
                {outlineMode === "preview" ? (
                  <>
                    <button
                      className="manuscriptUploadEntryButton"
                      onClick={() => {
                        setManuscriptUploadMode(null);
                        setIsManuscriptUploadOpen(true);
                      }}
                      type="button"
                    >
                      上传小说
                    </button>
                    <div className="chapterAnalysisModeActions">
                      <button
                        className="manuscriptUploadEntryButton"
                        disabled={isChapterAnalysisRunning || !manuscript?.chapters.length}
                        onClick={() => handleStartChapterAnalysis("fast")}
                        type="button"
                      >
                        快速解析全书
                      </button>
                      <button
                        className="manuscriptUploadEntryButton secondary"
                        disabled={
                          isChapterAnalysisRunning ||
                          !manuscript?.chapters.length ||
                          !selectedManuscriptChapterId
                        }
                        onClick={() => handleStartChapterAnalysis("full")}
                        title={
                          selectedManuscriptChapterId
                            ? "用完整结构化分析覆盖当前章节的快速结果"
                            : "请先在章节列表中选择要完整解析的章节"
                        }
                        type="button"
                      >
                        完整解析当前章
                      </button>
                    </div>
                    <button
                      className="chapterAnalysisImportButton"
                      disabled
                      title="一键导入候选资料后续开放"
                      type="button"
                    >
                      导入候选
                    </button>
                  </>
                ) : null}
                {outlineMode === "outline" ? (
                  <>
                    <button
                      className="manuscriptUploadEntryButton"
                      onClick={handleAddOutlinePart}
                      type="button"
                    >
                      新增分节
                    </button>
                    <button
                      className="chapterClearButton"
                      disabled={!selectedOutlinePartIds.length}
                      onClick={handleDeleteSelectedOutlineParts}
                      type="button"
                    >
                      删除内容
                    </button>
                  </>
                ) : null}
                {outlineMode === "chapters" && manuscript?.chapters.length ? (
                  <button
                    className="chapterClearButton"
                    onClick={handleClearAllChapters}
                    type="button"
                  >
                    清空章节
                  </button>
                ) : null}
                <strong>{wordCount} 字</strong>
              </div>
            </div>

            {outlineMode === "preview" ? (
              <div className="chapterAnalysisStatusPanel" aria-label="深度解析状态">
                <div>
                  <span>深度解析</span>
                  <strong>{chapterAnalysisStatus}</strong>
                  <small>
                    {chapterAnalysisStats.analyzedChapters}/{chapterAnalysisStats.totalChapters} 章
                    已解析
                    {chapterAnalysisStats.staleChapters
                      ? `，${chapterAnalysisStats.staleChapters} 章待更新`
                      : ""}
                  </small>
                  {isChapterAnalysisRunning || chapterAnalysisRunTotal ? (
                    <small>
                      {chapterAnalysisRunMode === "fast" ? "快速模式" : "完整模式"}｜完成 {chapterAnalysisRunCompleted}/
                      {chapterAnalysisRunTotal}｜进行中 {chapterAnalysisRunActive}｜失败 {chapterAnalysisFailures.length}｜跳过 {chapterAnalysisRunSkipped}
                    </small>
                  ) : null}
                </div>
                <div className="chapterAnalysisProgressTrack">
                  <span style={{ width: `${chapterAnalysisProgress}%` }} />
                </div>
                <small>
                  候选人物 {chapterAnalysisStats.candidateCharacters}｜候选线索{" "}
                  {chapterAnalysisStats.candidateClues}
                </small>
                {isChapterAnalysisRunning ? (
                  <button className="chapterClearButton" onClick={handleStopChapterAnalysis} type="button">
                    停止
                  </button>
                ) : null}
                {chapterAnalysisError ? <em>{chapterAnalysisError}</em> : null}
              </div>
            ) : null}

            {outlineMode === "chapters" ? (
              <div className="chapterNavigator" aria-label="章节列表">
                {manuscript?.chapters.length ? (
                  manuscript.chapters.map((chapter, index) => (
                    <article
                      className={
                        selectedManuscriptChapterId === chapter.id
                          ? "chapterNavigatorItem active"
                          : "chapterNavigatorItem"
                      }
                      key={chapter.id}
                    >
                      {chapter.sectionTitle ? <em>{chapter.sectionTitle}</em> : null}
                      <button
                        className="chapterNavigatorJump"
                        onClick={() => {
                          setSelectedManuscriptChapterId(chapter.id);
                          setOutlineMode("preview");
                        }}
                        type="button"
                      >
                        <span>{chapter.displayLabel ?? `第${index + 1}章`}</span>
                      </button>
                      <div className="chapterTitleControl">
                        {editingChapterId === chapter.id ? (
                          <input
                            autoFocus
                            className="chapterTitleEditInput"
                            onBlur={() => handleSaveChapterTitle(chapter.id)}
                            onChange={(event) => setChapterTitleEditDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                handleSaveChapterTitle(chapter.id);
                              }
                              if (event.key === "Escape") {
                                setEditingChapterId("");
                                setChapterTitleEditDraft("");
                              }
                            }}
                            value={chapterTitleEditDraft}
                          />
                        ) : (
                          <button
                            className="chapterTitleTextButton"
                            onClick={() => {
                              setSelectedManuscriptChapterId(chapter.id);
                              setOutlineMode("preview");
                            }}
                            type="button"
                          >
                            <strong>{chapter.title}</strong>
                          </button>
                        )}
                        <button
                          aria-label="修改章节标题"
                          className="chapterTitleEditButton"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => handleStartRenameChapter(chapter.id, chapter.title)}
                          type="button"
                        >
                          <span />
                        </button>
                      </div>
                      <button
                        aria-label={`删除章节 ${chapter.title}`}
                        className="chapterDeleteButton"
                        onClick={() => handleDeleteChapter(chapter.id, chapter.title)}
                        type="button"
                      >
                        <DeleteIcon />
                      </button>
                      <small>{chapter.content.replace(/\s/g, "").length} </small>
                    </article>
                  ))
                ) : (
                  <div className="manuscriptEmpty modeOnly">
                    <p>暂无章节。请先上传小说或手动上传章节</p>
                  </div>
                )}
              </div>
            ) : null}

            {outlineMode === "outline" ? (
              <div className="outlinePartsWorkspace">
                {outlineParts.length ? (
                  <div className="outlinePartList" aria-label="大纲分节列表">
                    {outlineParts.map((part, partIndex) => (
                      <article
                        className="outlinePartRow"
                        draggable
                        key={part.id}
                        onClick={() => openOutlinePartEditor(part.id)}
                        onDragEnd={() => setDraggedOutlinePartId("")}
                        onDragOver={(event) => {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                        }}
                        onDragStart={(event) => {
                          setDraggedOutlinePartId(part.id);
                          event.dataTransfer.setData("text/plain", part.id);
                          event.dataTransfer.effectAllowed = "move";
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          const sourcePartId =
                            event.dataTransfer.getData("text/plain") || draggedOutlinePartId;
                          handleMoveOutlinePart(sourcePartId, part.id);
                        }}
                      >
                        <div>
                          <span>PART {partIndex + 1}</span>
                          <strong>{part.title}</strong>
                        </div>
                        <small>关联章节数：{part.chapterIds.length}</small>
                        <small>关联角色数：{part.characterIds.length}</small>
                        <label
                          className="outlinePartCheck"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <input
                            checked={selectedOutlinePartIds.includes(part.id)}
                            onChange={(event) => {
                              setSelectedOutlinePartIds((currentIds) =>
                                event.target.checked
                                  ? [...currentIds, part.id]
                                  : currentIds.filter((selectedId) => selectedId !== part.id),
                              );
                            }}
                            type="checkbox"
                          />
                          <span />
                        </label>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="outlinePartsEmpty">
                    点击【新增分节】，从零开始创建你的大纲
                  </div>
                )}
              </div>
            ) : null}

            {manuscript?.chapters.length ? (
              <div className="manuscriptReader" ref={manuscriptReaderRef}>
                {manuscript.parseNote ? <p className="parseNote">{manuscript.parseNote}</p> : null}
                {manuscript.chapters.map((chapter) => (
                  <article
                    className="manuscriptChapter"
                    key={chapter.id}
                    ref={(element) => {
                      chapterPreviewRefs.current[chapter.id] = element;
                    }}
                  >
                    <header>
                      <div>
                        {chapter.sectionTitle ? <em>{chapter.sectionTitle}</em> : null}
                        <h2>{chapter.title}</h2>
                      </div>
                      <div className="manuscriptChapterActions">
                        <span>{chapter.content.replace(/\s/g, "").length} 字</span>
                        <button
                          aria-label={`编辑章节正文 ${chapter.title}`}
                          className="chapterTitleEditButton manuscriptChapterEditButton"
                          onClick={() => handleOpenChapterContentEditor(chapter.id)}
                          type="button"
                        >
                          <span />
                        </button>
                      </div>
                    </header>
                    <p>{chapter.content}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="manuscriptEmpty">
                <p>
                  文本占位符。上传小说后，会像 Word 文档一样在框内显示文本内容。                </p>
                {manuscript?.parseNote ? <small>{manuscript.parseNote}</small> : null}
              </div>
            )}
          </section>
        </section>

        {isChapterAnalysisFailureDialogOpen ? (
          <div className="modalBackdrop authBackdrop" role="presentation">
            <section
              aria-label="章节深度解析结果提示"
              aria-modal="true"
              className="recordDialog authDialog worldDialog chapterAnalysisFailureDialog"
              role="dialog"
            >
              <button
                aria-label="关闭章节深度解析结果提示"
                className="dialogCloseIcon"
                onClick={() => setIsChapterAnalysisFailureDialogOpen(false)}
                type="button"
              >
                ×
              </button>
              <div className="dialogHeader manuscriptEditHeader">
                <div>
                  <span className="eyebrow">深度解析</span>
                  <h2>解析结果提示</h2>
                </div>
                <button onClick={() => setIsChapterAnalysisFailureDialogOpen(false)} type="button">
                  关闭
                </button>
              </div>
              <p className="chapterAnalysisFailureHint">
                JSON 异常章节会优先修复，无法修复时会生成降级记忆并继续保存。只有硬失败章节会跳过，后续可再次点击【深度解析】重试。
              </p>
              <p className="chapterAnalysisFailureHint">
                可在AI功能中查看深度解析报告
              </p>
              <div className="chapterAnalysisFailureList">
                {!chapterAnalysisRecoveries.length && !chapterAnalysisFailures.length ? (
                  <article>
                    <strong>解析完成</strong>
                    <span>本次深度解析未发现需要额外处理的章节。</span>
                  </article>
                ) : null}
                {chapterAnalysisRecoveries.map((recovery, index) => (
                  <article key={`${recovery.chapterId ?? recovery.chapterTitle}-${recovery.mode}-${index}`}>
                    <strong>
                      {recovery.chapterTitle}
                      {recovery.mode === "repaired" ? "｜已修复" : "｜降级摘要"}
                    </strong>
                    <span>
                      {recovery.mode === "repaired"
                        ? "模型原始输出不是合法 JSON，已通过二次修复转为结构化记忆。"
                        : "模型结构化输出连续失败，已保存可用摘要记忆，建议人工复核。"}
                    </span>
                  </article>
                ))}
                {chapterAnalysisFailures.map((failure, index) => (
                  <article key={`${failure.chapterId ?? failure.chapterTitle}-${index}`}>
                    <strong>{failure.chapterTitle}｜已跳过</strong>
                    <span>{failure.error}</span>
                  </article>
                ))}
              </div>
            </section>
          </div>
        ) : null}

        {editingOutlinePart ? (
          <div className="modalBackdrop authBackdrop" role="presentation">
            <section
              aria-label={`编辑 PART ${outlineParts.indexOf(editingOutlinePart) + 1}`}
              aria-modal="true"
              className="recordDialog authDialog worldDialog outlinePartDialog"
              role="dialog"
            >
              <button
                aria-label="关闭大纲分节编辑"
                className="dialogCloseIcon"
                onClick={() => setEditingOutlinePartId("")}
                type="button"
              >
                ×
              </button>
              <div className="dialogHeader manuscriptEditHeader">
                <div>
                  <span className="eyebrow">大纲分节</span>
                  <h2>PART {outlineParts.indexOf(editingOutlinePart) + 1}</h2>
                </div>
                <button onClick={handleSaveOutlinePartEdit} type="button">
                  完成编辑
                </button>
              </div>

              <label className="fieldGroup">
                <span>命名</span>
                <input
                  onChange={(event) =>
                    setOutlinePartDraft((currentDraft) => ({
                      ...currentDraft,
                      title: event.target.value,
                    }))
                  }
                  placeholder="例如：入学测试"
                  value={outlinePartDraft.title}
                />
              </label>

              <label className="fieldGroup outlinePartPicker">
                <span>关联章节</span>
                <div className="outlineSelectedTags">
                  {outlinePartDraft.chapterIds.length ? (
                    outlinePartDraft.chapterIds.map((chapterId) => {
                      const option = chapterOptionMap.get(chapterId);
                      if (!option) {
                        return null;
                      }

                      return (
                        <button
                          key={chapterId}
                          onClick={() =>
                            setOutlinePartDraft((currentDraft) => ({
                              ...currentDraft,
                              chapterIds: currentDraft.chapterIds.filter(
                                (selectedChapterId) => selectedChapterId !== chapterId,
                              ),
                            }))
                          }
                          type="button"
                        >
                          {option.label} ×
                        </button>
                      );
                    })
                  ) : (
                    <small>暂未关联章节</small>
                  )}
                </div>
                <input
                  aria-label="搜索关联章节"
                  onChange={(event) => setOutlinePartChapterQuery(event.target.value)}
                  placeholder="搜索章节"
                  value={outlinePartChapterQuery}
                />
                <div className="outlineOptionList">
                  {filteredChapterOptions.length ? (
                    filteredChapterOptions.map((option) => {
                      const hasChapter = outlinePartDraft.chapterIds.includes(option.id);
                      return (
                        <button
                          className={hasChapter ? "selected" : ""}
                          key={option.id}
                          onClick={() =>
                            setOutlinePartDraft((currentDraft) => ({
                              ...currentDraft,
                              chapterIds: hasChapter
                                ? currentDraft.chapterIds.filter(
                                    (chapterId) => chapterId !== option.id,
                                  )
                                : [...currentDraft.chapterIds, option.id],
                            }))
                          }
                          type="button"
                        >
                          {option.label}
                        </button>
                      );
                    })
                  ) : (
                    <p>没有匹配到章节</p>
                  )}
                </div>
              </label>

              <label className="fieldGroup outlinePartPicker">
                <span>关联角色</span>
                <div className="outlineSelectedTags">
                  {outlinePartDraft.characterIds.length ? (
                    outlinePartDraft.characterIds.map((characterId) => {
                      const option = characterOptionMap.get(characterId);
                      if (!option) {
                        return null;
                      }

                      return (
                        <button
                          key={characterId}
                          onClick={() =>
                            setOutlinePartDraft((currentDraft) => ({
                              ...currentDraft,
                              characterIds: currentDraft.characterIds.filter(
                                (selectedCharacterId) => selectedCharacterId !== characterId,
                              ),
                            }))
                          }
                          type="button"
                        >
                          {option.label} ×
                        </button>
                      );
                    })
                  ) : (
                    <small>暂未关联角色</small>
                  )}
                </div>
                <input
                  aria-label="搜索关联角色"
                  onChange={(event) => setOutlinePartCharacterQuery(event.target.value)}
                  placeholder="搜索角色"
                  value={outlinePartCharacterQuery}
                />
                <div className="outlineOptionList">
                  {filteredCharacterOptions.length ? (
                    filteredCharacterOptions.map((option) => {
                      const hasCharacter = outlinePartDraft.characterIds.includes(option.id);
                      return (
                        <button
                          className={hasCharacter ? "selected" : ""}
                          key={option.id}
                          onClick={() =>
                            setOutlinePartDraft((currentDraft) => ({
                              ...currentDraft,
                              characterIds: hasCharacter
                                ? currentDraft.characterIds.filter(
                                    (characterId) => characterId !== option.id,
                                  )
                                : [...currentDraft.characterIds, option.id],
                            }))
                          }
                          type="button"
                        >
                          {option.label}
                        </button>
                      );
                    })
                  ) : (
                    <p>没有匹配到角色</p>
                  )}
                </div>
              </label>

              <label className="fieldGroup">
                <span>简介</span>
                <textarea
                  onChange={(event) =>
                    setOutlinePartDraft((currentDraft) => ({
                      ...currentDraft,
                      summary: event.target.value,
                    }))
                  }
                  placeholder="写下这一部分承担的剧情作用、冲突推进和关键转折。"
                  rows={8}
                  value={outlinePartDraft.summary}
                />
              </label>
            </section>
          </div>
        ) : null}

        {isManuscriptUploadOpen ? (
          <div className="modalBackdrop authBackdrop" role="presentation">
            <section
              aria-label="上传小说"
              aria-modal="true"
              className="recordDialog authDialog worldDialog manuscriptUploadDialog"
              role="dialog"
            >
              <button
                aria-label="关闭上传弹窗"
                className="dialogCloseIcon"
                onClick={() => {
                  setIsManuscriptUploadOpen(false);
                  setManuscriptUploadMode(null);
                }}
                type="button"
              >
                ×
              </button>
              <div className="dialogHeader">
                <div>
                  <span className="eyebrow">上传小说文本</span>
                  <h2>选择上传方式</h2>
                </div>
              </div>

              {!manuscriptUploadMode ? (
                <div className="uploadModeGrid">
                  <label>
                    整本上传
                    <small>选择 DOC、DOCX 或 TXT，TXT 会立即解析为正文</small>
                    <input
                      accept=".doc,.docx,.txt"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          handleWholeManuscriptUpload(file);
                          event.target.value = "";
                        }
                      }}
                      type="file"
                    />
                  </label>
                  <button onClick={() => setManuscriptUploadMode("chapter")} type="button">
                    章节上传
                    <small>先手动填入章节标题和正文，后续可继续追加章节</small>
                  </button>
                </div>
              ) : (
                <div className="chapterUploadForm">
                  <label className="fieldGroup">
                    <span>章节标题</span>
                    <input
                      onChange={(event) => setChapterTitleDraft(event.target.value)}
                      placeholder="例如：第一章 雾都醒来"
                      value={chapterTitleDraft}
                    />
                  </label>
                  <label className="fieldGroup">
                    <span>章节正文</span>
                    <textarea
                      onChange={(event) => setChapterContentDraft(event.target.value)}
                      placeholder="把本章正文粘贴到这里，或从 TXT 文件导入。"
                      rows={9}
                      value={chapterContentDraft}
                    />
                  </label>
                  <div className="chapterUploadActions">
                    <label>
                      从文件导入                      <input
                        accept=".doc,.docx,.txt"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) {
                            handleChapterFileImport(file);
                            event.target.value = "";
                          }
                        }}
                        type="file"
                      />
                    </label>
                    <button onClick={handleSaveChapterUpload} type="button">
                      保存章节
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        ) : null}

        {editingManuscriptChapter ? (
          <div className="modalBackdrop authBackdrop" role="presentation">
            <section
              aria-label="编辑章节正文"
              aria-modal="true"
              className="recordDialog authDialog worldDialog manuscriptEditDialog"
              role="dialog"
            >
              <button
                aria-label="关闭正文编辑"
                className="dialogCloseIcon"
                onClick={handleCloseChapterContentEditor}
                type="button"
              >
                ×
              </button>
              <div className="dialogHeader manuscriptEditHeader">
                <div>
                  <span className="eyebrow">章节正文编辑</span>
                  <h2>{editingManuscriptChapter.title}</h2>
                </div>
              </div>

              <label className="fieldGroup manuscriptEditField">
                <span>正文内容</span>
                <textarea
                  ref={manuscriptEditorTextareaRef}
                  className="manuscriptContentEditor"
                  onChange={(event) => setManuscriptContentEditDraft(event.target.value)}
                  value={manuscriptContentEditDraft}
                />
              </label>

              <div className="dialogFooter manuscriptEditFooter">
                <button onClick={handleCloseChapterContentEditor} type="button">
                  关闭
                </button>
                <button
                  aria-label="保存正文"
                  className="manuscriptSaveIconButton"
                  onClick={handleSaveChapterContent}
                  type="button"
                >
                  <span />
                  保存
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {isManuscriptDiscardDialogOpen ? (
          <div className="modalBackdrop authBackdrop manuscriptDiscardBackdrop" role="presentation">
            <section
              aria-label="未保存修改确认"
              aria-modal="true"
              className="recordDialog authDialog worldDialog manuscriptDiscardDialog"
              role="dialog"
            >
              <button
                aria-label="关闭未保存确认"
                className="dialogCloseIcon"
                onClick={() => setIsManuscriptDiscardDialogOpen(false)}
                type="button"
              >
                ×
              </button>
              <div className="dialogHeader manuscriptEditHeader">
                <div>
                  <span className="eyebrow">未保存修改</span>
                  <h2>是否放弃本次编辑？</h2>
                </div>
              </div>
              <p className="manuscriptDiscardText">
                当前正文有未保存修改。继续退出会丢弃这次编辑内容。
              </p>
              <div className="dialogFooter manuscriptEditFooter">
                <button onClick={() => setIsManuscriptDiscardDialogOpen(false)} type="button">
                  继续编辑
                </button>
                <button onClick={handleDiscardChapterContentEdit} type="button">
                  放弃修改
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </main>
    );
  }

  return (
    <main className="workspace">
      {recordDialog ? (
        <RecordDialog
          dialog={recordDialog}
          images={
            recordDialog.mode === "edit"
              ? project.records.find((record) => record.id === recordDialog.record.id)
                  ?.images
              : []
          }
          onChange={setRecordDialog}
          onClose={() => setRecordDialog(null)}
          onDeleteImage={(imageId) => {
            if (recordDialog.mode === "edit") {
              handleDeleteImage(recordDialog.record.id, imageId);
            }
          }}
          onSave={handleSaveRecordDialog}
        />
      ) : null}
      <aside className="sidebar">
        <div className="brandBlock">
          <button
            className="backToLibrary"
            onClick={() => {
              setLoginVideoEnded(false);
              setView("login");
            }}
            type="button"
          >
            返回航班
          </button>
          <h1>{project.title}</h1>
        </div>

        <section className="projectShelf" aria-label="小说管理">
          <div className="shelfHeader">
            <span>我的小说</span>
            <strong>{projects.length}</strong>
          </div>
          <div className="projectList">
            {projects.map((item) => (
              <button
                className={item.id === project.id ? "projectButton active" : "projectButton"}
                key={item.id}
                onClick={() => setActiveProjectId(item.id)}
                type="button"
              >
                <span>{item.title}</span>
                <small>{item.records.length} 条资</small>
              </button>
            ))}
          </div>
          <div className="projectForm">
            <input
              aria-label="新小说标题"
              onChange={(event) => setNewProjectTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  handleAddProject();
                }
              }}
              placeholder="新小说标题"
              value={newProjectTitle}
            />
            <button onClick={handleAddProject} type="button">
              新增小说
            </button>
          </div>
          <div className="projectActions">
            <button onClick={handleRenameProject} type="button">
              修改小说标题
            </button>
            <button onClick={handleDeleteProject} type="button">
              删除小说
            </button>
          </div>
        </section>

        <nav className="navList" aria-label="作品资料分类">
          {Object.entries(typeLabels).map(([type, label]) => (
            <a href={`#${type}`} key={type}>
              <span>{label}</span>
              <strong>{stats.byType[type as KnowledgeType]}</strong>
            </a>
          ))}
        </nav>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <span className="eyebrow">作品总览</span>
            <h2>资料库作为长期连载底</h2>
          </div>
          <div className="searchShell">
            <span>搜索</span>
            <input aria-label="搜索资料" placeholder="人物、地点、物品、伏笔..." />
          </div>
        </header>

        <section className="summaryBand">
          <div>
            <span>资料总数</span>
            <strong>{stats.totalRecords}</strong>
          </div>
          <div>
            <span>未回收伏</span>
            <strong>{stats.openForeshadowing}</strong>
          </div>
          <div>
            <span>目标字数</span>
            <strong>{(project.targetWordCount / 10000).toFixed(0)} 万</strong>
          </div>
        </section>

        <section className="overviewText">
          <h2>{project.synopsis}</h2>
          <p>
            第一版聚焦手动维护可信资料库。AI 解析、续写和一致性检查已预留服务边界，后续可基于这些结构化资料平滑接入。          </p>
        </section>

        {Object.entries(typeLabels).map(([type, label]) => (
          <div id={type} key={type}>
            <RecordList
              title={label}
              type={type as KnowledgeType}
              records={searchKnowledge(project, "", type as KnowledgeType)}
              selectedRecordId={selectedRecord?.id}
              onAdd={handleAddRecord}
              onDelete={handleDeleteRecord}
              onEdit={handleEditRecord}
              onSelect={(record) => setSelectedRecordId(record.id)}
              onUploadImage={handleUploadImage}
            />
          </div>
        ))}
      </section>

      <aside className="contextPane">
        <section className="panel">
          <div className="sectionHeader">
            <h2>当前资料</h2>
            <span>{selectedRecord ? typeLabels[selectedRecord.type] : "空"}</span>
          </div>
          {selectedRecord ? (
            <>
              <h3 className="focusTitle">{selectedRecord.name}</h3>
              <p>{selectedRecord.summary}</p>
              <div className="imageGallery">
                {(selectedRecord.images ?? []).length === 0 ? (
                  <div className="emptyState">这条资料还没有上传图片</div>
                ) : (
                  selectedRecord.images?.map((image) => (
                    <figure
                      key={image.id}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        handleDeleteImage(selectedRecord.id, image.id);
                      }}
                      title="右键删除图片"
                    >
                      <img alt={image.name} src={image.url} />
                      <figcaption>{image.name}</figcaption>
                    </figure>
                  ))
                )}
              </div>
              <div className="relationList">
                {relatedRecords.map((record) => (
                  <div key={record.id}>
                    <span>{typeLabels[record.type]}</span>
                    <strong>{record.name}</strong>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p>这本小说还没有资料。先新增人物、地点或物品，后续 AI 也会基于这些资料工作</p>
          )}
        </section>

        <section className="panel">
          <div className="sectionHeader">
            <h2>近期时间</h2>
            <span>{timeline.length} </span>
          </div>
          {timeline.length === 0 ? (
            <p>暂无时间线事件</p>
          ) : (
            timeline.map((event) => (
              <div className="timelineItem" key={event.id}>
                <strong>{event.name}</strong>
                <p>{event.summary}</p>
              </div>
            ))
          )}
        </section>

        <section className="panel">
          <div className="sectionHeader">
            <h2>伏笔状</h2>
            <span>{openClues.length} 未回</span>
          </div>
          {openClues.length === 0 ? (
            <p>暂无未回收伏笔</p>
          ) : (
            openClues.map((clue) => (
              <div className="clueItem" key={clue.id}>
                <strong>{clue.name}</strong>
                <p>{clue.summary}</p>
              </div>
            ))
          )}
        </section>

        <section className="panel">
          <div className="sectionHeader">
            <h2>AI 能力预留</h2>
            <span>API Ready</span>
          </div>
          <div className="aiTaskList">
            {reservedAiTasks.map((task) => (
              <button className="aiTask" disabled key={task.type} type="button">
                <span>
                  <strong>{task.title}</strong>
                  <small>{task.description}</small>
                </span>
                <em>{task.statusLabel}</em>
              </button>
            ))}
          </div>
        </section>
      </aside>
    </main>
  );
}



