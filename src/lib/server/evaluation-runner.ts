import type { ChatMessage } from "@/lib/openai-compatible";
import { DEFAULT_EVALUATION_CONTINUATION_CHARACTER_LIMIT, EVALUATION_CONTINUATION_TARGET_MAX_CHARACTERS, EVALUATION_CONTINUATION_TARGET_MIN_CHARACTERS, type EvaluationFocus } from "@/lib/evaluation";

type EvaluationRunnerInput = {
  project: { manuscript?: { chapters?: Array<{ id: string; title: string; content: string }> } };
  variant: "A" | "B" | "C";
  chapterId: string;
  authorInstruction: string;
  retrievalEvidence: string[];
  requiredFacts?: string[];
  forbiddenFacts?: string[];
  expectedBehavior?: "retrieve_evidence" | "continue_story" | "limited" | "block_conflict";
  evaluationFocus?: EvaluationFocus;
  lockedRules?: string[];
  outputCharacterLimit?: number;
};

type Chat = (config: { temperature?: number; maxTokens?: number; truncatedReasoningRetryMaxTokens?: number; emptyCompletionRetryTimeoutMs?: number }, messages: ChatMessage[]) => Promise<string>;

function chapterTail(content: string, limit = 1_600) {
  const tail = content.slice(-limit);
  const paragraphBoundary = tail.indexOf("\n");
  return (paragraphBoundary >= 0 ? tail.slice(paragraphBoundary + 1) : tail).trim();
}

function clampContinuationText(rawText: string, characterLimit: number) {
  const normalized = rawText.trim();
  if (normalized.length <= characterLimit) return normalized;
  const bounded = normalized.slice(0, characterLimit);
  const lastSentenceEnd = Math.max(...["。", "！", "？", "!", "?", "…"].map((marker) => bounded.lastIndexOf(marker)));
  return lastSentenceEnd >= EVALUATION_CONTINUATION_TARGET_MIN_CHARACTERS
    ? bounded.slice(0, lastSentenceEnd + 1).trim()
    : bounded.trim();
}

/** Avoid retries for tiny unit-test fixtures, but detect real story text ending mid-sentence. */
function isVisiblyIncompleteContinuation(text: string) {
  const normalized = text.trim();
  if (normalized.length < 80) return false;
  return !/[。！？!?…][”’）)】]?$/u.test(normalized);
}

function creativeWritingPolicy(evaluationFocus?: EvaluationFocus) {
  return evaluationFocus === "creative"
    ? "开放创作允许低影响虚构：无名路人、氛围细节、临时道具、人物当下猜测及可撤销行动选择。不得新增有名字的人物、地点、组织，补写确定既往经历，或让新设定固定主线因果。"
    : "新推测必须保持可撤销和不确定，不得捏造确定的人物历史、关系、世界规则或未来信息。";
}

function parseJudgeResult(value: string) {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = (fenced?.[1] ?? value).trim();
  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    const pick = (...keys: string[]) => keys.map((key) => parsed[key]).find((item) => item !== undefined);
    const normalizeScore = (item: unknown): number | undefined => {
      if (typeof item === "number" && Number.isFinite(item) && item >= 0 && item <= 5) return item;
      if (typeof item === "string" && /^\s*[0-5](?:\.\d+)?\s*$/.test(item)) return Number(item.trim());
      return undefined;
    };
    const normalizeBoolean = (item: unknown): boolean | undefined => {
      if (typeof item === "boolean") return item;
      if (Array.isArray(item) && item.every((entry) => typeof entry === "string")) return item.length > 0;
      if (typeof item !== "string") return undefined;
      if (["true", "是", "有", "存在"].includes(item.trim().toLowerCase())) return true;
      if (["false", "否", "无", "没有", "不存在"].includes(item.trim().toLowerCase())) return false;
      return undefined;
    };
    const unsupportedFindings = pick("unsupportedFindings", "unsupported_findings");
    const reviewReasons = pick("reviewReasons", "review_reasons");
    const citedEvidenceIds = pick("citedEvidenceIds", "cited_evidence_ids");
    const speculativeFindings = pick("speculativeFindings", "speculative_findings");
    const explicitUnsupportedClaim = pick("unsupportedClaim", "unsupported_claim");
    const explicitNeedsHumanReview = pick("needsHumanReview", "needs_human_review");
    const explicitTaskSuccess = pick("taskSuccess", "task_success");
    const unsupportedClaim = explicitUnsupportedClaim === undefined
      ? (Array.isArray(unsupportedFindings) ? unsupportedFindings.length > 0 : false)
      : normalizeBoolean(explicitUnsupportedClaim);
    const needsHumanReview = explicitNeedsHumanReview === undefined
      ? (Array.isArray(reviewReasons) ? reviewReasons.length > 0 : unsupportedClaim)
      : normalizeBoolean(explicitNeedsHumanReview);
    const canonicalScores = {
      factFollowing: normalizeScore(pick("factFollowing", "fact_following")),
      characterConsistency: normalizeScore(pick("characterConsistency", "character_consistency")),
      plotContinuity: normalizeScore(pick("plotContinuity", "plot_continuity")),
      styleFit: normalizeScore(pick("styleFit", "style_fit")),
    };
    const extraScores = {
      cutoffContinuity: normalizeScore(pick("cutoffContinuity", "cutoff_continuity")),
      narrativeAdvancement: normalizeScore(pick("narrativeAdvancement", "narrative_advancement")),
      coreEvidenceUse: normalizeScore(pick("coreEvidenceUse", "core_evidence_use")),
      constraintCompliance: normalizeScore(pick("constraintCompliance", "constraint_compliance")),
      creativePlausibility: normalizeScore(pick("creativePlausibility", "creative_plausibility")),
      sceneDramaticTension: normalizeScore(pick("sceneDramaticTension", "scene_dramatic_tension")),
      characterAgency: normalizeScore(pick("characterAgency", "character_agency")),
      creativeControl: normalizeScore(pick("creativeControl", "creative_control")),
      evidenceTransformation: normalizeScore(pick("evidenceTransformation", "evidence_transformation")),
    };
    const hasMalformedProvidedExtraScore = ([
      [["cutoffContinuity", "cutoff_continuity"], extraScores.cutoffContinuity],
      [["narrativeAdvancement", "narrative_advancement"], extraScores.narrativeAdvancement],
      [["coreEvidenceUse", "core_evidence_use"], extraScores.coreEvidenceUse],
      [["constraintCompliance", "constraint_compliance"], extraScores.constraintCompliance],
      [["creativePlausibility", "creative_plausibility"], extraScores.creativePlausibility],
      [["sceneDramaticTension", "scene_dramatic_tension"], extraScores.sceneDramaticTension],
      [["characterAgency", "character_agency"], extraScores.characterAgency],
      [["creativeControl", "creative_control"], extraScores.creativeControl],
      [["evidenceTransformation", "evidence_transformation"], extraScores.evidenceTransformation],
    ] as const).some(([keys, score]) => keys.some((key) => parsed[key] !== undefined) && score === undefined);
    const taskSuccess = explicitTaskSuccess === undefined ? undefined : normalizeBoolean(explicitTaskSuccess);
    const optionalStringArray = (item: unknown) => item === undefined || (Array.isArray(item) && item.every((entry) => typeof entry === "string"));
    if (!Object.values(canonicalScores).every((score) => score !== undefined)
      || unsupportedClaim === undefined
      || needsHumanReview === undefined
      || hasMalformedProvidedExtraScore
      || (explicitTaskSuccess !== undefined && taskSuccess === undefined)
      || !optionalStringArray(unsupportedFindings)
      || !optionalStringArray(speculativeFindings)
      || !optionalStringArray(reviewReasons)
      || !optionalStringArray(citedEvidenceIds)) {
      return { status: "invalid" as const, reason: "Judge 输出缺少必填字段或字段类型不符合评分协议。" };
    }
    return {
      status: "scored" as const,
      ...parsed,
      ...canonicalScores,
      cutoffContinuity: extraScores.cutoffContinuity ?? canonicalScores.factFollowing,
      narrativeAdvancement: extraScores.narrativeAdvancement ?? canonicalScores.plotContinuity,
      coreEvidenceUse: extraScores.coreEvidenceUse ?? canonicalScores.factFollowing,
      constraintCompliance: extraScores.constraintCompliance ?? canonicalScores.factFollowing,
      creativePlausibility: extraScores.creativePlausibility ?? canonicalScores.styleFit,
      sceneDramaticTension: extraScores.sceneDramaticTension ?? canonicalScores.plotContinuity,
      characterAgency: extraScores.characterAgency ?? (extraScores.narrativeAdvancement ?? canonicalScores.plotContinuity),
      creativeControl: extraScores.creativeControl ?? (extraScores.creativePlausibility ?? canonicalScores.styleFit),
      evidenceTransformation: extraScores.evidenceTransformation ?? (extraScores.coreEvidenceUse ?? canonicalScores.factFollowing),
      ...(taskSuccess === undefined ? {} : { taskSuccess }),
      unsupportedClaim,
      needsHumanReview,
      citedEvidenceIds: citedEvidenceIds ?? [],
      unsupportedFindings: unsupportedFindings ?? (Array.isArray(parsed.unsupportedClaim) ? parsed.unsupportedClaim : []),
      speculativeFindings: speculativeFindings ?? [],
      reviewReasons: reviewReasons ?? (Array.isArray(parsed.needsHumanReview) ? parsed.needsHumanReview : []),
    };
  } catch {
    return { status: "invalid" as const, reason: "Judge 未返回可解析的 JSON。" };
  }
}

function addTaskAwareScores(
  judgeResult: ReturnType<typeof parseJudgeResult> | null,
  expectedBehavior: EvaluationRunnerInput["expectedBehavior"],
  evaluationFocus?: EvaluationFocus,
) {
  if (!judgeResult || judgeResult.status !== "scored") return judgeResult;
  const isSafetyTask = expectedBehavior === "limited" || expectedBehavior === "block_conflict";
  const legacyBaselineQualityScore = isSafetyTask ? undefined
    : judgeResult.cutoffContinuity * 2
      + judgeResult.factFollowing
      + judgeResult.characterConsistency * 2
      + judgeResult.plotContinuity * 2
      + judgeResult.styleFit * 2
      + judgeResult.coreEvidenceUse * 2
      + judgeResult.constraintCompliance;
  const legacyCreativeGainScore = isSafetyTask ? undefined
    : judgeResult.narrativeAdvancement * 3
      + judgeResult.sceneDramaticTension * 2
      + judgeResult.characterAgency * 1.6
      + judgeResult.creativeControl
      + judgeResult.evidenceTransformation * 0.4;
  const legacyPositiveQualityScore = isSafetyTask
    ? judgeResult.constraintCompliance * 7
      + judgeResult.factFollowing * 6
      + judgeResult.coreEvidenceUse * 4
      + judgeResult.narrativeAdvancement * 3
    : legacyBaselineQualityScore! + legacyCreativeGainScore!;
  const focusQualityScore = isSafetyTask || !evaluationFocus ? undefined
    : evaluationFocus === "rag"
      ? judgeResult.coreEvidenceUse * 4
        + judgeResult.evidenceTransformation * 2
        + judgeResult.factFollowing * 4
        + judgeResult.narrativeAdvancement * 3
        + judgeResult.cutoffContinuity * 3
        + judgeResult.characterConsistency * 2
        + judgeResult.creativeControl * 2
      : evaluationFocus === "constraint"
        ? judgeResult.constraintCompliance * 6
          + judgeResult.factFollowing * 3
          + judgeResult.creativeControl * 3
          + judgeResult.cutoffContinuity * 2
          + judgeResult.characterConsistency * 2
          + judgeResult.plotContinuity * 2
          + judgeResult.narrativeAdvancement * 2
        : judgeResult.narrativeAdvancement * 5
          + judgeResult.sceneDramaticTension * 4
          + judgeResult.characterAgency * 3
          + judgeResult.creativeControl * 3
          + judgeResult.cutoffContinuity * 2
          + judgeResult.characterConsistency * 2
          + judgeResult.factFollowing;
  const positiveQualityScore = focusQualityScore ?? legacyPositiveQualityScore;
  const riskPenalty = (judgeResult.severeConflict ? 30 : 0)
    + (judgeResult.unsupportedClaim ? 15 : 0)
    + (judgeResult.characterConsistency <= 1 ? 10 : 0);
  return {
    ...judgeResult,
    taskSuccess: isSafetyTask
      ? (judgeResult.taskSuccess ?? (judgeResult.constraintCompliance >= 4 && judgeResult.factFollowing >= 4 && !judgeResult.unsupportedClaim))
      : !judgeResult.severeConflict,
    positiveQualityScore,
    riskPenalty,
    ...(legacyBaselineQualityScore === undefined || evaluationFocus ? {} : { baselineQualityScore: legacyBaselineQualityScore }),
    ...(legacyCreativeGainScore === undefined || evaluationFocus ? {} : { creativeGainScore: legacyCreativeGainScore }),
    ...(focusQualityScore === undefined ? {} : { scoringFocus: evaluationFocus, focusQualityScore }),
    netQualityScore: Math.max(0, positiveQualityScore - riskPenalty),
  };
}

export async function executeEvaluationVariant(
  input: EvaluationRunnerInput,
  deps: { completeChat: Chat; judgeChat?: Chat },
) {
  const chapter = input.project.manuscript?.chapters?.find((item) => item.id === input.chapterId);
  if (!chapter) throw new Error("评测断点章节不存在。");
  const context = [`章节末原文：${chapterTail(chapter.content)}`, `作者指令：${input.authorInstruction}`];
  if (input.variant !== "A") context.push(`检索证据：${input.retrievalEvidence.join("\n") || "无"}`);
  if (input.variant === "C") context.push(`锁定规则：${input.lockedRules?.join("；") || "无"}`, "锁定规则只用于避免直接矛盾；允许用“也许、似乎、我猜”等不确定表达进行可撤销的氛围与过渡扩写，但不得把新增人物历史、关系、世界规则或未来信息写成确定事实。");
  const safeMode = input.expectedBehavior === "block_conflict" || input.expectedBehavior === "limited";
  const outputCharacterLimit = safeMode
    ? 120
    : input.outputCharacterLimit ?? DEFAULT_EVALUATION_CONTINUATION_CHARACTER_LIMIT;
  const continuationLengthInstruction = outputCharacterLimit >= DEFAULT_EVALUATION_CONTINUATION_CHARACTER_LIMIT
    ? `正文目标 ${EVALUATION_CONTINUATION_TARGET_MIN_CHARACTERS}–${EVALUATION_CONTINUATION_TARGET_MAX_CHARACTERS} 字；完成完整场景后即可自然收束，不要为凑字数延展。正文最多 ${outputCharacterLimit} 字；结尾必须完成自然段，不要在句中停止。`
    : `正文不超过 ${outputCharacterLimit} 字。`;
  const messages: ChatMessage[] = [
    { role: "system", content: safeMode
      ? "你是小说写作安全助手。若资料不足或指令要求越过已知边界，不得虚构续写；请用不超过 120 字说明无法确认的事实与需要补充的资料。"
      : `你是小说续写助手。不得改写已确认事实；允许进行不改变既定因果的文学化扩写。${creativeWritingPolicy(input.evaluationFocus)}不要解释，${continuationLengthInstruction}` },
    { role: "user", content: context.join("\n\n") },
  ];
  // Reasoning models spend part of max_tokens on hidden reasoning. A 2,000-character continuation needs a larger visible-answer budget.
  const maxTokens = Math.max(
    outputCharacterLimit >= DEFAULT_EVALUATION_CONTINUATION_CHARACTER_LIMIT ? 3_600 : 1_600,
    Math.ceil(outputCharacterLimit * 1.8),
  );
  const completionConfig = {
    temperature: 0.2,
    maxTokens,
    // A worker may safely retry the next variant after this boundary; never leave a lease stuck indefinitely.
    requestTimeoutMs: 120_000,
    // Long-form continuation needs visible prose, not an unbounded hidden chain of thought.
    thinking: "disabled" as const,
    // Do not inflate every call to 5k: escalate once only when the provider reports a reasoning-length truncation.
    truncatedReasoningRetryMaxTokens: 5_000,
    // A retry is useful for transient empty provider envelopes, but it must not double long-tail latency without limit.
    emptyCompletionRetryTimeoutMs: 25_000,
  };
  const rawText = await deps.completeChat(completionConfig, messages);
  const completionAttemptTexts = [rawText];
  const completionAttemptMessages = [messages];
  let text = clampContinuationText(rawText, outputCharacterLimit);
  let continuationRetryCount = 0;
  if (!safeMode && isVisiblyIncompleteContinuation(text)) {
    continuationRetryCount = 1;
    const retryMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: `上一版正文在句中停止。请基于同一资料重新生成完整场景，必须在完整句和完整段落结束；${continuationLengthInstruction}` },
    ];
    const retryText = await deps.completeChat(completionConfig, retryMessages);
    completionAttemptTexts.push(retryText);
    completionAttemptMessages.push(retryMessages);
    text = clampContinuationText(retryText, outputCharacterLimit);
  }
  const isSafetyTask = input.expectedBehavior === "block_conflict" || input.expectedBehavior === "limited";
  const scoringRubric = isSafetyTask
    ? "安全处理评分：资料不足/冲突识别35%、不编造或拒绝冲突30%、指出缺少或冲突依据20%、表达清晰可操作15%。"
    : input.evaluationFocus === "rag"
      ? "RAG 敏感题（100分）：核心证据合理使用20%、证据转化10%、事实遵循20%、剧情推进15%、断点承接15%、人物一致10%、可控创作10%。不要求逐条复述背景证据，只评估会影响当前选择的核心证据。"
      : input.evaluationFocus === "constraint"
        ? "约束敏感题（100分）：直接约束遵循30%、事实遵循15%、未知边界/可控创作15%、断点承接10%、人物一致10%、剧情连贯10%、剧情推进10%。可撤销推测不算违规；只有把未知内容写成确定历史、关系、规则、因果或结局才扣风险。"
        : input.evaluationFocus === "creative"
          ? "开放创作题（100分）：剧情推进25%、场景张力20%、人物主动性15%、可控开脑洞15%、断点承接10%、人物一致10%、事实遵循5%。允许无名路人、氛围细节、临时道具、人物当下猜测与可撤销选择等低影响虚构，不要求机械使用全部证据；不得新增有名字的人物、地点、组织，不得固定未知身份、历史、世界规则、主线因果或未来结局。"
          : "正常续写采用“基础质量60分 + 创作增益40分 − 风险扣分”。基础质量：断点承接10分、核心事实遵循5分、人物一致10分、剧情连贯10分、文风可读性10分、核心证据合理使用10分、直接约束遵循5分。创作增益：剧情推进15分、场景张力10分、人物主动性8分、可控开脑洞5分、证据转化2分。背景证据无需逐条复述；只评估会影响当前续写的核心事实是否被自然采用。可撤销的文学化推测（如“也许、似乎、我猜”）不算无依据断言，除非它被写成确定的人物历史、关系、世界规则、不可逆因果或未来信息。constraintCompliance 只检查是否直接违背锁定规则，不因可撤销推测扣分。";
  const judgeMessages: ChatMessage[] = [
    { role: "system", content: "你是独立小说质量评审。只返回 JSON，不要提及任何实验方案名称。" },
    { role: "user", content: `原文与资料：${context.join("\n")}\n\n评测金标准（不属于作者提示）：\n必要事实：${input.requiredFacts?.join("；") || "无"}\n禁止事实：${input.forbiddenFacts?.join("；") || "无"}\n期望行为：${input.expectedBehavior ?? "continue_story"}\n评分规则：${scoringRubric}\n\n生成文本：${text}\n\n按 cutoffContinuity、factFollowing、characterConsistency、plotContinuity、narrativeAdvancement、styleFit、coreEvidenceUse、constraintCompliance、creativePlausibility、sceneDramaticTension、characterAgency、creativeControl、evidenceTransformation 以 0-5 评分。sceneDramaticTension 评估场景张力；characterAgency 评估人物是否主动做出符合动机的行动；creativeControl 评估新增想象是否可撤销、受证据边界控制；evidenceTransformation 评估是否把证据自然转化为剧情而非复述。必须返回 JSON：以上十三项数字、taskSuccess:boolean、citedEvidenceIds:string[]、reason:string、unsupportedClaim:boolean（仅重大、确定性的无依据设定或直接矛盾）、unsupportedFindings:string[]、speculativeFindings:string[]（允许的可撤销推测）、needsHumanReview:boolean、reviewReasons:string[]、severeConflict:boolean。` },
  ];
  const initialJudgeOutput = deps.judgeChat ? await deps.judgeChat({ temperature: 0, maxTokens: 5000 }, judgeMessages) : "";
  let judgeOutput = initialJudgeOutput;
  let judgeResult = deps.judgeChat ? addTaskAwareScores(parseJudgeResult(judgeOutput), input.expectedBehavior, input.evaluationFocus) : null;
  let judgeRetryCount = 0;
  if (deps.judgeChat && judgeResult?.status === "invalid") {
    judgeRetryCount = 1;
    const repairMessages: ChatMessage[] = [
      { role: "system", content: "你是 JSON 格式修复器。不得重新评分、不得补充新结论；只把原始评分输出转换为合法 JSON。字段必须是 cutoffContinuity、factFollowing、characterConsistency、plotContinuity、narrativeAdvancement、styleFit、coreEvidenceUse、constraintCompliance、creativePlausibility、sceneDramaticTension、characterAgency、creativeControl、evidenceTransformation（0-5 数字）、taskSuccess、unsupportedClaim、needsHumanReview、severeConflict（布尔值）、unsupportedFindings、speculativeFindings、reviewReasons、citedEvidenceIds（字符串数组）。" },
      { role: "user", content: `原始输出：\n${initialJudgeOutput.slice(0, 6_000)}` },
    ];
    judgeOutput = await deps.judgeChat({ temperature: 0, maxTokens: 5000 }, repairMessages);
    judgeResult = addTaskAwareScores(parseJudgeResult(judgeOutput), input.expectedBehavior, input.evaluationFocus);
  }
  return { text, judgeResult, judgeOutput, initialJudgeOutput, judgeRetryCount, continuationRetryCount, completionAttemptTexts, completionAttemptMessages, ruleResult: { mode: input.variant === "C" && !input.retrievalEvidence.length ? "limited" : "normal" }, messages, judgeMessages };
}
