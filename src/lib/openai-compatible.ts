import type { AiProviderConfig } from "./ai-config";
import type { EmbeddingConfig } from "./embedding-config";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export async function createOpenAiCompatibleEmbeddings(
  config: EmbeddingConfig,
  texts: string[],
  fetchImpl: FetchLike = fetch,
): Promise<number[][]> {
  const response = await fetchImpl(`${config.baseUrl}/embeddings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.model, input: texts, dimensions: config.dimensions }),
  });
  if (!response.ok) throw new Error(`Embedding request failed with status ${response.status}`);
  const body = await response.json() as { data?: Array<{ index?: number; embedding?: unknown }> };
  const byIndex = new Map(body.data?.map((item) => [item.index, item.embedding]) ?? []);
  return texts.map((_, index) => {
    const vector = byIndex.get(index);
    if (!Array.isArray(vector) || vector.length !== 1024 || vector.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
      throw new Error("Embedding vector dimension mismatch");
    }
    return vector;
  });
}

export type StreamOpenAiCompatibleOptions = {
  fetchImpl?: FetchLike;
  onToken?: (token: string) => void;
  signal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
  /** Disable hidden reasoning for long-form generation on providers that support the OpenAI-compatible toggle. */
  thinking?: "disabled";
  responseFormat?: "json_object";
};

export type CompleteOpenAiCompatibleOptions = {
  fetchImpl?: FetchLike;
  signal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
  /** Hard wall-clock limit for the first non-streaming request. */
  requestTimeoutMs?: number;
  /** Disable hidden reasoning for long-form generation on providers that support the OpenAI-compatible toggle. */
  thinking?: "disabled";
  /** Only used when a reasoning model exhausts its output budget before emitting visible text. */
  truncatedReasoningRetryMaxTokens?: number;
  /** Caps the one-off empty-completion retry so a degraded provider cannot stall an evaluation indefinitely. */
  emptyCompletionRetryTimeoutMs?: number;
  /** Requests a valid JSON object from providers that implement the OpenAI-compatible JSON mode. */
  responseFormat?: "json_object";
};

function getChatCompletionsUrl(baseUrl: string) {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

function extractStreamDelta(line: string) {
  const json = JSON.parse(line);
  const choice = json?.choices?.[0];
  const content = choice?.delta?.content ?? choice?.message?.content;
  const reasoning = choice?.delta?.reasoning_content ?? choice?.message?.reasoning_content;
  return {
    content: typeof content === "string" ? content : null,
    reasoning: typeof reasoning === "string" ? reasoning : null,
    finishReason: typeof choice?.finish_reason === "string" ? choice.finish_reason : null,
  };
}

function isProviderTimeout(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /timeout|timed out/i.test(message);
}

function isTransientProviderTransportError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /fetch failed|ECONNRESET|ECONNREFUSED|socket hang up|network error/i.test(message);
}

export async function completeOpenAiCompatibleChat(
  config: AiProviderConfig,
  messages: ChatMessage[],
  options: CompleteOpenAiCompatibleOptions = {},
): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const requestCompletion = async (maxTokens: number | undefined, timeoutMs?: number) => {
    let response: Response;
    const timeoutSignal = typeof timeoutMs === "number" ? AbortSignal.timeout(timeoutMs) : undefined;
    const signal = timeoutSignal && options.signal
      ? AbortSignal.any([options.signal, timeoutSignal])
      : timeoutSignal ?? options.signal;
    try {
      response = await fetchImpl(getChatCompletionsUrl(config.baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: false,
        ...(typeof options.temperature === "number" ? { temperature: options.temperature } : {}),
        ...(typeof maxTokens === "number" ? { max_tokens: maxTokens } : {}),
        ...(options.thinking === "disabled" ? { thinking: { type: "disabled" } } : {}),
        ...(options.responseFormat === "json_object" ? { response_format: { type: "json_object" } } : {}),
      }),
      signal,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown network error";
      throw new Error(`AI provider request failed before response: ${reason}`, { cause: error });
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`AI request failed with status ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`);
    }

    let body: {
      choices?: Array<{
        finish_reason?: unknown;
        message?: { content?: unknown; reasoning_content?: unknown };
      }>;
    };
    try {
      body = await response.json() as typeof body;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown response-body error";
      throw new Error(`AI provider response could not be read: ${reason}`, { cause: error });
    }
    const choice = body.choices?.[0];
    return {
      content: choice?.message?.content,
      finishReason: typeof choice?.finish_reason === "string" ? choice.finish_reason : "unknown",
      reasoningChars: typeof choice?.message?.reasoning_content === "string" ? choice.message.reasoning_content.length : 0,
    };
  };

  const fallbackToStreaming = async (error: unknown, maxTokens: number | undefined) => {
    if (!isProviderTimeout(error)) throw error;
    // A timed-out response is usually still generating. Give the stream the existing
    // reasoning-length retry budget, but only on this timeout fallback.
    const streamingMaxTokens = typeof options.truncatedReasoningRetryMaxTokens === "number"
      && options.truncatedReasoningRetryMaxTokens > (maxTokens ?? 0)
      ? options.truncatedReasoningRetryMaxTokens
      : maxTokens;
    try {
      return await streamOpenAiCompatibleChat(config, messages, {
        fetchImpl,
        signal: options.signal,
        temperature: options.temperature,
        maxTokens: streamingMaxTokens,
        thinking: options.thinking,
        responseFormat: options.responseFormat,
      });
    } catch (streamError) {
      const original = error instanceof Error ? error.message : String(error);
      const fallback = streamError instanceof Error ? streamError.message : String(streamError);
      throw new Error(`AI provider non-streaming request timed out; streaming fallback also failed: ${fallback}`, { cause: new Error(original) });
    }
  };

  let completion;
  try {
    completion = await requestCompletion(options.maxTokens, options.requestTimeoutMs);
  } catch (error) {
    if (!isTransientProviderTransportError(error)) {
      return fallbackToStreaming(error, options.maxTokens);
    }
    try {
      completion = await requestCompletion(options.maxTokens, options.requestTimeoutMs);
    } catch (retryError) {
      return fallbackToStreaming(retryError, options.maxTokens);
    }
  }
  if (typeof completion.content !== "string" || !completion.content.trim()) {
    const shouldEscalateTruncatedReasoning = completion.finishReason === "length"
      && completion.reasoningChars > 0
      && typeof options.truncatedReasoningRetryMaxTokens === "number"
      && options.truncatedReasoningRetryMaxTokens > (options.maxTokens ?? 0);
    // Providers occasionally return a successful envelope with an empty message. Retry once at the same budget;
    // reserve the more expensive 5k retry for the explicit reasoning-length case only.
    const retryMaxTokens = shouldEscalateTruncatedReasoning ? options.truncatedReasoningRetryMaxTokens : options.maxTokens;
    try {
      completion = await requestCompletion(retryMaxTokens, options.emptyCompletionRetryTimeoutMs);
    } catch (error) {
      return fallbackToStreaming(error, retryMaxTokens);
    }
  }
  const content = completion.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error(`AI response did not include completion text (finish_reason=${completion.finishReason}, reasoning_chars=${completion.reasoningChars})`);
  }
  return content;
}

export async function streamOpenAiCompatibleChat(
  config: AiProviderConfig,
  messages: ChatMessage[],
  options: StreamOpenAiCompatibleOptions = {},
): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  let response;
  try {
    response = await fetchImpl(getChatCompletionsUrl(config.baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: true,
        ...(typeof options.temperature === "number" ? { temperature: options.temperature } : {}),
        ...(typeof options.maxTokens === "number" ? { max_tokens: options.maxTokens } : {}),
        ...(options.thinking === "disabled" ? { thinking: { type: "disabled" } } : {}),
        ...(options.responseFormat === "json_object" ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: options.signal,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown network error";
    throw new Error(`AI provider request failed before response: ${reason}`, { cause: error });
  }

  if (!response.ok) {
    throw new Error(`AI request failed with status ${response.status}`);
  }

  if (!response.body) {
    throw new Error("AI response stream is empty");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let output = "";
  let reasoningChars = 0;
  let finishReason = "unknown";

  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) {
      return;
    }

    const data = trimmed.slice(5).trim();
    if (!data || data === "[DONE]") {
      return;
    }

    const delta = extractStreamDelta(data);
    if (delta.reasoning) {
      reasoningChars += delta.reasoning.length;
    }
    if (delta.finishReason) {
      finishReason = delta.finishReason;
    }
    if (!delta.content) {
      return;
    }

    output += delta.content;
    options.onToken?.(delta.content);
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
      handleLine(line);
    }
  }

  pending += decoder.decode();
  if (pending) {
    handleLine(pending);
  }

  if (!output) {
    throw new Error(`AI response did not include continuation text (finish_reason=${finishReason}, reasoning_chars=${reasoningChars})`);
  }

  return output;
}
