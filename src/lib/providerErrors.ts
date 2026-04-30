export const TRANSLATION_SETUP_REQUIRED_MESSAGE =
  "Translation is not set up yet.";
export const TRANSLATION_SETUP_REQUIRED_DETAIL =
  "Open Settings to add a provider.";

export type FriendlyProviderError = {
  kind:
    | "setup-required"
    | "invalid-api-key"
    | "base-url"
    | "network-request"
    | "model"
    | "rate-limit"
    | "usage-limit"
    | "context-limit"
    | "provider-response"
    | "provider-unavailable"
    | "local-cache"
    | "timeout"
    | "unknown";
  message: string;
  rawMessage: string;
  checks?: string[];
};

function normalizeErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

export function getFriendlyProviderError(
  error: unknown,
): FriendlyProviderError {
  const rawMessage = normalizeErrorMessage(error).trim();
  const normalized = rawMessage.toLowerCase();

  if (
    normalized.includes("no active preset configured") ||
    normalized.includes("no preset configured") ||
    normalized.includes("api key is missing") ||
    normalized.includes("base url is missing")
  ) {
    return {
      kind: "setup-required",
      message: TRANSLATION_SETUP_REQUIRED_MESSAGE,
      rawMessage,
    };
  }

  if (
    normalized.includes("invalid api key") ||
    normalized.includes("incorrect api key") ||
    normalized.includes("api key was not accepted") ||
    normalized.includes("unauthorized") ||
    normalized.includes("401")
  ) {
    return {
      kind: "invalid-api-key",
      message: "This API key was not accepted. Check it and try again.",
      rawMessage,
    };
  }

  if (
    (normalized.includes("model") && normalized.includes("not found")) ||
    normalized.includes("unknown model") ||
    normalized.includes("invalid model")
  ) {
    return {
      kind: "model",
      message:
        "This model is not available for the selected provider. Check the model name in Settings.",
      rawMessage,
    };
  }

  if (
    normalized.includes("base url") ||
    normalized.includes("not found") ||
    normalized.includes("404") ||
    normalized.includes("does not use a base url") ||
    normalized.includes("enotfound") ||
    normalized.includes("dns")
  ) {
    return {
      kind: "base-url",
      message:
        "This provider address looks wrong. Check the Base URL and try again.",
      rawMessage,
    };
  }

  if (
    normalized.includes("error sending request") ||
    normalized.includes("error trying to connect") ||
    normalized.includes("client error (connect)") ||
    normalized.includes("connection refused") ||
    normalized.includes("connection reset") ||
    normalized.includes("connection closed before message completed") ||
    normalized.includes("broken pipe") ||
    normalized.includes("tls") ||
    normalized.includes("certificate")
  ) {
    return {
      kind: "network-request",
      message: "Could not reach the translation service.",
      rawMessage,
      checks: [
        "Check your network connection.",
        "If you use a VPN or proxy, make sure it allows this request.",
        "Check the Base URL in Settings.",
        "The service may be temporarily unavailable.",
      ],
    };
  }

  if (
    normalized.includes("too many requests") ||
    normalized.includes("rate limit") ||
    normalized.includes("429")
  ) {
    return {
      kind: "rate-limit",
      message:
        "Too many requests right now. Please wait a moment and try again.",
      rawMessage,
    };
  }

  if (
    normalized.includes("quota") ||
    normalized.includes("insufficient") ||
    normalized.includes("credit") ||
    normalized.includes("balance") ||
    normalized.includes("payment required") ||
    normalized.includes("402")
  ) {
    return {
      kind: "usage-limit",
      message: "This account may be out of credits or usage.",
      rawMessage,
    };
  }

  if (
    normalized.includes("maximum context length") ||
    normalized.includes("context_length_exceeded") ||
    normalized.includes("prompt is too long") ||
    normalized.includes("too many tokens") ||
    normalized.includes("context window") ||
    normalized.includes("input is too long")
  ) {
    return {
      kind: "context-limit",
      message:
        "This page is too large for the current model to translate in one go. Try again with a larger model or cleaner OCR text.",
      rawMessage,
    };
  }

  if (
    normalized.includes("service unavailable") ||
    normalized.includes("bad gateway") ||
    normalized.includes("gateway timeout") ||
    normalized.includes("502") ||
    normalized.includes("503") ||
    normalized.includes("504")
  ) {
    return {
      kind: "provider-unavailable",
      message:
        "The translation service is temporarily unavailable. Please try again shortly.",
      rawMessage,
    };
  }

  if (
    normalized.includes("could not save this page locally") ||
    normalized.includes("could not save these results locally") ||
    normalized.includes("could not read the local translation cache")
  ) {
    return {
      kind: "local-cache",
      message:
        "The translation finished, but readani could not update its local cache. You may need to translate this page again later.",
      rawMessage,
    };
  }

  if (
    normalized.includes("returned unreadable json") ||
    normalized.includes("failed to parse translation json") ||
    normalized.includes("returned no choices") ||
    normalized.includes("without text content") ||
    normalized.includes("unsupported response format") ||
    normalized.includes("returned an empty translation")
  ) {
    return {
      kind: "provider-response",
      message:
        "The translation service replied, but the result could not be understood. Please try again.",
      rawMessage,
    };
  }

  if (
    normalized.includes("timed out") ||
    normalized.includes("timeout") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("network") ||
    normalized.includes("connection") ||
    normalized.includes("socket")
  ) {
    return {
      kind: "timeout",
      message: "The provider took too long to respond. Please try again.",
      rawMessage,
    };
  }

  return {
    kind: "unknown",
    message: rawMessage || "Translation failed.",
    rawMessage,
  };
}

export type TranslateAllSlowModeErrorAction =
  | "retry"
  | "pause"
  | "skip"
  | "stop";

export function getTranslateAllSlowModeErrorAction(
  kind: FriendlyProviderError["kind"],
): TranslateAllSlowModeErrorAction {
  switch (kind) {
    case "rate-limit":
    case "network-request":
    case "timeout":
    case "provider-unavailable":
    case "provider-response":
    case "unknown":
      return "retry";
    case "usage-limit":
      return "pause";
    case "context-limit":
      return "skip";
    default:
      return "stop";
  }
}

export function getProviderErrorDetail(error: unknown) {
  const friendly = getFriendlyProviderError(error);
  const rawMessage = friendly.rawMessage.trim();

  if (!rawMessage || rawMessage === friendly.message) {
    return undefined;
  }

  return rawMessage;
}
