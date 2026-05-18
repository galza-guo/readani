type ProviderFormLike = {
  kind: "openrouter" | "deepseek" | "ollama" | "openai-compatible" | "openai" | "google-gemini" | "siliconflow-cn" | "siliconflow-com" | "dashscope" | "modelscope" | "minimax-io" | "minimaxi" | "zai" | "bigmodel";
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
    ||     provider.kind === "siliconflow-cn"
    || provider.kind === "siliconflow-com"
    || provider.kind === "dashscope"
    || provider.kind === "modelscope"
    || provider.kind === "minimax-io"
    || provider.kind === "minimaxi"
    || provider.kind === "zai"
    || provider.kind === "bigmodel"
  ) {
    return Boolean(provider.apiKey?.trim() || provider.apiKeyConfigured);
  }

  return Boolean(
    provider.baseUrl?.trim() && (provider.apiKey?.trim() || provider.apiKeyConfigured)
  );
}
