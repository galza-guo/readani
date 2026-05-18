type ProviderFormLike = {
  kind: "openrouter" | "deepseek" | "ollama" | "openai-compatible" | "openai" | "google-gemini" | "siliconflow" | "dashscope" | "modelscope";
  baseUrl?: string;
  apiKey?: string;
  apiKeyConfigured?: boolean;
};

export function canListModels(provider: ProviderFormLike) {
  if (provider.kind === "openrouter" || provider.kind === "deepseek") {
    return Boolean(provider.apiKey?.trim() || provider.apiKeyConfigured);
  }

  if (provider.kind === "ollama") {
    return Boolean(provider.baseUrl?.trim());
  }

  if (
    provider.kind === "openai"
    || provider.kind === "google-gemini"
    || provider.kind === "siliconflow"
    || provider.kind === "dashscope"
    || provider.kind === "modelscope"
  ) {
    return Boolean(provider.apiKey?.trim() || provider.apiKeyConfigured);
  }

  return Boolean(
    provider.baseUrl?.trim() && (provider.apiKey?.trim() || provider.apiKeyConfigured)
  );
}
