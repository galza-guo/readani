import { describe, expect, test } from "bun:test";
import {
  TRANSLATION_SETUP_REQUIRED_MESSAGE,
  type FriendlyProviderError,
  getProviderErrorDetail,
  getFriendlyProviderError,
  getTranslateAllSlowModeErrorAction,
} from "./providerErrors";

describe("provider error mapping", () => {
  test("maps missing setup states to the shared onboarding message", () => {
    expect(getFriendlyProviderError("No active preset configured.")).toEqual({
      kind: "setup-required",
      message: TRANSLATION_SETUP_REQUIRED_MESSAGE,
      rawMessage: "No active preset configured.",
    });

    expect(
      getFriendlyProviderError("OpenRouter API key is missing.").kind,
    ).toBe("setup-required");
  });

  test("maps common provider failures to plain English", () => {
    expect(getFriendlyProviderError("401 Unauthorized").message).toBe(
      "This API key was not accepted. Check it and try again.",
    );
    expect(getFriendlyProviderError("Model not found: gpt-xyz").message).toBe(
      "This model is not available for the selected provider. Check the model name in Settings.",
    );
    expect(
      getFriendlyProviderError("Custom base URL is missing.").message,
    ).toBe("Translation is not set up yet.");
    expect(getFriendlyProviderError("404 Not Found").message).toBe(
      "This provider address looks wrong. Check the Base URL and try again.",
    );
    expect(getFriendlyProviderError("429 Too Many Requests").message).toBe(
      "Too many requests right now. Please wait a moment and try again.",
    );
    expect(getFriendlyProviderError("Insufficient balance").message).toBe(
      "This account may be out of credits or usage.",
    );
    expect(getFriendlyProviderError("Translation timed out.").message).toBe(
      "The provider took too long to respond. Please try again.",
    );
    expect(
      getFriendlyProviderError(
        "OpenRouter error: 400 maximum context length exceeded for this model",
      ).message,
    ).toBe(
      "This page is too large for the current model to translate in one go. Try again with a larger model or cleaner OCR text.",
    );
    expect(
      getFriendlyProviderError(
        "OpenRouter returned unreadable JSON: expected value",
      ).message,
    ).toBe(
      "The translation service replied, but the result could not be understood. Please try again.",
    );
    expect(
      getFriendlyProviderError(
        "Translation succeeded, but readani could not save this page locally: Permission denied",
      ).message,
    ).toBe(
      "The translation finished, but readani could not update its local cache. You may need to translate this page again later.",
    );
    expect(
      getFriendlyProviderError(
        "error sending request for url (https://api-inference.modelscope.cn/v1/chat/completions)",
      ).message,
    ).toBe("Could not reach the translation service.");
    expect(
      getFriendlyProviderError(
        "error sending request for url (https://api-inference.modelscope.cn/v1/chat/completions)",
      ).checks,
    ).toEqual([
      "Check your network connection.",
      "If you use a VPN or proxy, make sure it allows this request.",
      "Check the Base URL in Settings.",
      "The service may be temporarily unavailable.",
    ]);
  });

  test("falls back to the original message when no match is found", () => {
    expect(
      getFriendlyProviderError("Provider returned malformed JSON."),
    ).toEqual({
      kind: "unknown",
      message: "Provider returned malformed JSON.",
      rawMessage: "Provider returned malformed JSON.",
    });
  });

  test("preserves raw provider detail for warning tooltips and toasts", () => {
    expect(
      getProviderErrorDetail(
        "OpenRouter error: 429 Too Many Requests insufficient_quota",
      ),
    ).toBe("OpenRouter error: 429 Too Many Requests insufficient_quota");
    expect(getProviderErrorDetail("Provider returned malformed JSON.")).toBe(
      undefined,
    );
  });
});

describe("getTranslateAllSlowModeErrorAction", () => {
  const retryKinds: FriendlyProviderError["kind"][] = [
    "rate-limit",
    "network-request",
    "timeout",
    "provider-unavailable",
    "provider-response",
    "unknown",
  ];
  const pauseKinds: FriendlyProviderError["kind"][] = ["usage-limit"];
  const skipKinds: FriendlyProviderError["kind"][] = ["context-limit"];
  const stopKinds: FriendlyProviderError["kind"][] = [
    "setup-required",
    "invalid-api-key",
    "base-url",
    "model",
    "local-cache",
  ];

  test.each(retryKinds)("classifies %s as retry", (kind) => {
    expect(getTranslateAllSlowModeErrorAction(kind)).toBe("retry");
  });

  test.each(pauseKinds)("classifies %s as pause", (kind) => {
    expect(getTranslateAllSlowModeErrorAction(kind)).toBe("pause");
  });

  test.each(skipKinds)("classifies %s as skip", (kind) => {
    expect(getTranslateAllSlowModeErrorAction(kind)).toBe("skip");
  });

  test.each(stopKinds)("classifies %s as stop", (kind) => {
    expect(getTranslateAllSlowModeErrorAction(kind)).toBe("stop");
  });
});
