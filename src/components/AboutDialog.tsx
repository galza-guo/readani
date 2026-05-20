import { useEffect, useState } from "react";
import { X } from "@phosphor-icons/react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  READANI_AUTHOR_EMAIL,
  READANI_AUTHOR_NAME,
  READANI_BUILD_TIMESTAMP_LABEL,
  READANI_COPYRIGHT_LINE,
  READANI_PRODUCT_NAME,
  READANI_RELEASES_URL,
  READANI_UPSTREAM_AUTHOR_NAME,
  READANI_UPSTREAM_AUTHOR_URL,
  READANI_UPSTREAM_REPO_NAME,
  READANI_UPSTREAM_REPO_URL,
  READANI_VERSION,
  getReadaniRuntimeVersion,
} from "../lib/release";
import { ChangelogDialog } from "./ChangelogDialog";
import { t } from "../lib/i18n";

type AboutDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCheckForUpdates: () => void;
  onOpenLatestRelease: () => void;
  updateStatusMessage?: string | null;
};

export function AboutDialog({
  open,
  onOpenChange,
  onCheckForUpdates,
  onOpenLatestRelease,
  updateStatusMessage,
}: AboutDialogProps) {
  const [appVersion, setAppVersion] = useState(READANI_VERSION);
  const [changelogOpen, setChangelogOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void getReadaniRuntimeVersion().then((version) => {
      if (!cancelled) {
        setAppVersion(version);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setChangelogOpen(false);
    }
  }, [open]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay app-scrim" />
        <Dialog.Content className="dialog-content dialog-content-about">
          <div className="about-dialog-header">
            <div className="about-dialog-hero-copy">
              <Dialog.Title className="dialog-title type-title-large">
                {READANI_PRODUCT_NAME}
              </Dialog.Title>
              <Dialog.Description className="about-dialog-description">
                {t("about.description")}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                aria-label={t("common.close")}
                className="btn btn-ghost btn-icon-only about-dialog-close"
                type="button"
              >
                <X size={18} weight="regular" />
              </button>
            </Dialog.Close>
          </div>

          <div className="about-dialog-body">
            <div className="about-dialog-metadata">
              <p className="about-dialog-metadata-item">
                <span className="about-dialog-metadata-inline">
                  <span>{t("about.version", { appVersion })}</span>
                  <button
                    className="about-dialog-link-button"
                    onClick={() => setChangelogOpen(true)}
                    type="button"
                  >
                    {t("about.changelog")}
                  </button>
                </span>
              </p>
              <p className="about-dialog-metadata-item">{READANI_BUILD_TIMESTAMP_LABEL}</p>
              <p className="about-dialog-metadata-item">
                <span className="about-dialog-metadata-inline">
                  <span>{READANI_AUTHOR_NAME}</span>
                  <a
                    aria-label={`Email ${READANI_AUTHOR_NAME}`}
                    className="about-dialog-icon-link"
                    href={`mailto:${READANI_AUTHOR_EMAIL}`}
                    title={READANI_AUTHOR_EMAIL}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    >
                      <rect x="3" y="5" width="18" height="14" rx="2" />
                      <path d="m4 7 8 6 8-6" />
                    </svg>
                  </a>
                </span>
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

            {updateStatusMessage ? (
              <p className="about-dialog-update-status" role="status">
                {updateStatusMessage}
              </p>
            ) : null}

            <div className="about-dialog-actions">
              <button className="btn btn-primary" onClick={onCheckForUpdates} type="button">
                {t("about.checkForUpdate")}
              </button>
              <button
                className="btn"
                onClick={onOpenLatestRelease}
                title={READANI_RELEASES_URL}
                type="button"
              >
                {t("about.openLatestRelease")}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
      <ChangelogDialog open={changelogOpen} onOpenChange={setChangelogOpen} />
    </Dialog.Root>
  );
}
