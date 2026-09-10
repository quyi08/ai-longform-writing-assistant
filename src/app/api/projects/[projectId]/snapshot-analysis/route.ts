import type { Project, SnapshotAnalysisFailureKind, SnapshotFactKind, SnapshotRecoveryBatch } from "@/lib/knowledge";
import { getAiProviderConfig } from "@/lib/ai-config";
import { completeOpenAiCompatibleChat, type ChatMessage, type CompleteOpenAiCompatibleOptions } from "@/lib/openai-compatible";
import { withDatabaseClient } from "@/lib/server/db";
import { listProjects, saveProjectSnapshot } from "@/lib/server/project-repository";
import { createSnapshotRecoveryChildren, getPendingSnapshotAnalysisBatches, getSnapshotAnalysisCharacterBudget, mergeSnapshotDirectory, type SnapshotDirectoryInput, type SnapshotPendingAnalysisBatch } from "@/lib/snapshot-analysis";

type SnapshotAnalysisDeps = {
  loadProject?: () => Promise<Project | undefined>;
  saveProject?: (project: Project) => Promise<Project>;
  completeChat?: (messages: ChatMessage[], options?: CompleteOpenAiCompatibleOptions) => Promise<string>;
  wait?: (milliseconds: number) => Promise<void>;
};

const directoryOutputOptions: CompleteOpenAiCompatibleOptions = {
  temperature: 0.1,
  maxTokens: 2_400,
  responseFormat: "json_object",
};

const compactDirectoryOutputOptions: CompleteOpenAiCompatibleOptions = {
  temperature: 0.1,
  maxTokens: 1_200,
  responseFormat: "json_object",
};

const singleChapterDirectoryOutputOptions: CompleteOpenAiCompatibleOptions = {
  temperature: 0.1,
  maxTokens: 500,
  responseFormat: "json_object",
};

const directoryRepairOutputOptions: CompleteOpenAiCompatibleOptions = {
  temperature: 0,
  maxTokens: 600,
};

const MAX_REPAIRABLE_DIRECTORY_OUTPUT_CHARS = 1_800;

const structuredOutputSupport = new Map<string, boolean>();

function isRetryableProviderError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /provider request failed before response|fetch failed|ECONNRESET|ETIMEDOUT|ENETUNREACH|status (429|502|503|504)/i.test(message);
}

function isUnsupportedStructuredOutputError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  // This branch only runs immediately after we attached response_format, so an otherwise opaque 400 is
  // treated as a compatibility miss once; any remaining bad request still surfaces normally.
  return /status 400/i.test(message);
}

function classifySnapshotAnalysisError(error: unknown): SnapshotAnalysisFailureKind {
  const message = error instanceof Error ? error.message : String(error);
  if (isRetryableProviderError(error)) return "network";
  if (isUnsupportedStructuredOutputError(error)) return "provider_format_unsupported";
  if (/finish_reason=length|truncated|length/i.test(message)) return "truncated";
  if (/JSON|characters 数组/i.test(message)) return /缺少 characters 数组|schema/i.test(message) ? "schema_invalid" : "json_syntax";
  if (/chapterId|quote|证据/i.test(message)) return "evidence_invalid";
  return "unknown";
}

function buildRecoveryBatch(
  batch: SnapshotPendingAnalysisBatch,
  existingRecovery?: SnapshotRecoveryBatch,
): SnapshotRecoveryBatch | undefined {
  const children = createSnapshotRecoveryChildren(batch);
  if (!children.length) return undefined;
  if (batch.mode !== "compact" || !existingRecovery) {
    return { parentBatchId: batch.parentBatchId, children };
  }
  return {
    ...existingRecovery,
    children: existingRecovery.children.flatMap((child) => child.id === batch.id ? children : [child]),
  };
}

function withoutStructuredOutput(options: CompleteOpenAiCompatibleOptions): CompleteOpenAiCompatibleOptions {
  const { responseFormat: _responseFormat, ...rest } = options;
  return rest;
}

async function completeDirectoryBatch(
  complete: (messages: ChatMessage[], options?: CompleteOpenAiCompatibleOptions) => Promise<string>,
  messages: ChatMessage[],
  wait: (milliseconds: number) => Promise<void>,
  options: CompleteOpenAiCompatibleOptions = directoryOutputOptions,
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return { output: await complete(messages, options), attempt };
    } catch (error) {
      lastError = error;
      if (!isRetryableProviderError(error) || attempt === 3) break;
      await wait(attempt * 700);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("人物目录模型调用失败。");
}

async function loadDatabaseProject(projectId: string) {
  return withDatabaseClient(async (client) => (await listProjects(client)).find((project) => project.id === projectId));
}

async function saveDatabaseProject(project: Project) {
  return withDatabaseClient((client) => saveProjectSnapshot(client, project));
}

function extractDirectoryJson(output: string) {
  const withoutFence = output.trim().replace(/^```(?:json)?\s*|\s*```$/gi, "").trim();
  const objectStart = withoutFence.indexOf("{");
  const objectEnd = withoutFence.lastIndexOf("}");
  return objectStart >= 0 && objectEnd > objectStart
    ? withoutFence.slice(objectStart, objectEnd + 1)
    : withoutFence;
}

function parseDirectoryOutput(output: string, chapterIdSet: Set<string>, chapterIndexById: Map<string, number>): SnapshotDirectoryInput[] {
  const parsed = JSON.parse(extractDirectoryJson(output)) as { characters?: unknown };
  if (!Array.isArray(parsed.characters)) {
    throw new Error("人物目录 JSON 缺少 characters 数组。");
  }
  return parsed.characters.flatMap((character): SnapshotDirectoryInput[] => {
    if (!character || typeof character !== "object") return [];
    const candidate = character as { name?: unknown; aliases?: unknown; stableFacts?: unknown };
    const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
    if (!name) return [];
    const aliases = Array.isArray(candidate.aliases) ? candidate.aliases.filter((item): item is string => typeof item === "string") : [];
    const stableFacts = (Array.isArray(candidate.stableFacts) ? candidate.stableFacts : []).flatMap((fact) => {
      if (!fact || typeof fact !== "object") return [];
      const input = fact as { kind?: unknown; value?: unknown; quote?: unknown; chapterId?: unknown };
      const kind = typeof input.kind === "string" && ["identity", "relationship", "abilityLimit", "secretConflict", "recentState", "nextGoal", "transient"].includes(input.kind)
        ? input.kind as SnapshotFactKind
        : undefined;
      const chapterId = typeof input.chapterId === "string" ? input.chapterId : "";
      const value = typeof input.value === "string" ? input.value.trim() : "";
      const quote = typeof input.quote === "string" ? input.quote.trim() : "";
      const chapterIndex = chapterIndexById.get(chapterId);
      if (!value || !quote || !chapterIndex || !chapterIdSet.has(chapterId)) return [];
      return [{ kind, value, evidence: [{ chapterId, chapterIndex, quote, sourceType: "chapter" as const }] }];
    });
    const evidence = stableFacts.flatMap((fact) => fact.evidence);
    return evidence.length ? [{ name, aliases, evidence, stableFacts }] : [];
  });
}

function createDirectoryJsonRepairMessages(output: string): ChatMessage[] {
  return [{
    role: "system",
    content: "你是 JSON 格式修复器。只修复 JSON 语法，不得增删、改写或推断任何人物事实。只输出合法 JSON，不要 Markdown 或说明。",
  }, {
    role: "user",
    content: `仅修复以下 JSON 的格式，使其符合 { characters: [{ name, aliases, stableFacts: [{ kind, value, quote, chapterId }] }] }。保留原有字段和值；若无法修复，返回 {"repairable":false}。\n\n待修复内容：\n${output}`,
  }];
}

async function parseDirectoryOutputWithRepair(
  output: string,
  chapterIdSet: Set<string>,
  chapterIndexById: Map<string, number>,
  complete: (messages: ChatMessage[], options?: CompleteOpenAiCompatibleOptions) => Promise<string>,
  wait: (milliseconds: number) => Promise<void>,
) {
  try {
    return parseDirectoryOutput(output, chapterIdSet, chapterIndexById);
  } catch (initialError) {
    if (output.length > MAX_REPAIRABLE_DIRECTORY_OUTPUT_CHARS) {
      const initialMessage = initialError instanceof Error ? initialError.message : "unknown JSON error";
      throw new Error(`人物目录 JSON 输出过长，跳过短修复并进入拆分恢复：${initialMessage}`);
    }
    const { output: repairedOutput } = await completeDirectoryBatch(
      complete,
      createDirectoryJsonRepairMessages(output),
      wait,
      directoryRepairOutputOptions,
    );
    try {
      return parseDirectoryOutput(repairedOutput, chapterIdSet, chapterIndexById);
    } catch (repairError) {
      const initialMessage = initialError instanceof Error ? initialError.message : "unknown JSON error";
      const repairMessage = repairError instanceof Error ? repairError.message : "unknown repair error";
      throw new Error(`人物目录 JSON 修复失败（初始：${initialMessage}；修复后：${repairMessage}）。`);
    }
  }
}

function createDirectoryMessages(project: Project, chapterIds: string[], mode: SnapshotPendingAnalysisBatch["mode"] = "standard"): ChatMessage[] {
  const chapters = (project.manuscript?.chapters ?? []).filter((chapter) => chapterIds.includes(chapter.id));
  const compact = mode === "compact";
  const singleChapterRecovery = compact && chapters.length === 1;
  const maxPeople = singleChapterRecovery ? 3 : compact ? 6 : 12;
  const maxFacts = singleChapterRecovery ? 1 : compact ? 1 : 2;
  const maxQuoteLength = singleChapterRecovery ? 40 : compact ? 50 : 80;
  return [{
    role: "system",
    content: "你是中文小说人物目录抽取器。只输出合法 JSON，绝不补充正文未明示的事实。",
  }, {
    role: "user",
    content: [
      `返回 { characters: [{ name, aliases, stableFacts: [{ kind, value, quote, chapterId }] }] }。最多 ${maxPeople} 人；每人最多 ${maxFacts} 条 stableFacts；每条 quote 不超过 ${maxQuoteLength} 字。${singleChapterRecovery ? "这是单章最终兜底：只提取能逐字引用验证的稳定人物事实；没有时必须返回 {\"characters\":[]}，不得输出解释、Markdown 或额外字段。" : compact ? "这是格式恢复批次，只保留最确定的事实。" : ""}`,
      "kind 只能是 identity（身份/明确别名）、relationship（核心关系/阵营）、abilityLimit（能力或限制）、secretConflict（秘密/长期冲突）、recentState（当前状态）、nextGoal（正文明确的下一目标）、transient（一次性动作/情绪/路人信息）。",
      "每个 stableFacts 的 quote 必须逐字来自所给正文，chapterId 必须是给定章节 ID。不要输出第一人称‘我’的标准身份推断；无法确定类别时使用 transient。",
      ...chapters.map((chapter) => `章节 ID：${chapter.id}\n标题：${chapter.title}\n正文：${chapter.content}`),
    ].join("\n\n"),
  }];
}

function getPendingBatchesForAnalysis(
  chapters: NonNullable<Project["manuscript"]>["chapters"],
  analysis: NonNullable<Project["evaluationSnapshot"]>["analysis"],
) {
  const characterBudget = getSnapshotAnalysisCharacterBudget(
    chapters,
    analysis.completedBatchIds,
    analysis.recoveryBatches ?? [],
  );
  return getPendingSnapshotAnalysisBatches(
    chapters,
    analysis.completedBatchIds,
    analysis.recoveryBatches ?? [],
    characterBudget,
  );
}

export async function createSnapshotAnalysisResponse(
  projectId: string,
  request: Request,
  deps: SnapshotAnalysisDeps = {},
): Promise<Response> {
  const loadProject = deps.loadProject ?? (() => loadDatabaseProject(projectId));
  const project = await loadProject();
  if (!project) return Response.json({ error: "作品不存在。" }, { status: 404 });
  if (!project.evaluationSnapshot) {
    return Response.json({ error: "当前作品不是评测快照。" }, { status: 400 });
  }

  if (request.method === "GET") {
    return Response.json({ projectId, analysis: project.evaluationSnapshot.analysis });
  }
  if (request.method !== "POST") {
    return Response.json({ error: "不支持的请求方法。" }, { status: 405 });
  }

  const body = await request.json().catch(() => ({})) as { action?: string };
  if (body.action === "runBatch") {
    const batchId = typeof (body as { batchId?: unknown }).batchId === "string" ? (body as { batchId: string }).batchId : "";
    const chapters = project.manuscript?.chapters ?? [];
    const batches = getPendingBatchesForAnalysis(chapters, project.evaluationSnapshot.analysis);
    const batch = batches.find((item) => item.id === batchId);
    if (!batch) return Response.json({ error: "解析批次不存在或已完成。" }, { status: 400 });
    try {
      const providerConfig = deps.completeChat ? undefined : getAiProviderConfig(process.env, "characterAuditor");
      const complete = deps.completeChat ?? ((messages: ChatMessage[], options?: CompleteOpenAiCompatibleOptions) => completeOpenAiCompatibleChat(providerConfig!, messages, options));
      const wait = deps.wait ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
      const providerKey = providerConfig ? `${providerConfig.baseUrl}|${providerConfig.model}` : "injected-character-auditor";
      const requestedOptions = batch.mode === "compact"
        ? batch.chapterIds.length === 1 ? singleChapterDirectoryOutputOptions : compactDirectoryOutputOptions
        : directoryOutputOptions;
      const useStructuredOutput = structuredOutputSupport.get(providerKey) !== false;
      let output: string;
      try {
        ({ output } = await completeDirectoryBatch(
          complete,
          createDirectoryMessages(project, batch.chapterIds, batch.mode),
          wait,
          useStructuredOutput ? requestedOptions : withoutStructuredOutput(requestedOptions),
        ));
      } catch (error) {
        if (!useStructuredOutput || !isUnsupportedStructuredOutputError(error)) throw error;
        structuredOutputSupport.set(providerKey, false);
        ({ output } = await completeDirectoryBatch(
          complete,
          createDirectoryMessages(project, batch.chapterIds, batch.mode),
          wait,
          withoutStructuredOutput(requestedOptions),
        ));
      }
      const indexById = new Map(chapters.map((chapter, index) => [chapter.id, index + 1]));
      const inputs = await parseDirectoryOutputWithRepair(
        output,
        new Set(batch.chapterIds),
        indexById,
        complete,
        wait,
      );
      const updatedRecoveryBatches = (project.evaluationSnapshot.analysis.recoveryBatches ?? []).map((recovery) => recovery.parentBatchId !== batch.parentBatchId
        ? recovery
        : {
            ...recovery,
            children: recovery.children.map((child) => child.id === batch.id ? { ...child, status: "completed" as const, error: undefined } : child),
          });
      const activeRecovery = updatedRecoveryBatches.find((recovery) => recovery.parentBatchId === batch.parentBatchId);
      const parentRecovered = batch.mode === "compact" && activeRecovery?.children.every((child) => child.status === "completed");
      const completedBatchIds = batch.mode === "standard" || parentRecovered
        ? [...project.evaluationSnapshot.analysis.completedBatchIds, batch.parentBatchId]
        : project.evaluationSnapshot.analysis.completedBatchIds;
      const failedBatches = project.evaluationSnapshot.analysis.failedBatches.filter((item) => item.batchId !== batch.parentBatchId);
      if (batch.mode === "compact" && !parentRecovered) {
        failedBatches.push({ batchId: batch.parentBatchId, error: "正在处理紧凑恢复子批次。", kind: "json_syntax", recoveryStage: "compact" });
      }
      const nextProject: Project = {
        ...project,
        evaluationSnapshot: {
          ...project.evaluationSnapshot,
          analysis: {
            ...project.evaluationSnapshot.analysis,
            completedBatchIds,
            failedBatches,
            directory: mergeSnapshotDirectory(project.evaluationSnapshot.analysis.directory, inputs),
            recoveryBatches: parentRecovered
              ? updatedRecoveryBatches.filter((recovery) => recovery.parentBatchId !== batch.parentBatchId)
              : updatedRecoveryBatches,
            status: "indexing",
          },
        },
      };
      const save = deps.saveProject ?? saveDatabaseProject;
      await save(nextProject);
      const savedAnalysis = nextProject.evaluationSnapshot!.analysis;
      const remaining = getPendingBatchesForAnalysis(nextProject.manuscript?.chapters ?? [], savedAnalysis);
      return Response.json({ projectId, analysis: savedAnalysis, nextBatch: remaining[0] ?? null });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "人物目录解析失败。";
      const kind = classifySnapshotAnalysisError(error);
      const existingRecovery = project.evaluationSnapshot.analysis.recoveryBatches?.find((item) => item.parentBatchId === batch.parentBatchId);
      const recovery = (kind === "json_syntax" || kind === "schema_invalid" || kind === "truncated")
        ? buildRecoveryBatch(batch, existingRecovery)
        : undefined;
      const recoveryBatches = recovery
        ? [
            ...(project.evaluationSnapshot.analysis.recoveryBatches ?? []).filter((item) => item.parentBatchId !== batch.parentBatchId),
            recovery,
          ]
        : project.evaluationSnapshot.analysis.recoveryBatches ?? [];
      const nextProject: Project = {
        ...project,
        evaluationSnapshot: {
          ...project.evaluationSnapshot,
          analysis: {
            ...project.evaluationSnapshot.analysis,
            status: "indexing",
            failedBatches: [
              ...project.evaluationSnapshot.analysis.failedBatches.filter((item) => item.batchId !== batch.parentBatchId),
              { batchId: batch.parentBatchId, error: errorMessage, kind, recoveryStage: recovery ? "compact" : batch.mode === "compact" ? "compact" : "primary" },
            ],
            recoveryBatches,
          },
        },
      };
      await (deps.saveProject ?? saveDatabaseProject)(nextProject);
      return Response.json({
        error: errorMessage,
        batchId: batch.id,
        retryable: isRetryableProviderError(error),
        pendingBatches: recovery ? getPendingBatchesForAnalysis(chapters, nextProject.evaluationSnapshot!.analysis).filter((item) => item.parentBatchId === batch.parentBatchId) : [],
      }, { status: 502 });
    }
  }
  if (body.action !== "start" && body.action !== "retryFailed") {
    return Response.json({ error: "暂不支持此快照解析操作。" }, { status: 400 });
  }

  const chapters = project.manuscript?.chapters ?? [];
  if (!chapters.length) return Response.json({ error: "评测快照没有可解析章节。" }, { status: 400 });
  const legacyUnclassifiedDirectory = project.evaluationSnapshot.analysis.directory.some((entry) =>
    entry.stableFacts.some((fact) => !fact.kind),
  );
  const completedBatchIds = legacyUnclassifiedDirectory ? [] : project.evaluationSnapshot.analysis.completedBatchIds;
  const allPendingBatches = getPendingBatchesForAnalysis(chapters, {
    ...project.evaluationSnapshot.analysis,
    completedBatchIds,
  });
  const failedBatchIds = new Set(project.evaluationSnapshot.analysis.failedBatches.map((item) => item.batchId));
  const batches = body.action === "retryFailed"
    ? allPendingBatches.filter((item) => failedBatchIds.has(item.parentBatchId))
    : allPendingBatches;
  if (body.action === "retryFailed" && !batches.length) {
    return Response.json({ error: "当前没有可重试的失败批次。" }, { status: 400 });
  }
  const nextProject: Project = {
    ...project,
    evaluationSnapshot: {
      ...project.evaluationSnapshot,
      analysis: {
        ...project.evaluationSnapshot.analysis,
        completedBatchIds,
        failedBatches: legacyUnclassifiedDirectory ? [] : project.evaluationSnapshot.analysis.failedBatches,
        directory: legacyUnclassifiedDirectory ? [] : project.evaluationSnapshot.analysis.directory,
        recoveryBatches: legacyUnclassifiedDirectory ? [] : project.evaluationSnapshot.analysis.recoveryBatches ?? [],
        recentChapterIds: legacyUnclassifiedDirectory ? [] : (project.evaluationSnapshot.analysis.recentChapterIds.length ? project.evaluationSnapshot.analysis.recentChapterIds : chapters.slice(-5).map((chapter) => chapter.id)),
        candidates: batches.length ? [] : project.evaluationSnapshot.analysis.candidates,
        status: batches.length ? "indexing" : "recent_analysis",
      },
    },
  };
  const save = deps.saveProject ?? saveDatabaseProject;
  await save(nextProject);
  const savedAnalysis = nextProject.evaluationSnapshot!.analysis;
  return Response.json({
    projectId,
    analysis: savedAnalysis,
    nextBatch: batches[0] ?? null,
    pendingBatches: batches,
    restartedLegacyDirectory: legacyUnclassifiedDirectory,
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  return createSnapshotAnalysisResponse((await params).projectId, request);
}

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  return createSnapshotAnalysisResponse((await params).projectId, request);
}
