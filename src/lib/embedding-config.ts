type EnvLike = Record<string, string | undefined>;

export type EmbeddingConfig = {
  baseUrl: string;
  apiKey: string;
  model: "qwen3.7-text-embedding";
  dimensions: 1024;
};

export function getEmbeddingConfig(env: EnvLike): EmbeddingConfig {
  const required = ["AI_EMBEDDING_BASE_URL", "AI_EMBEDDING_API_KEY", "AI_EMBEDDING_MODEL", "AI_EMBEDDING_DIMENSIONS"];
  const missing = required.filter((key) => !env[key]?.trim());
  if (missing.length) throw new Error(`Embedding config missing: ${missing.join(", ")}`);
  if (env.AI_EMBEDDING_MODEL!.trim() !== "qwen3.7-text-embedding") {
    throw new Error("Embedding model must be qwen3.7-text-embedding");
  }
  if (Number(env.AI_EMBEDDING_DIMENSIONS) !== 1024) throw new Error("Embedding dimensions must be 1024");

  return {
    baseUrl: env.AI_EMBEDDING_BASE_URL!.trim().replace(/\/+$/, ""),
    apiKey: env.AI_EMBEDDING_API_KEY!.trim(),
    model: "qwen3.7-text-embedding",
    dimensions: 1024,
  };
}
