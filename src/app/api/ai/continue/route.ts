import { getAiProviderConfig } from "@/lib/ai-config";
import {
  buildAiContinuationContext,
  createContinuationSegments,
  type AiContinuationCreativeAnswers,
  type AiContinuationContext,
  type AiContinuationLength,
} from "@/lib/ai-continuation";
import {
  getContinuationStrategy,
  parseContinuationStrategy,
  type ContinuationStrategyId,
} from "@/lib/continuation-strategy";
import { streamOpenAiCompatibleChat, type ChatMessage } from "@/lib/openai-compatible";
import type { Project } from "@/lib/knowledge";
import type { RetrievalEvidence } from "@/lib/workspace-api";

type ContinueRequestBody = {
  project?: Project;
  targetLength?: AiContinuationLength;
  userInstruction?: string;
  creativeAnswers?: Partial<AiContinuationCreativeAnswers>;
  retrievalEvidence?: RetrievalEvidence[];
  strategy?: ContinuationStrategyId;
};

type StreamChat = typeof streamOpenAiCompatibleChat;

type ContinueRouteDeps = {
  env?: Record<string, string | undefined>;
  streamChat?: StreamChat;
};

const encoder = new TextEncoder();

function jsonLine(value: unknown) {
  return encoder.encode(`${JSON.stringify(value)}\n`);
}

function createReport(context: AiContinuationContext, strategyId: ContinuationStrategyId) {
  const strategy = getContinuationStrategy(strategyId);
  return {
    usedMaterials: [
      context.recentManuscriptText ? "小说正文" : "",
      strategy.usesRetrieval && context.chapterNotes.length ? "章节划分" : "",
      strategy.usesRetrieval && context.outlineNotes.length ? "大纲管理" : "",
      strategy.usesRetrieval && context.characterNotes.length ? "人物管理" : "",
      strategy.usesRetrieval && context.clueNotes.length ? "线索管理" : "",
      strategy.usesRetrieval && context.foreshadowingNotes.length ? "重要伏笔" : "",
      strategy.usesConstraints && context.factConstraintNotes.length ? "作者锁定约束" : "",
    ].filter(Boolean),
    outlineHits: strategy.usesRetrieval ? context.outlineNotes.slice(0, 5) : [],
    characterHits: strategy.usesRetrieval ? context.characterNotes.slice(0, 8) : [],
    foreshadowingHits: strategy.usesRetrieval ? context.foreshadowingNotes.slice(0, 8) : [],
    warnings: [
      ...(context.recentManuscriptText ? [] : ["当前项目缺少小说正文，续写质量会明显下降。"]),
      ...(strategy.usesRetrieval ? context.grounding.gaps : []),
    ],
    grounding: context.grounding,
    sourcePreview: [
      ...(strategy.usesConstraints ? context.grounding.factSources.slice(0, 6) : []),
      ...(strategy.usesRetrieval ? context.grounding.retrievalSources : []),
    ].slice(0, 12),
  };
}

function formatContext(context: AiContinuationContext, strategyId: ContinuationStrategyId) {
  const strategy = getContinuationStrategy(strategyId);
  const sections = [
    "【项目信息】",
    context.projectProfile,
    "【最近正文】",
    context.recentManuscriptText || "暂无正文",
  ];

  if (strategy.usesRetrieval) {
    sections.push(
      "【检索证据（仅供有来源情节参考）】",
      context.ragReferences.join("\n") || "当前没有可用长期证据",
      context.grounding.mode === "limited"
        ? "【资料边界】长期依据不足；不得补充无来源的身份、关系、死亡、地点或能力事实。"
        : "",
      "【章节信息】",
      context.chapterNotes.join("\n") || "暂无章节信息",
      "【大纲】",
      context.outlineNotes.join("\n") || "暂无大纲",
      "【人物】",
      context.characterNotes.join("\n") || "暂无人物",
      "【线索】",
      context.clueNotes.join("\n") || "暂无线索",
      "【伏笔】",
      context.foreshadowingNotes.join("\n") || "暂无伏笔",
    );
  }

  if (strategy.usesConstraints) {
    sections.push(
      "【作者锁定硬约束（只能遵守，不可编造）】",
      context.factConstraintNotes.slice(0, 6).join("\n") || "暂无与当前场景直接相关的已锁定硬约束",
    );
  }

  sections.push("【作者要求】", context.userInstruction || "无额外要求");
  return sections.filter(Boolean).join("\n\n");
}

function createWriterMessages(
  context: AiContinuationContext,
  strategyId: ContinuationStrategyId,
  targetLength: number,
  plan: string,
  generatedText: string,
): ChatMessage[] {
  return [
    {
      role: "system",
      content:
        "你是专业中文网文续写助手。只输出小说正文，不输出解释、标题、列表或元信息。保持剧情连贯，优先遵守作者给出的资料、人物状态、大纲和伏笔。",
    },
    {
      role: "user",
      content: [
        formatContext(context, strategyId),
        plan ? `【隐藏续写计划】\n${plan}` : "",
        generatedText ? `【本次已生成正文】\n${generatedText}` : "",
        `请继续生成约${targetLength}字正文。`,
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];
}

function createPlannerMessages(context: AiContinuationContext, strategyId: ContinuationStrategyId): ChatMessage[] {
  return [
    {
      role: "system",
      content:
        "你是中文长篇小说剧情策划。根据上下文生成一份隐藏续写计划，聚焦剧情推进、人物高光、伏笔回收和新钩子。不要写正文。",
    },
    {
      role: "user",
      content: `${formatContext(context, strategyId)}\n\n请给出本次约10000字续写的分段剧情计划。`,
    },
  ];
}

async function parseContinueRequest(request: Request): Promise<Required<ContinueRequestBody>> {
  const body = (await request.json()) as ContinueRequestBody;
  if (!body.project) {
    throw new Error("缺少项目数据。");
  }
  if (body.targetLength !== 1000 && body.targetLength !== 3000 && body.targetLength !== 10000) {
    throw new Error("续写字数选项无效。");
  }

  return {
    project: body.project,
    targetLength: body.targetLength,
    userInstruction: body.userInstruction ?? "",
    creativeAnswers: body.creativeAnswers ?? {},
    retrievalEvidence: Array.isArray(body.retrievalEvidence) ? body.retrievalEvidence : [],
    strategy: parseContinuationStrategy(body.strategy),
  };
}

export async function createContinuationStreamResponse(
  request: Request,
  deps: ContinueRouteDeps = {},
): Promise<Response> {
  const env = deps.env ?? process.env;
  const streamChat = deps.streamChat ?? streamOpenAiCompatibleChat;

  let writerConfig;
  let plannerConfig;
  try {
    writerConfig = getAiProviderConfig(env, "writer");
    plannerConfig = getAiProviderConfig(env, "planner");
  } catch {
    return Response.json({ error: "AI 服务未配置，请检查服务端环境变量。" }, { status: 500 });
  }

  let parsed;
  try {
    parsed = await parseContinueRequest(request);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "请求数据无效。" }, { status: 400 });
  }

  const context = buildAiContinuationContext(parsed.project, {
    targetLength: parsed.targetLength,
    userInstruction: parsed.userInstruction,
    creativeAnswers: parsed.creativeAnswers,
    retrievalEvidence: parsed.retrievalEvidence,
  });
  const segments = createContinuationSegments(parsed.targetLength);

  const body = new ReadableStream({
    async start(controller) {
      let generatedText = "";
      let plan = "";

      const emit = (value: unknown) => controller.enqueue(jsonLine(value));

      try {
        emit({ type: "status", status: "buildingContext", progress: 10 });

        if (parsed.targetLength === 10000) {
          emit({ type: "status", status: "planning", progress: 18 });
          plan = await streamChat(plannerConfig, createPlannerMessages(context, parsed.strategy));
        }

        for (const segment of segments) {
          emit({
            type: "status",
            status: "generating",
            progress: Math.round(20 + ((segment.index - 1) / segments.length) * 70),
          });
          const segmentText = await streamChat(
            writerConfig,
            createWriterMessages(context, parsed.strategy, segment.targetLength, plan, generatedText),
            {
              onToken: (token) => {
                generatedText += token;
                emit({ type: "token", token });
              },
            },
          );

          if (!segmentText) {
            throw new Error("模型未返回有效正文。");
          }
        }

        emit({
          type: "done",
          text: generatedText,
          report: createReport(context, parsed.strategy),
          progress: 100,
        });
      } catch {
        emit({ type: "error", error: "AI 续写失败，请稍后重试。", text: generatedText });
      } finally {
        controller.close();
      }
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
  return createContinuationStreamResponse(request);
}
