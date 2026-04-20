import * as Dialog from "@radix-ui/react-dialog";
import {
  READANI_AUTHOR_EMAIL,
  READANI_AUTHOR_NAME,
  READANI_BUILD_TIMESTAMP_LABEL,
  READANI_COPYRIGHT_LINE,
  READANI_PRODUCT_NAME,
  READANI_UPSTREAM_AUTHOR_NAME,
  READANI_UPSTREAM_AUTHOR_URL,
  READANI_UPSTREAM_REPO_NAME,
  READANI_UPSTREAM_REPO_URL,
  READANI_VERSION,
} from "../lib/release";

type AboutDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AboutDialog({ open, onOpenChange }: AboutDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content dialog-content-about">
          <div className="about-dialog-header">
            <div className="about-dialog-hero-copy">
              <Dialog.Title className="dialog-title type-title-large">
                {READANI_PRODUCT_NAME}
              </Dialog.Title>
              <Dialog.Description className="about-dialog-description">
                Bilingual PDF and EPUB reading for desktop.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                aria-label="Close About"
                className="btn btn-ghost btn-icon-only about-dialog-close"
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

          <div className="about-dialog-body">
            <div className="about-dialog-metadata">
              <p className="about-dialog-metadata-item">Version v{READANI_VERSION}</p>
              <p className="about-dialog-metadata-item">Built {READANI_BUILD_TIMESTAMP_LABEL}</p>
              <p className="about-dialog-metadata-item">Created by {READANI_AUTHOR_NAME}</p>
              <p className="about-dialog-metadata-item">
                Contact{" "}
                <a className="about-dialog-link" href={`mailto:${READANI_AUTHOR_EMAIL}`}>
                  {READANI_AUTHOR_EMAIL}
                </a>
              </p>
              <p className="about-dialog-metadata-item">
                Special thanks to{" "}
                <a
                  className="about-dialog-link"
                  href={READANI_UPSTREAM_AUTHOR_URL}
                  rel="noreferrer"
                  target="_blank"
                >
                  {READANI_UPSTREAM_AUTHOR_NAME}
                </a>
                , author of{" "}
                <a
                  className="about-dialog-link"
                  href={READANI_UPSTREAM_REPO_URL}
                  rel="noreferrer"
                  target="_blank"
                >
                  {READANI_UPSTREAM_REPO_NAME}
                </a>
                .
              </p>
            </div>

            <p className="about-dialog-copyright">{READANI_COPYRIGHT_LINE}</p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
