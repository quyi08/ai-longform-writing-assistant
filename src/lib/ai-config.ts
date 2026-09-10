export type AiPurpose = "writer" | "planner" | "summary" | "memory" | "diagnosis" | "characterAuditor" | "evaluationJudge";

export type AiProviderConfig = {
  purpose: AiPurpose;
  baseUrl: string;
  apiKey: string;
  model: string;
};

type EnvLike = Record<string, string | undefined>;

const envPrefixByPurpose: Record<AiPurpose, string> = {
  writer: "AI_WRITER",
  planner: "AI_PLANNER",
  summary: "AI_SUMMARY",
  memory: "AI_MEMORY",
  diagnosis: "AI_DIAGNOSIS",
  characterAuditor: "AI_CHARACTER_AUDITOR",
  evaluationJudge: "AI_EVALUATION_JUDGE",
};

export function getMissingAiProviderFields(env: EnvLike, purpose: AiPurpose): string[] {
  const prefix = envPrefixByPurpose[purpose];
  return [`${prefix}_BASE_URL`, `${prefix}_API_KEY`, `${prefix}_MODEL`].filter(
    (key) => !env[key]?.trim(),
  );
}

export function getAiProviderConfig(env: EnvLike, purpose: AiPurpose): AiProviderConfig {
  const prefix = envPrefixByPurpose[purpose];
  const missing = getMissingAiProviderFields(env, purpose);

  if (missing.length) {
    throw new Error(`AI provider config missing: ${missing.join(", ")}`);
  }

  return {
    purpose,
    baseUrl: env[`${prefix}_BASE_URL`]!.trim().replace(/\/+$/, ""),
    apiKey: env[`${prefix}_API_KEY`]!.trim(),
    model: env[`${prefix}_MODEL`]!.trim(),
  };
}
