import { Fragment, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import changelogMarkdown from "../../CHANGELOG.md?raw";
import { t } from "../lib/i18n";

type ChangelogDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type ChangelogSection = {
  title: string;
  items: string[];
};

type ChangelogRelease = {
  version: string;
  date: string;
  intro: string[];
  sections: ChangelogSection[];
};

type ParsedChangelog = {
  intro: string[];
  releases: ChangelogRelease[];
};

function pushParagraph(target: string[], buffer: string[]) {
  if (buffer.length === 0) {
    return;
  }

  target.push(buffer.join(" "));
  buffer.length = 0;
}

function parseChangelog(markdown: string): ParsedChangelog {
  const intro: string[] = [];
  const releases: ChangelogRelease[] = [];
  const paragraphBuffer: string[] = [];
  let currentRelease: ChangelogRelease | null = null;
  let currentSection: ChangelogSection | null = null;

  const flushParagraph = () => {
    const target =
      currentRelease === null
        ? intro
        : currentSection === null || currentSection.items.length === 0
          ? currentRelease.intro
          : currentSection.items;

    pushParagraph(target, paragraphBuffer);
  };

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      continue;
    }

    if (line.startsWith("# ") || /^\[[^\]]+\]:\s+/.test(line)) {
      flushParagraph();
      continue;
    }

    const releaseMatch = line.match(/^## \[([^\]]+)\] — (.+)$/);
    if (releaseMatch) {
      flushParagraph();
      currentRelease = {
        version: releaseMatch[1],
        date: releaseMatch[2],
        intro: [],
        sections: [],
      };
      releases.push(currentRelease);
      currentSection = null;
      continue;
    }

    const sectionMatch = line.match(/^### (.+)$/);
    if (sectionMatch) {
      flushParagraph();
      if (currentRelease === null) {
        continue;
      }

      currentSection = {
        title: sectionMatch[1],
        items: [],
      };
      currentRelease.sections.push(currentSection);
      continue;
    }

    const itemMatch = line.match(/^- (.+)$/);
    if (itemMatch) {
      flushParagraph();
      if (currentRelease === null) {
        continue;
      }

      if (currentSection === null) {
        currentSection = {
          title: t("changelog.notes"),
          items: [],
        };
        currentRelease.sections.push(currentSection);
      }

      currentSection.items.push(itemMatch[1]);
      continue;
    }

    paragraphBuffer.push(line);
  }

  flushParagraph();

  return { intro, releases };
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const tokenPattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let match: RegExpExecArray | null;
  let lastIndex = 0;

  while ((match = tokenPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    const key = `${match.index}-${token}`;

    if (token.startsWith("**")) {
      nodes.push(
        <strong key={key}>
          {renderInlineMarkdown(token.slice(2, -2))}
        </strong>,
      );
    } else if (token.startsWith("`")) {
      nodes.push(
        <code className="changelog-inline-code" key={key}>
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (!linkMatch) {
        nodes.push(token);
      } else {
        const [, label, href] = linkMatch;
        const content = renderInlineMarkdown(label);

        if (/^https?:\/\//.test(href)) {
          nodes.push(
            <a
              className="changelog-dialog-link"
              href={href}
              key={key}
              rel="noreferrer"
              target="_blank"
            >
              {content}
            </a>,
          );
        } else {
          nodes.push(<Fragment key={key}>{content}</Fragment>);
        }
      }
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

const parsedChangelog = parseChangelog(changelogMarkdown);

export function ChangelogDialog({ open, onOpenChange }: ChangelogDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay dialog-overlay-changelog" />
        <Dialog.Content className="dialog-content dialog-content-changelog">
          <div className="changelog-dialog-header">
            <div className="changelog-dialog-hero-copy">
              <Dialog.Title className="dialog-title type-title-large">
                {t("changelog.title")}
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button
                aria-label={t("changelog.close")}
                className="btn btn-ghost btn-icon-only changelog-dialog-close"
                type="button"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </Dialog.Close>
          </div>

          <div className="changelog-dialog-body">
            <div className="changelog-release-list">
              {parsedChangelog.releases.map((release) => (
                <section className="changelog-release" key={release.version}>
                  <div className="changelog-release-header">
                    <h2 className="changelog-release-title">{release.version}</h2>
                    <p className="changelog-release-date">{release.date}</p>
                  </div>

                  {release.intro.map((paragraph) => (
                    <p className="changelog-release-intro" key={`${release.version}-${paragraph}`}>
                      {renderInlineMarkdown(paragraph)}
                    </p>
                  ))}

                  {release.sections.map((section) => (
                    <section className="changelog-section" key={`${release.version}-${section.title}`}>
                      <h3 className="changelog-section-title">{section.title}</h3>
                      <ul className="changelog-section-list">
                        {section.items.map((item, index) => (
                          <li
                            className="changelog-section-item"
                            key={`${release.version}-${section.title}-${index}`}
                          >
                            {renderInlineMarkdown(item)}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </section>
              ))}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
