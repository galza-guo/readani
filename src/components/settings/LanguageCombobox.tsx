import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import * as Popover from "@radix-ui/react-popover";
import type { TargetLanguage } from "../../types";
import {
  buildLanguagePickerSections,
  getCustomLanguageOption,
  getLanguageDisplayLabel,
  type LanguagePickerSection,
} from "../../lib/languageOptions";
import { t, type MessageKey } from "../../lib/i18n";

type LanguageComboboxProps = {
  id: string;
  value: TargetLanguage;
  onChange: (language: TargetLanguage) => void;
  allowCustom?: boolean;
  buildSections?: (query: string) => LanguagePickerSection[];
  contentClassName?: string;
  getOptionLabel?: (language: TargetLanguage) => string;
  searchable?: boolean;
  searchPlaceholder?: string;
  searchPlaceholderKey?: MessageKey;
};

function ChevronDownIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}

export function LanguageCombobox({
  allowCustom = true,
  buildSections = buildLanguagePickerSections,
  contentClassName,
  getOptionLabel = getLanguageDisplayLabel,
  id,
  value,
  onChange,
  searchable = true,
  searchPlaceholder,
  searchPlaceholderKey = "languages.search",
}: LanguageComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const shouldAutoScrollRef = useRef(false);

  const sections = useMemo(
    () => buildSections(query),
    [buildSections, query]
  );
  const customOption = useMemo(
    () => (allowCustom ? getCustomLanguageOption(query, value) : undefined),
    [allowCustom, query, value]
  );
  const flattenedOptions = useMemo(() => {
    const builtIn = sections.flatMap((section) =>
      section.items.map((language) => ({
        key: language.code,
        language,
      }))
    );

    return customOption
      ? [
          ...builtIn,
          {
            key: customOption.code,
            language: customOption,
          },
        ]
      : builtIn;
  }, [customOption, sections]);

  useEffect(() => {
    if (!open) {
      optionRefs.current = [];
      return;
    }

    setQuery("");
    setHighlightedIndex(0);

    const frame = window.requestAnimationFrame(() => {
      if (searchable) {
        inputRef.current?.focus();
        inputRef.current?.select();
        return;
      }

      contentRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [open, searchable]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!shouldAutoScrollRef.current) {
      return;
    }

    const nextOption = optionRefs.current[highlightedIndex];
    nextOption?.scrollIntoView({ block: "nearest" });
    shouldAutoScrollRef.current = false;
  }, [highlightedIndex]);

  const handleSelect = (language: TargetLanguage) => {
    onChange(language);
    setOpen(false);
    setQuery("");
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      shouldAutoScrollRef.current = true;
      setHighlightedIndex((current) =>
        flattenedOptions.length === 0
          ? 0
          : Math.min(current + 1, flattenedOptions.length - 1)
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      shouldAutoScrollRef.current = true;
      setHighlightedIndex((current) =>
        flattenedOptions.length === 0 ? 0 : Math.max(current - 1, 0)
      );
      return;
    }

    if (event.key === "Enter") {
      if (flattenedOptions.length === 0) {
        return;
      }

      event.preventDefault();
      handleSelect(flattenedOptions[highlightedIndex].language);
    }
  };

  let optionIndex = -1;
  const resolvedSearchPlaceholder =
    searchPlaceholder ?? t(searchPlaceholderKey);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          id={id}
          aria-expanded={open}
          aria-haspopup="dialog"
          className="language-combobox-trigger"
          type="button"
        >
          <span className="language-combobox-trigger-text">
            {getOptionLabel(value)}
          </span>
          <ChevronDownIcon />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          className={`language-combobox-content ${contentClassName ?? ""}`.trim()}
          onKeyDown={!searchable ? handleInputKeyDown : undefined}
          ref={contentRef}
          sideOffset={8}
          tabIndex={searchable ? undefined : -1}
        >
          {searchable ? (
            <input
              ref={inputRef}
              aria-label={resolvedSearchPlaceholder}
              className="language-combobox-input"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder={resolvedSearchPlaceholder}
              type="text"
              value={query}
            />
          ) : null}

          <div className="language-combobox-list" role="listbox">
            {sections.map((section) => (
              <div key={section.id} className="language-combobox-section">
                {section.title ? (
                  <div className="language-combobox-section-title">{section.title}</div>
                ) : null}

                {section.items.map((language) => {
                  optionIndex += 1;
                  const currentIndex = optionIndex;
                  const isSelected = language.code === value.code;
                  const isHighlighted = currentIndex === highlightedIndex;

                  return (
                    <button
                      key={language.code}
                      ref={(element) => {
                        optionRefs.current[currentIndex] = element;
                      }}
                      className={`language-combobox-option ${
                        isHighlighted ? "is-highlighted" : ""
                      } ${isSelected ? "is-selected" : ""}`}
                      onClick={() => handleSelect(language)}
                      onMouseEnter={() => {
                        shouldAutoScrollRef.current = false;
                        setHighlightedIndex(currentIndex);
                      }}
                      role="option"
                      type="button"
                    >
                      <span>{getOptionLabel(language)}</span>
                      {isSelected ? <CheckIcon /> : null}
                    </button>
                  );
                })}
              </div>
            ))}

            {customOption ? (
              <button
                ref={(element) => {
                  optionRefs.current[flattenedOptions.length - 1] = element;
                }}
                className={`language-combobox-option language-combobox-option-custom ${
                  highlightedIndex === flattenedOptions.length - 1
                    ? "is-highlighted"
                    : ""
                }`}
                onClick={() => handleSelect(customOption)}
                onMouseEnter={() => {
                  shouldAutoScrollRef.current = false;
                  setHighlightedIndex(flattenedOptions.length - 1);
                }}
                role="option"
                type="button"
              >
                {t("languages.useCustom", { label: customOption.label })}
              </button>
            ) : null}

            {flattenedOptions.length === 0 ? (
              <div className="language-combobox-empty">
                {t("languages.noResults")}
              </div>
            ) : null}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
