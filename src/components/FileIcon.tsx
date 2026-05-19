import { FilePdf } from "@phosphor-icons/react";

export type FileKind = "pdf" | "epub";

type FileIconProps = {
  kind: FileKind;
  size?: number;
  className?: string;
};

export function FileIcon({ kind, size = 18, className }: FileIconProps) {
  if (kind === "epub") return <EpubIcon size={size} className={className} />;
  return <FilePdf size={size} className={className} aria-hidden />;
}

function EpubIcon({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"
        fill="currentColor"
        opacity="0.15"
      />
      <path
        d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"
        fill="currentColor"
        opacity="0.15"
      />
      <path
        d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      <path
        d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
    </svg>
  );
}
