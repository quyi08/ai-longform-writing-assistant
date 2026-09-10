import { getAiProviderConfig } from "@/lib/ai-config";
import type { AiContinuationContext } from "@/lib/ai-continuation";
import {
  runRuleBasedContinuationCheck,
  validateModelConsistencyFindings,
  type ContinuationConsistencyReport,
} from "@/lib/continuation-consistency";
import type { Project } from "@/lib/knowledge";
import { streamOpenAiCompatibleChat, type ChatMessage } from "@/lib/openai-compatible";

type ContinuationCheckRequest = {
  project?: Project;
  context?: AiContinuationContext;
  text?: string;
  force?: boolean;
};

type StreamChat = typeof streamOpenAiCompatibleChat;

export type ContinuationCheckRouteDeps = {
  env?: Record<string, string | undefined>;
  streamChat?: StreamChat;
  timeoutMs?: number;
};

const defaultTimeoutMs = 45_000;

function stripJsonFence(output: string) {
  const trimmed = output.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) return fenced[1].trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  return firstBrace >= 0 && lastBrace > firstBrace ? trimmed.slice(firstBrace, lastBrace + 1) : trimmed;
}

function createMessages(context: AiContinuationContext, text: string): ChatMessage[] {
  const sourceEvidence = [...context.factConstraintNotes, ...context.ragReferences].slice(0, 16);
  return [
    {
      role: "system",
      content: "你是中文小说一致性检查助手。只输出合法 JSON，不输出 Markdown 或解释。只能根据输入正文和资料判断，绝不补充外部事实。每个 high 风险必须逐字引用输入资料中的 evidence；没有证据时只能标 medium 或 low。",
    },
    {
      role: "user",
      content: [
        "检查人物身份、关系、死亡/失踪、地点、能力、世界规则，以及把待确认内容写成事实的问题。",
        `资料模式：${context.grounding.mode}`,
        `可核对资料：${JSON.stringify(sourceEvidence)}`,
        `生成正文：${text.slice(0, 14000)}`,
        "只返回：{\"findings\":[{\"severity\":\"high|medium|low\",\"category\":\"identity|relationship|status|worldRule|pendingFact|unsupportedClaim\",\"message\":\"\",\"textQuote\":\"\",\"evidence\":\"必须是可核对资料的原文\",\"recommendation\":\"\"}]}",
      ].join("\n\n"),
    },
  ];
}

function mergeReport(
  report: ContinuationConsistencyReport,
  raw: unknown,
  sourceEvidence: string[],
): ContinuationConsistencyReport {
  const modelFindings = validateModelConsistencyFindings(
    raw && typeof raw === "object" && "findings" in raw ? (raw as { findings?: unknown }).findings : raw,
    sourceEvidence,
  );
  const seen = new Set(report.findings.map((finding) => `${finding.category}:${finding.textQuote}`));
  return {
    ...report,
    findings: [
      ...report.findings,
      ...modelFindings.filter((finding) => {
        const key = `${finding.category}:${finding.textQuote}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
    ],
  };
}

async function parseRequest(request: Request): Promise<Required<ContinuationCheckRequest>> {
  const body = await request.json() as ContinuationCheckRequest;
  if (!body.project || !body.context || !body.text?.trim()) throw new Error("缺少续写检查所需资料。");
  return { project: body.project, context: body.context, text: body.text.trim(), force: body.force ?? false };
}

export async function createContinuationCheckResponse(
  request: Request,
  deps: ContinuationCheckRouteDeps = {},
): Promise<Response> {
  let parsed: Required<ContinuationCheckRequest>;
  try {
    parsed = await parseRequest(request);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "请求数据无效。" }, { status: 400 });
  }

  const ruleReport = runRuleBasedContinuationCheck(parsed.project, parsed.context, parsed.text);
  const env = deps.env ?? process.env;
  const streamChat = deps.streamChat ?? streamOpenAiCompatibleChat;
  let config;
  try {
    config = getAiProviderConfig(env, "diagnosis");
  } catch {
    return Response.json({
      report: { ...ruleReport, status: "partial" },
      reused: false,
      diagnosisAvailable: false,
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), deps.timeoutMs ?? defaultTimeoutMs);
  try {
    const output = await streamChat(config, createMessages(parsed.context, parsed.text), { signal: controller.signal });
    const parsedOutput = JSON.parse(stripJsonFence(output)) as unknown;
    return Response.json({
      report: mergeReport(ruleReport, parsedOutput, [...parsed.context.factConstraintNotes, ...parsed.context.ragReferences]),
      reused: false,
      diagnosisAvailable: true,
    });
  } catch {
    return Response.json({
      report: { ...ruleReport, status: "partial" },
      reused: false,
      diagnosisAvailable: true,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: Request) {
  return createContinuationCheckResponse(request);
}
