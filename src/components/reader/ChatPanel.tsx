import { PaperPlaneTilt, TrashSimple } from "@phosphor-icons/react";
import { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import type { ChatMessage } from "../../types";
import { t, type MessageKey } from "../../lib/i18n";

type ChatPanelProps = {
  isVisible: boolean;
  model: string;
  getCurrentPageText: () => string;
  getSurroundingPagesText: () => string;
};

const PRESET_QUESTIONS: Array<{ labelKey: MessageKey; promptKey: MessageKey }> = [
  { labelKey: "chat.summarizePage", promptKey: "chat.summarizePrompt" },
  { labelKey: "chat.keyConcepts", promptKey: "chat.keyConceptsPrompt" },
  { labelKey: "chat.summaryNearbyPages", promptKey: "chat.summaryNearbyPrompt" },
  { labelKey: "chat.explainTerms", promptKey: "chat.explainTermsPrompt" },
];

export function ChatPanel({
  isVisible,
  model,
  getCurrentPageText,
  getSurroundingPagesText,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isVisible && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isVisible]);

  useEffect(() => {
    // Scroll to bottom when new messages arrive
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = useCallback(async (userMessage: string, context: string) => {
    if (!userMessage.trim()) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: userMessage,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await invoke<string>("chat_with_context", {
        model,
        context,
        question: userMessage,
      });

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: response,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (error) {
      const errorMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: t("chat.error", { error: String(error) }),
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  }, [model]);

  const handlePresetQuestion = useCallback((preset: typeof PRESET_QUESTIONS[0]) => {
    const isNearby = preset.labelKey === "chat.summaryNearbyPages";
    const context = isNearby
      ? getSurroundingPagesText()
      : getCurrentPageText();
    sendMessage(t(preset.promptKey), context);
  }, [getCurrentPageText, getSurroundingPagesText, sendMessage]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const context = getCurrentPageText();
    sendMessage(input, context);
  }, [input, isLoading, getCurrentPageText, sendMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }, [handleSubmit]);

  const handleClearChat = useCallback(() => {
    setMessages([]);
  }, []);

  return (
    <div className="chat-panel">
      <div className="chat-header rail-pane-header">
        <div className="chat-title rail-pane-title-row">
          <span className="rail-pane-title">{t("reader.panelChat")}</span>
        </div>
        <div className="chat-header-actions rail-pane-header-actions">
          {messages.length > 0 && (
            <button
              type="button"
              className="btn btn-ghost btn-icon-only"
              aria-label={t("chat.clearChat")}
              title={t("chat.clearChat")}
              onClick={handleClearChat}
            >
              <TrashSimple size={14} weight="regular" />
            </button>
          )}
        </div>
      </div>

      <ScrollArea.Root className="chat-messages-scroll">
        <ScrollArea.Viewport ref={scrollRef} className="chat-messages">
          {messages.length === 0 ? (
            <div className="chat-empty">
              <p>{t("chat.empty")}</p>
              <div className="chat-presets">
                {PRESET_QUESTIONS.map((preset, index) => (
                  <button
                    key={index}
                    className="chat-preset-btn"
                    onClick={() => handlePresetQuestion(preset)}
                    disabled={isLoading}
                  >
                    {t(preset.labelKey)}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`chat-message ${msg.role === "user" ? "is-user" : "is-assistant"}`}
              >
                <div className="chat-message-content">{msg.content}</div>
              </div>
            ))
          )}
          {isLoading && (
            <div className="chat-message is-assistant">
              <div className="chat-message-content chat-loading">{t("chat.thinking")}</div>
            </div>
          )}
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar orientation="vertical" className="scrollbar">
          <ScrollArea.Thumb className="scrollbar-thumb" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>

      <form className="chat-input-form" onSubmit={handleSubmit}>
        <textarea
          ref={inputRef}
          className="chat-input"
          placeholder={t("chat.placeholder")}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          rows={1}
        />
        <button
          type="submit"
          className="chat-send-btn"
          disabled={!input.trim() || isLoading}
        >
          <PaperPlaneTilt size={18} weight="fill" />
        </button>
      </form>
    </div>
  );
}
