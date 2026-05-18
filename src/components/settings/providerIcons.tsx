import type { ReactNode } from "react";
import type { TranslationProviderKind } from "../../types";

type ProviderBrandIconProps = {
  providerKind: TranslationProviderKind;
  className?: string;
};

function IconShell({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      {children}
    </svg>
  );
}

function OpenRouterIcon({ className }: { className?: string }) {
  return (
    <IconShell className={className}>
      <path
        d="M7 8.5h9c1.9 0 3.5 1.6 3.5 3.5S17.9 15.5 16 15.5H8.3"
        stroke="#111827"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
      <circle cx="6" cy="8.5" r="1.35" fill="#f97316" />
      <circle cx="13.7" cy="12" r="1.35" fill="#111827" />
      <circle cx="8.2" cy="15.5" r="1.35" fill="#f97316" />
    </IconShell>
  );
}

function DeepSeekIcon({ className }: { className?: string }) {
  return (
    <IconShell className={className}>
      <path
        d="M4.5 13.5c1.9-3.8 5-5.8 8.7-5.8 2.8 0 5.1 1 6.8 3"
        stroke="#00a5e0"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
      <path
        d="M4.5 15.1c1.9 0 3.5-.7 4.8-2 1.2-1.2 2.4-1.8 4-1.8 1.8 0 3.2.8 4.4 2.5"
        stroke="#00a5e0"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
      <circle cx="16.8" cy="8.4" r="1.15" fill="#00a5e0" />
    </IconShell>
  );
}

function OllamaIcon({ className }: { className?: string }) {
  return (
    <IconShell className={className}>
      <circle cx="12" cy="12" r="7.4" stroke="#f97316" strokeWidth="2" />
      <path
        d="M8.8 10.1 10 7.7l1.2 2.4M15.2 10.1 14 7.7l-1.2 2.4"
        stroke="#f97316"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M8.8 13.2c1.1 1.7 2.5 2.6 3.2 2.6 1 0 2.5-.8 3.2-2.6"
        stroke="#f97316"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <circle cx="10.2" cy="12" r="0.8" fill="#f97316" />
      <circle cx="13.8" cy="12" r="0.8" fill="#f97316" />
    </IconShell>
  );
}

function OpenAIIcon({ className }: { className?: string }) {
  return (
    <IconShell className={className}>
      <g
        stroke="#10a37f"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      >
        <path d="M12 4.2 16.6 7v5.8L12 15.8 7.4 12.8V7z" />
        <path d="M7.4 7 12 9.9 16.6 7" />
        <path d="M7.4 13 12 10.1 16.6 13" />
      </g>
      <circle cx="12" cy="12" r="1.25" fill="#10a37f" />
    </IconShell>
  );
}

function GeminiIcon({ className }: { className?: string }) {
  return (
    <IconShell className={className}>
      <path
        d="M12 4.2 14.7 9.3 19.8 12 14.7 14.7 12 19.8 9.3 14.7 4.2 12 9.3 9.3Z"
        fill="#4285f4"
      />
      <path
        d="M12 6.8 13.7 10.3 17.2 12 13.7 13.7 12 17.2 10.3 13.7 6.8 12 10.3 10.3Z"
        fill="#fbbc05"
      />
    </IconShell>
  );
}

function SiliconFlowIcon({ className }: { className?: string }) {
  return (
    <IconShell className={className}>
      <path
        d="M5 15.2c1.2-4.2 4.2-6.4 7.1-6.4 2.3 0 4.2.9 6.1 2.7"
        stroke="#2563eb"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
      <path
        d="M8.4 16.5h4.7c1.8 0 3.2-.6 4.4-1.9"
        stroke="#2563eb"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
      <circle cx="17.2" cy="9.2" r="1.05" fill="#2563eb" />
      <circle cx="7" cy="15.2" r="1.05" fill="#2563eb" />
    </IconShell>
  );
}

function DashScopeIcon({ className }: { className?: string }) {
  return (
    <IconShell className={className}>
      <path
        d="M6.2 15.8A7.7 7.7 0 0 1 12 5.8a7.7 7.7 0 0 1 5.8 10"
        stroke="#0f766e"
        strokeDasharray="2.2 1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
      <path
        d="M9.2 16.4h5.6"
        stroke="#0f766e"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
      <circle cx="12" cy="12" r="1.25" fill="#0f766e" />
    </IconShell>
  );
}

function ModelScopeIcon({ className }: { className?: string }) {
  return (
    <IconShell className={className}>
      <circle cx="12" cy="12" r="7.2" stroke="#7c3aed" strokeWidth="1.8" />
      <path
        d="M7.5 13.2c0-2.6 2-4.6 4.5-4.6s4.5 2 4.5 4.6"
        stroke="#7c3aed"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="12" r="1.15" fill="#7c3aed" />
    </IconShell>
  );
}

function MiniMaxIcon({ className }: { className?: string }) {
  return (
    <IconShell className={className}>
      <path
        d="M6.2 16.5V7.5L12 14l5.8-6.5v9"
        stroke="#db2777"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
      <path
        d="M9.2 10.4h5.6"
        stroke="#db2777"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
    </IconShell>
  );
}

function MiniMaxiIcon({ className }: { className?: string }) {
  return (
    <IconShell className={className}>
      <path
        d="M6.2 16.5V7.5L12 14l5.8-6.5v9"
        stroke="#f43f5e"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
      <circle cx="17.3" cy="16.3" r="1.05" fill="#f43f5e" />
    </IconShell>
  );
}

function ZAiIcon({ className }: { className?: string }) {
  return (
    <IconShell className={className}>
      <path
        d="M7 7.2h10L7 16.8h10"
        stroke="#16a34a"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
      <circle cx="17.2" cy="16.8" r="1.05" fill="#16a34a" />
    </IconShell>
  );
}

function BigModelIcon({ className }: { className?: string }) {
  return (
    <IconShell className={className}>
      <path
        d="M7.2 6.6h4.2a2.8 2.8 0 0 1 0 5.6H7.2V6.6Zm0 5.6h4.5a2.9 2.9 0 0 1 0 5.8H7.2v-5.8Z"
        fill="#ea580c"
      />
      <path
        d="M10.3 9.4h1.2M10.3 15.3h1.2"
        stroke="#fff"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </IconShell>
  );
}

function CustomProviderIcon({ className }: { className?: string }) {
  return (
    <IconShell className={className}>
      <path
        d="M5.5 8.5 3.9 12l1.6 3.5M18.5 8.5 20.1 12l-1.6 3.5M10.1 7l-2.2 10M13.9 7l2.2 10"
        stroke="#6b7280"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </IconShell>
  );
}

export function ProviderBrandIcon({ providerKind, className }: ProviderBrandIconProps) {
  switch (providerKind) {
    case "openrouter":
      return <OpenRouterIcon className={className} />;
    case "deepseek":
      return <DeepSeekIcon className={className} />;
    case "ollama":
      return <OllamaIcon className={className} />;
    case "openai":
      return <OpenAIIcon className={className} />;
    case "google-gemini":
      return <GeminiIcon className={className} />;
    case "siliconflow":
      return <SiliconFlowIcon className={className} />;
    case "dashscope":
      return <DashScopeIcon className={className} />;
    case "modelscope":
      return <ModelScopeIcon className={className} />;
    case "minimax-io":
      return <MiniMaxIcon className={className} />;
    case "minimaxi":
      return <MiniMaxiIcon className={className} />;
    case "zai":
      return <ZAiIcon className={className} />;
    case "bigmodel":
      return <BigModelIcon className={className} />;
    default:
      return <CustomProviderIcon className={className} />;
  }
}
