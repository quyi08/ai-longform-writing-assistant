import { getAiProviderConfig } from "@/lib/ai-config";
import {
  getChaptersNeedingAnalysis,
  normalizeChapterAnalysis,
} from "@/lib/chapter-analysis";
import type { Project, ManuscriptChapter } from "@/lib/knowledge";
import { normalizeAnalysisCharacterIdentities } from "@/lib/character-identity";
import { streamOpenAiCompatibleChat, type ChatMessage } from "@/lib/openai-compatible";

type AnalyzeChaptersRequestBody = {
  project?: Project;
  chapterIds?: string[];
  force?: boolean;
  maxChapters?: number;
  mode?: AnalysisMode;
};

type AnalysisMode = "fast" | "full";

type StreamChat = typeof streamOpenAiCompatibleChat;

type AnalyzeChaptersRouteDeps = {
  env?: Record<string, string | undefined>;
  streamChat?: StreamChat;
};

type ChapterAnalysisFailure = {
  chapterId: string;
  chapterTitle: string;
  error: string;
};

type ChapterAnalysisRecovery = {
  chapterId: string;
  chapterTitle: string;
  mode: "repaired" | "degraded";
  reason: string;
};

const encoder = new TextEncoder();

function jsonLine(value: unknown) {
  return encoder.encode(`${JSON.stringify(value)}\n`);
}

function getAnalysisConfigs(env: Record<string, string | undefined>) {
  const configs = [];

  try {
    configs.push(getAiProviderConfig(env, "summary"));
  } catch {
    // Summary is optional for the first MVP; writer can still do light analysis.
  }

  try {
    const writerConfig = getAiProviderConfig(env, "writer");
    if (!configs.some((config) => config.purpose === writerConfig.purpose)) {
      configs.push(writerConfig);
    }
  } catch {
    // Keep the original missing-config error path below when no provider is usable.
  }

  if (!configs.length) {
    throw new Error("AI provider config missing: AI_SUMMARY_* or AI_WRITER_*");
  }

  return configs;
}

function stripJsonFence(output: string) {
  const trimmed = output.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) {
    return fenced[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

function parseModelJson(output: string) {
  try {
    return JSON.parse(stripJsonFence(output)) as unknown;
  } catch {
    throw new Error("模型返回内容不是合法 JSON。");
  }
}

function createRepairMessages(rawOutput: string): ChatMessage[] {
  return [
    {
      role: "system",
      content:
        "你是严格的 JSON 修复器。只输出合法 JSON，不新增事实，不输出 Markdown、解释或额外文本。",
    },
    {
      role: "user",
      content: [
        "请把下面内容修复为合法 JSON，并尽量保持原有字段与信息。",
        "如果某些字段缺失，用空字符串、空数组或合理的默认值补齐。",
        "修复为合法 JSON：",
        rawOutput,
      ].join("\n\n"),
    },
  ];
}

function createDegradedSummaryMessages(project: Project, chapter: ManuscriptChapter, chapterIndex: number): ChatMessage[] {
  return [
    {
      role: "system",
      content:
        "你是中文长篇小说章节记忆助手。只输出一段可读摘要，不输出 JSON、Markdown、标题或列表。",
    },
    {
      role: "user",
      content: [
        "请用300-500字总结本章，必须覆盖剧情推进、人物变化、线索/疑点和后续续写注意事项。",
        `书名：${project.title}`,
        `章节序号：${chapterIndex + 1}`,
        `章节标题：${chapter.title}`,
        "章节正文：",
        chapter.content,
      ].join("\n\n"),
    },
  ];
}

function normalizeWithMode(
  project: Project,
  raw: unknown,
  metadata: Parameters<typeof normalizeChapterAnalysis>[1],
  mode: "structured" | "repaired" | "degraded",
  issue?: string,
) {
  const analysis = normalizeAnalysisCharacterIdentities(
    project,
    normalizeChapterAnalysis(raw, metadata),
  );
  return {
    ...analysis,
    parseMode: mode,
    quality: {
      ...analysis.quality,
      needsHumanReview: mode === "structured" ? analysis.quality.needsHumanReview : true,
      issues: issue ? [...analysis.quality.issues, issue] : analysis.quality.issues,
    },
  };
}

function createDegradedRawAnalysis(summary: string) {
  return {
    summary: {
      short: "降级摘要",
      detailed: summary.trim(),
    },
    quality: {
      confidence: 0.35,
      needsHumanReview: true,
      issues: ["本章使用降级解析，建议人工复核。"],
    },
  };
}

async function analyzeChapterWithRecovery(
  config: ReturnType<typeof getAnalysisConfigs>[number],
  streamChat: StreamChat,
  project: Project,
  chapter: ManuscriptChapter,
  chapterIndex: number,
  mode: AnalysisMode,
) {
  const metadata = {
    projectId: project.id,
    chapterId: chapter.id,
    chapterIndex,
    chapterTitle: chapter.title,
    content: chapter.content,
  };

  const output = await streamChat(config, createAnalysisMessages(project, chapter, chapterIndex, mode));
  try {
    return {
      analysis: normalizeWithMode(project, parseModelJson(output), metadata, "structured"),
      recovery: null,
    };
  } catch (primaryError) {
    const primaryReason = primaryError instanceof Error ? primaryError.message : "结构化解析失败。";

    try {
      const repairedOutput = await streamChat(config, createRepairMessages(output));
      return {
        analysis: normalizeWithMode(
          project,
          parseModelJson(repairedOutput),
          metadata,
          "repaired",
          `原始输出解析失败，已通过 JSON 修复恢复：${primaryReason}`,
        ),
        recovery: {
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          mode: "repaired" as const,
          reason: primaryReason,
        },
      };
    } catch (repairError) {
      const repairReason = repairError instanceof Error ? repairError.message : "JSON 修复失败。";
      const fallbackSummary = await streamChat(
        config,
        createDegradedSummaryMessages(project, chapter, chapterIndex),
      );

      return {
        analysis: normalizeWithMode(
          project,
          createDegradedRawAnalysis(fallbackSummary),
          metadata,
          "degraded",
          `结构化解析与 JSON 修复均失败，已使用降级摘要恢复：${primaryReason}；${repairReason}`,
        ),
        recovery: {
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          mode: "degraded" as const,
          reason: `${primaryReason}；${repairReason}`,
        },
      };
    }
  }
}

async function analyzeChapterWithProviderFallback(
  configs: ReturnType<typeof getAnalysisConfigs>,
  streamChat: StreamChat,
  project: Project,
  chapter: ManuscriptChapter,
  chapterIndex: number,
  mode: AnalysisMode,
) {
  const failures: string[] = [];

  for (const config of configs) {
    try {
      const result = await analyzeChapterWithRecovery(config, streamChat, project, chapter, chapterIndex, mode);
      const providerRecovery =
        failures.length > 0
          ? {
              chapterId: chapter.id,
              chapterTitle: chapter.title,
              mode: "degraded" as const,
              reason: `前置解析模型失败，已切换备用模型继续解析：${failures.join("；")}`,
            }
          : null;

      return {
        analysis: providerRecovery
          ? {
              ...result.analysis,
              quality: {
                ...result.analysis.quality,
                needsHumanReview: true,
                issues: [...result.analysis.quality.issues, providerRecovery.reason],
              },
            }
          : result.analysis,
        recovery: result.recovery ?? providerRecovery,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "未知错误。";
      failures.push(`${config.purpose}: ${reason}`);
    }
  }

  throw new Error(`所有解析模型请求均失败：${failures.join("；")}`);
}

function formatKnownCharacters(project: Project, limit = 80) {
  const profiles = project.characters ?? [];
  if (!profiles.length) {
    return "暂无人物档案";
  }

  return profiles
    .slice(0, limit)
    .map((character) =>
      [
        `- ${character.name}`,
        character.gender ? `性别：${character.gender}` : "",
        character.catchphrase ? `口头禅：${character.catchphrase}` : "",
        character.attributes.length
          ? `属性：${character.attributes
              .map((attribute) => `${attribute.title}:${attribute.value}`)
              .join("；")}`
          : "",
      ]
        .filter(Boolean)
        .join("，"),
    )
    .join("\n");
}

function formatKnownForeshadowings(project: Project, limit = 80) {
  const items = project.foreshadowings ?? [];
  if (!items.length) {
    return "暂无已登记线索";
  }

  return items
    .slice(0, limit)
    .map((item) => `- ${item.title}｜原状态：${item.status}｜${item.summary || item.plan}`)
    .join("\n");
}

function formatLockedConstraints(project: Project) {
  const characterConstraints = (project.characters ?? [])
    .flatMap((character) =>
      character.attributes
        .filter((attribute) => attribute.locked)
        .map((attribute) => `- 人物：${character.name}｜${attribute.title}：${attribute.value}`),
    );
  const worldConstraints = project.records
    .filter((record) => record.type === "worldRule" && record.status === "locked")
    .map((record) => `- 世界规则：${record.name}｜${record.summary}`);
  const constraints = [...characterConstraints, ...worldConstraints];

  return constraints.length ? constraints.join("\n") : "暂无锁定设定";
}

function formatRelevantCharacters(project: Project, chapter: ManuscriptChapter, limit: number) {
  const characters = project.characters ?? [];
  const mentioned = characters.filter((character) => chapter.content.includes(character.name));
  const locked = characters.filter((character) => character.attributes.some((attribute) => attribute.locked));
  const selected = [...new Map([...locked, ...mentioned].map((character) => [character.id, character])).values()]
    .slice(0, limit);

  if (!selected.length) {
    return "暂无直接相关人物档案";
  }

  return selected
    .map((character) => {
      const attributes = character.attributes
        .filter((attribute) => attribute.locked || chapter.content.includes(attribute.value))
        .map((attribute) => `${attribute.title}:${attribute.value}`)
        .join("；");
      return `- ${character.name}${attributes ? `，${attributes}` : ""}`;
    })
    .join("\n");
}

function formatRelevantForeshadowings(project: Project, chapter: ManuscriptChapter, limit: number) {
  const mentioned = (project.foreshadowings ?? []).filter(
    (item) => chapter.content.includes(item.title) || (item.summary && chapter.content.includes(item.summary)),
  );

  if (!mentioned.length) {
    return "暂无直接相关线索";
  }

  return mentioned
    .slice(0, limit)
    .map((item) => `- ${item.title}｜${item.summary || item.plan}`)
    .join("\n");
}

function createFastAnalysisMessages(
  project: Project,
  chapter: ManuscriptChapter,
  chapterIndex: number,
): ChatMessage[] {
  return [
    {
      role: "system",
      content:
        "你是中文长篇小说快速解析助手。只输出合法 JSON，不输出 Markdown、解释、代码块或额外文本。正文未证实的内容必须留空，不得编造。",
    },
    {
      role: "user",
      content: [
        "请做快速解析：用于建立全书剧情地图，不生成候选导入资料。",
        "输出 JSON schema：",
        `{
  "summary": { "short": "", "detailed": "" },
  "plot": { "mainEvents": [{ "title": "", "summary": "", "importance": "minor|medium|major", "type": "" }], "turningPoint": "", "chapterEnding": "" },
  "characters": [{ "name": "", "matchedCharacterId": null, "aliases": [], "role": "", "stateBefore": "", "stateAfter": "", "emotion": [], "goal": "", "traitsShown": [], "relationshipChanges": [] }],
  "clues": { "mentions": [{ "name": "", "summary": "", "evidence": "", "relatedCharacters": [], "importance": "minor|medium|major", "confidence": 0.7 }] },
  "continuationHints": { "openQuestions": [], "nextLeads": [], "warnings": [] },
  "quality": { "confidence": 0.7, "needsHumanReview": false, "issues": [] }
}`,
        "限制：摘要不超过 220 字；事件最多 3 条；人物最多 5 人；线索最多 3 条。",
        "人物匹配规则：若人物是已有人物的明确别名，填写该人物的标准姓名和 matchedCharacterId，并把原称呼放入 aliases；不能唯一判断时 matchedCharacterId 必须为 null。",
        "【不可违背设定】",
        formatLockedConstraints(project),
        "【相关人物】",
        formatRelevantCharacters(project, chapter, 6),
        "【相关线索】",
        formatRelevantForeshadowings(project, chapter, 3),
        "【当前章节】",
        `章节序号：${chapterIndex + 1}`,
        `章节标题：${chapter.title}`,
        "【章节正文】",
        chapter.content,
      ].join("\n\n"),
    },
  ];
}

function createFullAnalysisMessages(project: Project, chapter: ManuscriptChapter, chapterIndex: number): ChatMessage[] {
  return [
    {
      role: "system",
      content:
        "你是中文长篇小说资料解析助手。只输出合法 JSON，不输出 Markdown、解释、代码块或额外文本。字段缺失时用空字符串或空数组。",
    },
    {
      role: "user",
      content: [
        "请对单章小说做轻量解析，服务于后续长篇续写和一键导入候选资料。",
        "JSON schema:",
        `{
  "summary": { "short": "", "detailed": "" },
  "plot": {
    "mainEvents": [{ "title": "", "summary": "", "importance": "minor|medium|major", "type": "" }],
    "turningPoint": "",
    "chapterEnding": ""
  },
  "characters": [{
    "name": "",
    "matchedCharacterId": null,
    "aliases": [],
    "role": "",
    "stateBefore": "",
    "stateAfter": "",
    "emotion": [],
    "goal": "",
    "traitsShown": [],
    "relationshipChanges": [{ "targetName": "", "change": "" }]
  }],
  "entities": {
    "locations": [{ "name": "", "description": "", "importance": "minor|medium|major" }],
    "items": [{ "name": "", "description": "", "importance": "minor|medium|major" }],
    "factions": [{ "name": "", "description": "", "importance": "minor|medium|major" }],
    "worldRules": [{ "name": "", "description": "", "importance": "minor|medium|major" }]
  },
  "clues": {
    "mentions": [{
      "name": "",
      "summary": "",
      "evidence": "",
      "relatedCharacters": [],
      "importance": "minor|medium|major",
      "confidence": 0.7
    }]
  },
  "timeline": { "timeLabel": "", "sequenceNote": "", "duration": "" },
  "craft": { "pov": "", "tone": [], "conflictTypes": [], "chapterHook": "", "styleNotes": [] },
  "continuationHints": { "openQuestions": [], "nextLeads": [], "warnings": [] },
  "candidateUpdates": {
    "characters": [{ "name": "", "action": "create_candidate|merge_or_create|update_existing", "confidence": 0.7, "evidence": "", "suggestedAttributes": { "姓名与别名": "", "剧情身份": "", "人物关系": "", "已知信息与秘密": "", "能力与限制": "" }, "suggestedAttributeEvidence": { "姓名与别名": "", "剧情身份": "", "人物关系": "", "已知信息与秘密": "", "能力与限制": "" } }],
    "clues": [{ "name": "", "action": "create_candidate|merge_or_create|update_existing", "confidence": 0.7, "evidence": "" }],
    "locations": [],
    "items": [],
    "factions": [],
    "worldRules": []
  },
  "quality": { "confidence": 0.7, "needsHumanReview": false, "issues": [] }
}`,
        "解析原则：",
        "- 不要编造正文中没有根据的事实。",
        "- 候选导入只给出建议数据，不执行导入。",
        "- 线索只记录本章提及了什么，不区分埋设、回收、推进等状态。",
        "- 线索包括可疑人物、未解释事件、反复出现的物品、世界观疑点、异常信息和未来可追踪的剧情钩子。",
        "- 人物状态要抓本章变化，而不是泛泛评价。",
        "- 人物候选的 suggestedAttributes 只可填写：姓名与别名、剧情身份、人物关系、已知信息与秘密、能力与限制；每个非空属性都必须在 suggestedAttributeEvidence 给出对应正文证据。",
        "- 若人物是已有人物的明确别名，填写该人物的标准姓名和 matchedCharacterId，并把原称呼放入 aliases；无法唯一判断时保留原称呼且 matchedCharacterId 为 null。",
        "【项目信息】",
        `书名：${project.title}`,
        `类型：${project.genre || "未设置"}`,
        `简介：${project.synopsis || "暂无简介"}`,
        "【不可违背设定】",
        formatLockedConstraints(project),
        "【已有人物】",
        formatKnownCharacters(project, 12),
        "【已登记线索】",
        formatKnownForeshadowings(project, 8),
        "【当前章节】",
        `章节序号：${chapterIndex + 1}`,
        `章节标题：${chapter.title}`,
        "【章节正文】",
        chapter.content,
      ].join("\n\n"),
    },
  ];
}

function createAnalysisMessages(
  project: Project,
  chapter: ManuscriptChapter,
  chapterIndex: number,
  mode: AnalysisMode,
) {
  return mode === "full"
    ? createFullAnalysisMessages(project, chapter, chapterIndex)
    : createFastAnalysisMessages(project, chapter, chapterIndex);
}

function normalizeAnalysisMode(value: unknown): AnalysisMode {
  return value === "full" ? "full" : "fast";
}

function getAnalysisConcurrency(mode: AnalysisMode, env: Record<string, string | undefined>) {
  const fallback = mode === "fast" ? 3 : 2;
  const configured = Number.parseInt(env.AI_ANALYSIS_CONCURRENCY ?? "", 10);

  if (!Number.isFinite(configured)) {
    return fallback;
  }

  return Math.max(1, Math.min(configured, fallback));
}

async function parseAnalyzeRequest(request: Request): Promise<Required<AnalyzeChaptersRequestBody>> {
  const body = (await request.json()) as AnalyzeChaptersRequestBody;
  if (!body.project) {
    throw new Error("缺少项目数据。");
  }
  if (!body.project.manuscript?.chapters.length) {
    throw new Error("当前项目没有可解析章节。");
  }

  return {
    project: body.project,
    chapterIds: body.chapterIds ?? [],
    force: body.force ?? false,
    maxChapters: body.maxChapters ?? 0,
    mode: normalizeAnalysisMode(body.mode),
  };
}

function selectTargetChapters(parsed: Required<AnalyzeChaptersRequestBody>) {
  const chapters = parsed.project.manuscript?.chapters ?? [];
  const allowedIds = new Set(parsed.chapterIds);
  const selected = parsed.chapterIds.length
    ? chapters.filter((chapter) => allowedIds.has(chapter.id))
    : chapters;
  const needIds = new Set(
    getChaptersNeedingAnalysis(parsed.project, { force: parsed.force }).map((chapter) => chapter.id),
  );
  const targets = selected.filter((chapter) => needIds.has(chapter.id));
  const limitedTargets = parsed.maxChapters > 0 ? targets.slice(0, parsed.maxChapters) : targets;

  return {
    targets: limitedTargets,
    skippedCount: selected.length - limitedTargets.length,
  };
}

export async function createChapterAnalysisStreamResponse(
  request: Request,
  deps: AnalyzeChaptersRouteDeps = {},
): Promise<Response> {
  const env = deps.env ?? process.env;
  const streamChat = deps.streamChat ?? streamOpenAiCompatibleChat;

  let configs;
  try {
    configs = getAnalysisConfigs(env);
  } catch {
    return Response.json({ error: "AI 服务未配置，请检查服务端环境变量。" }, { status: 500 });
  }

  let parsed;
  try {
    parsed = await parseAnalyzeRequest(request);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "请求数据无效。" }, { status: 400 });
  }

  const { targets, skippedCount } = selectTargetChapters(parsed);
  const chapterIndexById = new Map(
    (parsed.project.manuscript?.chapters ?? []).map((chapter, index) => [chapter.id, index]),
  );

  const body = new ReadableStream({
    async start(controller) {
      const analysesByTargetIndex: Array<ReturnType<typeof normalizeChapterAnalysis> | undefined> = [];
      const failures: ChapterAnalysisFailure[] = [];
      const recoveries: ChapterAnalysisRecovery[] = [];
      const emit = (value: unknown) => controller.enqueue(jsonLine(value));
      const concurrency = Math.min(getAnalysisConcurrency(parsed.mode, env), Math.max(targets.length, 1));
      let nextTargetIndex = 0;
      let completedCount = 0;

      emit({
        type: "status",
        status: "preparing",
        progress: 5,
        total: targets.length,
        skippedCount,
        mode: parsed.mode,
        concurrency,
      });

      const runWorker = async () => {
        while (true) {
          const targetIndex = nextTargetIndex;
          nextTargetIndex += 1;
          if (targetIndex >= targets.length) {
            return;
          }

          const chapter = targets[targetIndex];
          const chapterIndex = chapterIndexById.get(chapter.id) ?? targetIndex;
          emit({
            type: "chapterStart",
            chapterId: chapter.id,
            chapterTitle: chapter.title,
            progress: Math.round(5 + (completedCount / Math.max(targets.length, 1)) * 85),
          });

          try {
            const { analysis, recovery } = await analyzeChapterWithProviderFallback(
              configs,
              streamChat,
              parsed.project,
              chapter,
              chapterIndex,
              parsed.mode,
            );
            analysesByTargetIndex[targetIndex] = analysis;
            if (recovery) {
              recoveries.push(recovery);
            }
            completedCount += 1;

            emit({
              type: "chapterDone",
              chapterId: chapter.id,
              analysis,
              recovery,
              progress: Math.round(5 + (completedCount / Math.max(targets.length, 1)) * 85),
            });
          } catch (error) {
            const reason = error instanceof Error ? error.message : "未知错误。";
            const failure = {
              chapterId: chapter.id,
              chapterTitle: chapter.title,
              error: reason,
            };
            failures.push(failure);
            completedCount += 1;
            emit({
              type: "chapterError",
              ...failure,
              error: `章节深度解析失败：${chapter.title}。${reason}`,
              progress: Math.round(5 + (completedCount / Math.max(targets.length, 1)) * 85),
            });
          }
        }
      };

      await Promise.all(Array.from({ length: concurrency }, () => runWorker()));
      const analyses = analysesByTargetIndex.filter(
        (analysis): analysis is ReturnType<typeof normalizeChapterAnalysis> => Boolean(analysis),
      );

      emit({
        type: "done",
        analyses,
        analyzedCount: analyses.length,
        repairedCount: recoveries.filter((recovery) => recovery.mode === "repaired").length,
        degradedCount: recoveries.filter((recovery) => recovery.mode === "degraded").length,
        recoveries,
        failedCount: failures.length,
        failures,
        skippedCount,
        mode: parsed.mode,
        progress: 100,
      });
      controller.close();
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}

export async function POST(request: Request) {
  return createChapterAnalysisStreamResponse(request);
}
