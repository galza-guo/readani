# Add Five New Translation Providers

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add OpenAI, Google Gemini, SiliconFlow, DashScope, and ModelScope as first-class translation providers alongside the existing OpenRouter, DeepSeek, Ollama, and OpenAI-Compatible.

**Architecture:** Each new provider follows the existing pattern: a `TranslationProviderKind` variant in TypeScript, a `ProviderKind` variant in Rust, with a default base URL, API key requirement, and optional reasoning mode. The Rust backend shapes the chat completion payload per-provider. The frontend shows/hides fields and reasoning controls based on provider capabilities.

**Tech Stack:** TypeScript (types, settings), Rust (backend provider logic), CSS (no changes needed — existing styles cover all providers).

---

## Provider Summary

| Provider      | Kind Value         | Base URL                                                | API Key | Reasoning UI          | Payload Shape                       | Default Model           |
|---------------|--------------------|---------------------------------------------------------|---------|-----------------------|-------------------------------------|-------------------------|
| OpenAI        | `openai`             | `https://api.openai.com/v1/`                            | Yes     | Standard (off/low/med/high) | `{"reasoning_effort": "high"}`        | `gpt-4o-mini`            |
| Google Gemini | `google-gemini`      | `https://generativelanguage.googleapis.com/v1beta/openai/` | Yes     | Standard (off/low/med/high) | `{"reasoning_effort": "high"}`        | `gemini-2.5-flash`        |
| SiliconFlow   | `siliconflow`        | `https://api.siliconflow.cn/v1/`                        | Yes     | Thinking (off/on)       | `{"enable_thinking": true}`            | `Qwen/Qwen3-235B-A22B`    |
| DashScope     | `dashscope`          | `https://dashscope.aliyuncs.com/compatible-mode/v1/`    | Yes     | Thinking (off/on)       | `{"enable_thinking": true}`            | `qwen-plus`               |
| ModelScope    | `modelscope`         | `https://api-inference.modelscope.cn/v1/`               | Yes     | None                   | (none)                              | `Qwen/Qwen3-8B`           |

---

### Task 1: Add TypeScript provider kinds

**Files:**
- Modify: `src/types.ts`

**Step 1: Add new variants to TranslationProviderKind**

In `src/types.ts`, update the `TranslationProviderKind` union type to include the 5 new values:

```typescript
export type TranslationProviderKind =
  | "openrouter"
  | "deepseek"
  | "ollama"
  | "openai-compatible"
  | "openai"
  | "google-gemini"
  | "siliconflow"
  | "dashscope"
  | "modelscope";
```

---

### Task 2: Add Rust backend support

**Files:**
- Modify: `src-tauri/src/providers.rs`

**Step 1: Add new ProviderKind variants**

Add 5 new variants to the `ProviderKind` enum:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum ProviderKind {
    #[serde(rename = "openrouter", alias = "open-router")]
    OpenRouter,
    #[serde(rename = "deepseek", alias = "deep-seek")]
    DeepSeek,
    #[serde(rename = "ollama")]
    Ollama,
    #[serde(rename = "openai-compatible", alias = "open-ai-compatible")]
    OpenAiCompatible,
    #[serde(rename = "openai")]
    OpenAi,
    #[serde(rename = "google-gemini")]
    GoogleGemini,
    #[serde(rename = "siliconflow")]
    SiliconFlow,
    #[serde(rename = "dashscope")]
    DashScope,
    #[serde(rename = "modelscope")]
    ModelScope,
}
```

**Step 2: Add default base URLs constant**

```rust
const OPENAI_BASE_URL: &str = "https://api.openai.com/v1";
const GEMINI_BASE_URL: &str = "https://generativelanguage.googleapis.com/v1beta/openai";
const SILICONFLOW_BASE_URL: &str = "https://api.siliconflow.cn/v1";
const DASHSCOPE_BASE_URL: &str = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const MODELSCOPE_BASE_URL: &str = "https://api-inference.modelscope.cn/v1";
```

**Step 3: Update `uses_api_key`**

All 5 new providers require API keys, so `uses_api_key` only needs to stay as-is (excludes Ollama).

**Step 4: Update `models_url`**

Add a new arm for providers that use `{base_url}/models`:

```rust
pub fn models_url(&self) -> Result<String, String> {
    match self.kind {
        ProviderKind::OpenRouter => Ok("https://openrouter.ai/api/v1/models".to_string()),
        ProviderKind::DeepSeek
        | ProviderKind::Ollama
        | ProviderKind::OpenAiCompatible
        | ProviderKind::OpenAi
        | ProviderKind::GoogleGemini
        | ProviderKind::SiliconFlow
        | ProviderKind::DashScope
        | ProviderKind::ModelScope => {
            Ok(format!("{}/models", self.resolved_base_url()?))
        }
    }
}
```

**Step 5: Update `chat_completions_url`**

Same pattern — all new providers use `{base_url}/chat/completions`:

```rust
pub fn chat_completions_url(&self) -> Result<String, String> {
    match self.kind {
        ProviderKind::OpenRouter => {
            Ok("https://openrouter.ai/api/v1/chat/completions".to_string())
        }
        ProviderKind::DeepSeek
        | ProviderKind::Ollama
        | ProviderKind::OpenAiCompatible
        | ProviderKind::OpenAi
        | ProviderKind::GoogleGemini
        | ProviderKind::SiliconFlow
        | ProviderKind::DashScope
        | ProviderKind::ModelScope => {
            Ok(format!("{}/chat/completions", self.resolved_base_url()?))
        }
    }
}
```

**Step 6: Update `resolved_base_url`**

Add fallback base URLs for each new provider:

```rust
fn resolved_base_url(&self) -> Result<String, String> {
    match self.kind {
        ProviderKind::OpenRouter => Err("OpenRouter does not use a base URL.".to_string()),
        ProviderKind::DeepSeek => Ok(/* existing */),
        ProviderKind::Ollama => Ok(/* existing */),
        ProviderKind::OpenAiCompatible => self.required_base_url(),
        ProviderKind::OpenAi => Ok(self
            .base_url
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .unwrap_or(OPENAI_BASE_URL)
            .trim_end_matches('/')
            .to_string()),
        ProviderKind::GoogleGemini => Ok(/* same pattern, GEMINI_BASE_URL */),
        ProviderKind::SiliconFlow => Ok(/* same pattern, SILICONFLOW_BASE_URL */),
        ProviderKind::DashScope => Ok(/* same pattern, DASHSCOPE_BASE_URL */),
        ProviderKind::ModelScope => Ok(/* same pattern, MODELSCOPE_BASE_URL */),
    }
}
```

**Step 7: Update `validate_for_request`**

All 5 new providers require API key + valid base URL. Follow the DeepSeek pattern (API key required, resolved_base_url must succeed):

```rust
pub fn validate_for_request(&self) -> Result<(), String> {
    match self.kind {
        ProviderKind::OpenRouter => { /* existing */ }
        ProviderKind::DeepSeek => { /* existing */ }
        ProviderKind::Ollama => { /* existing */ }
        ProviderKind::OpenAiCompatible => { /* existing */ }
        ProviderKind::OpenAi
        | ProviderKind::GoogleGemini
        | ProviderKind::SiliconFlow
        | ProviderKind::DashScope
        | ProviderKind::ModelScope => {
            if self.authorization_token().is_none() {
                return Err(format!("{} API key is missing.", self.label));
            }
            self.resolved_base_url()?;
            Ok(())
        }
    }
}
```

**Step 8: Update `build_chat_completion_payload`**

Add new reasoning parameter formats:

```rust
fn build_chat_completion_payload(
    provider_kind: &ProviderKind,
    model: &str,
    temperature: f32,
    reasoning: Option<&ProviderReasoningMode>,
    system_prompt: &str,
    user_prompt: &str,
) -> serde_json::Value {
    let mut payload = serde_json::json!({
        "model": model,
        "temperature": temperature,
        "messages": [
            { "role": "system", "content": system_prompt },
            { "role": "user", "content": user_prompt }
        ]
    });

    match provider_kind {
        ProviderKind::DeepSeek => {
            if let Some(mode) = reasoning {
                payload["thinking"] = mode.as_deepseek_thinking();
            }
        }
        ProviderKind::OpenRouter | ProviderKind::Ollama => {
            if let Some(mode) = reasoning {
                payload["reasoning"] = serde_json::json!({
                    "effort": mode.as_standard_effort()
                });
            }
        }
        ProviderKind::OpenAi | ProviderKind::GoogleGemini => {
            if let Some(mode) = reasoning {
                payload["reasoning_effort"] = serde_json::json!(mode.as_standard_effort());
            }
        }
        ProviderKind::SiliconFlow | ProviderKind::DashScope => {
            if let Some(mode) = reasoning {
                payload["enable_thinking"] = serde_json::json!(*mode != ProviderReasoningMode::Off);
            }
        }
        ProviderKind::OpenAiCompatible | ProviderKind::ModelScope => {}
    }

    payload
}
```

**Step 9: Run existing Rust tests**

Run: `cd src-tauri && cargo test`
Expected: All existing tests pass (new variants won't break existing tests since no legacy aliases changed).

---

### Task 3: Update frontend settings and provider config

**Files:**
- Modify: `src/lib/appSettings.ts`
- Modify: `src/lib/providerForm.ts`

**Step 1: Add new providers to PRESET_PROVIDER_OPTIONS**

In `src/lib/appSettings.ts`, add to the `PRESET_PROVIDER_OPTIONS` array:

```typescript
export const PRESET_PROVIDER_OPTIONS: Array<{
  value: TranslationProviderKind;
  label: string;
}> = [
  { value: "openrouter", label: "OpenRouter" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "ollama", label: "Ollama" },
  { value: "openai-compatible", label: "OpenAI-Compatible" },
  { value: "openai", label: "OpenAI" },
  { value: "google-gemini", label: "Google Gemini" },
  { value: "siliconflow", label: "SiliconFlow" },
  { value: "dashscope", label: "DashScope" },
  { value: "modelscope", label: "ModelScope" },
];
```

**Step 2: Update PROVIDER_LABELS**

```typescript
const PROVIDER_LABELS: Record<TranslationProviderKind, string> = {
  openrouter: "OpenRouter",
  deepseek: "DeepSeek",
  ollama: "Ollama",
  "openai-compatible": "Custom",
  openai: "OpenAI",
  "google-gemini": "Gemini",
  siliconflow: "SiliconFlow",
  dashscope: "DashScope",
  modelscope: "ModelScope",
};
```

**Step 3: Update DEFAULT_MODELS**

```typescript
const DEFAULT_MODELS: Record<TranslationProviderKind, string> = {
  openrouter: "openrouter/free",
  deepseek: "deepseek-chat",
  ollama: "llama3.2",
  "openai-compatible": "gpt-4o-mini",
  openai: "gpt-4o-mini",
  "google-gemini": "gemini-2.5-flash",
  siliconflow: "Qwen/Qwen3-235B-A22B",
  dashscope: "qwen-plus",
  modelscope: "Qwen/Qwen3-8B",
};
```

**Step 4: Update DEFAULT_BASE_URLS**

```typescript
const DEFAULT_BASE_URLS: Partial<Record<TranslationProviderKind, string>> = {
  deepseek: "https://api.deepseek.com",
  ollama: "http://localhost:11434/v1",
  openai: "https://api.openai.com/v1",
  "google-gemini": "https://generativelanguage.googleapis.com/v1beta/openai",
  siliconflow: "https://api.siliconflow.cn/v1",
  dashscope: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  modelscope: "https://api-inference.modelscope.cn/v1",
};
```

**Step 5: Update PROVIDERS_WITH_API_KEYS**

All 5 new providers need API keys, so add them:

```typescript
const PROVIDERS_WITH_API_KEYS = new Set<TranslationProviderKind>([
  "openrouter",
  "deepseek",
  "openai-compatible",
  "openai",
  "google-gemini",
  "siliconflow",
  "dashscope",
  "modelscope",
]);
```

**Step 6: Update PROVIDERS_WITH_EDITABLE_BASE_URLS**

New providers have fixed base URLs, so they do NOT go in this set. No changes needed.

**Step 7: Update providerUsesReasoning — OpenAI and Gemini use standard reasoning**

```typescript
export function providerUsesReasoning(providerKind: TranslationProviderKind | string) {
  const normalizedProviderKind = normalizeProviderKind(providerKind);
  return normalizedProviderKind === "openrouter"
    || normalizedProviderKind === "ollama"
    || normalizedProviderKind === "openai"
    || normalizedProviderKind === "google-gemini";
}
```

**Step 8: Update providerUsesThinking — SiliconFlow and DashScope use thinking toggle**

```typescript
export function providerUsesThinking(providerKind: TranslationProviderKind | string) {
  const normalizedProviderKind = normalizeProviderKind(providerKind);
  return normalizedProviderKind === "deepseek"
    || normalizedProviderKind === "siliconflow"
    || normalizedProviderKind === "dashscope";
}
```

**Step 9: Add THINKING_TOGGLE_OPTIONS for SiliconFlow/DashScope**

Add a new options array for the boolean thinking toggle (off/on only):

```typescript
const THINKING_TOGGLE_OPTIONS: Array<{
  value: ProviderReasoningMode;
  label: string;
}> = [
  { value: "off", label: "Off" },
  { value: "high", label: "On" },
];
```

**Step 10: Update normalizeProviderKind**

Add the new kinds to `CANONICAL_PROVIDER_KIND_BY_VARIANT`:

```typescript
const CANONICAL_PROVIDER_KIND_BY_VARIANT: Record<string, TranslationProviderKind> = {
  openrouter: "openrouter",
  "open-router": "openrouter",
  deepseek: "deepseek",
  "deep-seek": "deepseek",
  ollama: "ollama",
  "openai-compatible": "openai-compatible",
  "open-ai-compatible": "openai-compatible",
  openai: "openai",
  "google-gemini": "google-gemini",
  siliconflow: "siliconflow",
  dashscope: "dashscope",
  modelscope: "modelscope",
};
```

Also update `LEGACY_PROVIDER_KIND_BY_CANONICAL`:

```typescript
const LEGACY_PROVIDER_KIND_BY_CANONICAL: Record<TranslationProviderKind, string> = {
  openrouter: "open-router",
  deepseek: "deep-seek",
  ollama: "ollama",
  "openai-compatible": "open-ai-compatible",
  openai: "openai",
  "google-gemini": "google-gemini",
  siliconflow: "siliconflow",
  dashscope: "dashscope",
  modelscope: "modelscope",
};
```

**Step 11: Update normalizePresetFromStorage and normalizePresetDraft**

In `normalizePresetFromStorage`, update the reasoning/thinking branches to handle SiliconFlow and DashScope the same as DeepSeek:

```typescript
if (providerKind === "deepseek" || providerKind === "siliconflow" || providerKind === "dashscope") {
  normalizedPreset.thinking = normalizeProviderReasoningMode(providerKind, preset.thinking);
}

if (providerKind === "openrouter" || providerKind === "ollama" || providerKind === "openai" || providerKind === "google-gemini") {
  normalizedPreset.reasoning = normalizeProviderReasoningMode(providerKind, preset.reasoning);
}
```

Apply the same pattern in `normalizePresetDraft`.

**Step 12: Update normalizeProviderReasoningMode**

Add handling for the new providers:

```typescript
export function normalizeProviderReasoningMode(
  providerKind: TranslationProviderKind | string,
  value?: string
): ProviderReasoningMode {
  const normalizedProviderKind = normalizeProviderKind(providerKind);
  const normalizedValue = value as ProviderReasoningMode | undefined;

  // DeepSeek, SiliconFlow, DashScope: thinking toggle (off or high)
  if (normalizedProviderKind === "deepseek") {
    return normalizedValue && DEEPSEEK_THINKING_MODES.has(normalizedValue)
      ? normalizedValue
      : "off";
  }

  if (normalizedProviderKind === "siliconflow" || normalizedProviderKind === "dashscope") {
    // Boolean thinking: only off or high
    return normalizedValue === "high" || normalizedValue === "max" ? "high" : "off";
  }

  // Standard reasoning: off/low/medium/high
  if (
    normalizedProviderKind === "openrouter"
    || normalizedProviderKind === "ollama"
    || normalizedProviderKind === "openai"
    || normalizedProviderKind === "google-gemini"
  ) {
    return normalizedValue && STANDARD_REASONING_MODES.has(normalizedValue)
      ? normalizedValue
      : "off";
  }

  return "off";
}
```

---

### Task 4: Update provider form model listing

**Files:**
- Modify: `src/lib/providerForm.ts`

**Step 1: Add new providers to canListModels**

```typescript
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

  // All new providers + openai-compatible: need base URL + API key
  // (But new providers have fixed base URLs, so API key alone is sufficient)
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
```

---

### Task 5: Update SettingsDialogContent thinking/reasoning UI

**Files:**
- Modify: `src/components/settings/SettingsDialogContent.tsx`

**Step 1: Add THINKING_TOGGLE_OPTIONS constant**

```typescript
const THINKING_TOGGLE_OPTIONS: Array<{
  value: ProviderReasoningMode;
  label: string;
}> = [
  { value: "off", label: "Off" },
  { value: "high", label: "On" },
];
```

**Step 2: Update the thinking Select to handle toggle providers**

The existing `providerUsesThinking(editingPreset.providerKind)` block shows `DEEPSEEK_THINKING_OPTIONS`. Update it to show `THINKING_TOGGLE_OPTIONS` when the provider is SiliconFlow or DashScope:

```tsx
{providerUsesThinking(editingPreset.providerKind) ? (
  <div className="settings-item">
    <Label.Root className="settings-label type-field-label" htmlFor="preset-thinking">
      Thinking
    </Label.Root>
    <Select.Root
      value={normalizeProviderReasoningMode(
        editingPreset.providerKind,
        editingPreset.thinking,
      )}
      onValueChange={(value) =>
        onPresetChange({
          ...editingPreset,
          thinking: value as ProviderReasoningMode,
          reasoning: undefined,
        })
      }
    >
      <Select.Trigger className="select-trigger" aria-label="Thinking" id="preset-thinking">
        <span>
          {/* Choose options based on provider */}
          {(editingPreset.providerKind === "siliconflow" || editingPreset.providerKind === "dashscope"
            ? THINKING_TOGGLE_OPTIONS
            : DEEPSEEK_THINKING_OPTIONS
          ).find(
            (option) =>
              option.value ===
              normalizeProviderReasoningMode(
                editingPreset.providerKind,
                editingPreset.thinking,
              ),
          )?.label ?? "Off"}
        </span>
        <Select.Icon asChild>
          <ChevronDownIcon />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="select-content settings-select-content" position="popper">
          <Select.Viewport>
            {(editingPreset.providerKind === "siliconflow" || editingPreset.providerKind === "dashscope"
              ? THINKING_TOGGLE_OPTIONS
              : DEEPSEEK_THINKING_OPTIONS
            ).map((option) => (
              <Select.Item key={option.value} value={option.value} className="select-item">
                <Select.ItemText>{option.label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  </div>
) : null}
```

---

### Task 6: Build and verify

**Step 1: Run Rust tests**

Run: `cd src-tauri && cargo test`
Expected: All tests pass.

**Step 2: Run frontend type check**

Run: `cd /Users/guolite/GitHub/readani && npx tsc --noEmit`
Expected: No type errors.

**Step 3: Start dev server**

Run: `bun run tauri dev`
Expected: App starts, Settings → Providers shows 9 provider options in the picker.

**Step 4: Manual verification**

1. Open Settings → Providers tab
2. Click "+" to open provider picker
3. Verify all 9 providers appear: OpenRouter, DeepSeek, Ollama, OpenAI-Compatible, OpenAI, Google Gemini, SiliconFlow, DashScope, ModelScope
4. Add an OpenAI provider → verify Provider dropdown shows all 9, API key field appears, no Base URL field
5. Add a Gemini provider → verify same behavior
6. Add a SiliconFlow provider → verify Thinking dropdown shows Off/On (not Off/High/Max)
7. Add a DashScope provider → verify same Thinking toggle
8. Add a ModelScope provider → verify no Thinking/Reasoning dropdown

---

## Notes

- **Default model names** may need adjustment as models are rapidly updated. The user should confirm current default model names before implementation.
- **SiliconFlow/DashScope `enable_thinking`** is a simpler boolean toggle. The UI shows Off/On instead of Off/High/Max.
- **No new CSS** needed — existing styles cover all provider types.
- **Migration safety**: New provider kinds are additive. Existing presets with `openrouter`/`deepseek`/`ollama`/`openai-compatible` are unaffected.
