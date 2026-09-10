import { getAiProviderConfig } from "@/lib/ai-config";
import {
  buildClueDiagnosisInput,
  createRuleBasedClueDiagnosis,
  getCluePoolFingerprint,
  scoreClueThemes,
  validateClueDiagnosis,
} from "@/lib/clue-diagnosis";
import type { ClueDiagnosisResult, Project } from "@/lib/knowledge";
import { streamOpenAiCompatibleChat, type ChatMessage } from "@/lib/openai-compatible";

type DiagnoseCluesRequestBody = {
  project?: Project;
  force?: boolean;
};

type StreamChat = typeof streamOpenAiCompatibleChat;

type DiagnoseCluesRouteDeps = {
  env?: Record<string, string | undefined>;
  streamChat?: StreamChat;
  timeoutMs?: number;
};

const defaultDiagnosisTimeoutMs = 45_000;

function stripJsonFence(output: string): string {
  const trimmed = output.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) return fenced[1].trim();

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  return firstBrace >= 0 && lastBrace > firstBrace ? trimmed.slice(firstBrace, lastBrace + 1) : trimmed;
}

function parseModelJson(output: string): unknown {
  return JSON.parse(stripJsonFence(output)) as unknown;
}

function createDiagnosisMessages(project: Project): ChatMessage[] {
  const candidates = buildClueDiagnosisInput(project).map((candidate) => ({
    id: candidate.id,
    name: candidate.name,
    summary: candidate.summary,
    evidence: candidate.evidence,
    chapterIndex: candidate.chapterIndex,
    chapterTitle: candidate.chapterTitle,
    relatedCharacters: candidate.relatedCharacters,
    importance: candidate.importance,
    confidence: candidate.confidence,
  }));

  return [
    {
      role: "system",
      content:
        "你是中文长篇小说线索整理助手。只输出合法 JSON，不输出 Markdown、解释或额外文本。你只能引用输入的候选 ID，不能编造任何人物、事件、线索或章节内容。",
    },
    {
      role: "user",
      content: [
        "请把相同主题、近义或能由同一剧情问题解释的候选线索合并成主题。",
        "不要把普通环境、情绪、一次性物件强行合并成重要线索；没有可靠依据时保留独立主题并标记需要作者确认。",
        "只返回以下 JSON：",
        `{
  "themes": [{
    "title": "作者可读的主题名称",
    "memberIds": ["只可使用下方候选 id"],
    "kind": "主线谜团|人物秘密|危机限制|待回收承诺|背景细节",
    "state": "未解|推进中|已回收|仅背景",
    "mergeReason": "简短说明为何这些候选可以合并",
    "needsHumanReview": true
  }]
}`,
        "候选摘要（不含章节正文）：",
        JSON.stringify(candidates),
      ].join("\n\n"),
    },
  ];
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
        "请把下面线索整理结果修复为合法 JSON，保留已有主题和候选 ID，不新增任何内容：",
        rawOutput,
      ].join("\n\n"),
    },
  ];
}

function makeDiagnosisResult(project: Project, raw: unknown, mode: ClueDiagnosisResult["mode"]): ClueDiagnosisResult {
  const candidates = buildClueDiagnosisInput(project);
  const validated = validateClueDiagnosis(candidates, raw);
  return {
    fingerprint: getCluePoolFingerprint(candidates),
    generatedAt: new Date().toISOString(),
    mode,
    themes: scoreClueThemes(validated.themes, { project, candidates }),
  };
}

async function diagnoseWithRecovery(
  project: Project,
  streamChat: StreamChat,
  env: Record<string, string | undefined>,
  timeoutMs: number,
): Promise<ClueDiagnosisResult> {
  const config = getAiProviderConfig(env, "diagnosis");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const output = await streamChat(config, createDiagnosisMessages(project), {
      signal: controller.signal,
    });
    try {
      return makeDiagnosisResult(project, parseModelJson(output), "diagnosis");
    } catch {
      const repairedOutput = await streamChat(config, createRepairMessages(output), {
        signal: controller.signal,
      });
      return makeDiagnosisResult(project, parseModelJson(repairedOutput), "diagnosis");
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function parseRequest(request: Request): Promise<Required<DiagnoseCluesRequestBody>> {
  const body = (await request.json()) as DiagnoseCluesRequestBody;
  if (!body.project) throw new Error("缺少项目数据。");
  return { project: body.project, force: body.force ?? false };
}

export async function createClueDiagnosisResponse(
  request: Request,
  deps: DiagnoseCluesRouteDeps = {},
): Promise<Response> {
  let parsed: Required<DiagnoseCluesRequestBody>;
  try {
    parsed = await parseRequest(request);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "请求数据无效。" }, { status: 400 });
  }

  const candidates = buildClueDiagnosisInput(parsed.project);
  const fingerprint = getCluePoolFingerprint(candidates);
  if (!parsed.force && parsed.project.clueDiagnosis?.fingerprint === fingerprint) {
    return Response.json({ diagnosis: parsed.project.clueDiagnosis, reused: true });
  }

  const env = deps.env ?? process.env;
  const streamChat = deps.streamChat ?? streamOpenAiCompatibleChat;
  try {
    const diagnosis = candidates.length
      ? await diagnoseWithRecovery(
          parsed.project,
          streamChat,
          env,
          deps.timeoutMs ?? defaultDiagnosisTimeoutMs,
        )
      : createRuleBasedClueDiagnosis(parsed.project);
    return Response.json({ diagnosis, reused: false });
  } catch {
    return Response.json({ diagnosis: createRuleBasedClueDiagnosis(parsed.project), reused: false });
  }
}

export async function POST(request: Request) {
  return createClueDiagnosisResponse(request);
}
