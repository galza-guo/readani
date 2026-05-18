import openRouterLogo from "../../assets/provider-logos/openrouter.png";
import deepSeekLogo from "../../assets/provider-logos/deepseek.png";
import ollamaLogo from "../../assets/provider-logos/ollama.png";
import openAiLogo from "../../assets/provider-logos/openai.png";
import googleGeminiLogo from "../../assets/provider-logos/google-gemini.png";
import siliconFlowLogo from "../../assets/provider-logos/siliconflow.png";
import dashScopeLogo from "../../assets/provider-logos/dashscope.png";
import modelScopeLogo from "../../assets/provider-logos/modelscope.png";
import miniMaxIoLogo from "../../assets/provider-logos/minimax-io.png";
import miniMaxiLogo from "../../assets/provider-logos/minimaxi.png";
import zAiLogo from "../../assets/provider-logos/zai.png";
import bigModelLogo from "../../assets/provider-logos/bigmodel.png";
import type { TranslationProviderKind } from "../../types";

type ProviderBrandIconProps = {
  providerKind: TranslationProviderKind;
  className?: string;
};

const PROVIDER_LOGOS: Partial<Record<TranslationProviderKind, string>> = {
  openrouter: openRouterLogo,
  deepseek: deepSeekLogo,
  ollama: ollamaLogo,
  openai: openAiLogo,
  "google-gemini": googleGeminiLogo,
  "siliconflow-cn": siliconFlowLogo,
  "siliconflow-com": siliconFlowLogo,
  dashscope: dashScopeLogo,
  modelscope: modelScopeLogo,
  "minimax-io": miniMaxIoLogo,
  minimaxi: miniMaxiLogo,
  zai: zAiLogo,
  bigmodel: bigModelLogo,
};

function CustomProviderIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M5.5 8.5 3.9 12l1.6 3.5M18.5 8.5 20.1 12l-1.6 3.5M10.1 7l-2.2 10M13.9 7l2.2 10"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function LogoImage({
  className,
  src,
}: {
  className?: string;
  src: string;
}) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className={className}
      draggable={false}
      src={src}
    />
  );
}

export function ProviderBrandIcon({ providerKind, className }: ProviderBrandIconProps) {
  const logo = PROVIDER_LOGOS[providerKind];

  if (logo) {
    return <LogoImage className={className} src={logo} />;
  }

  return <CustomProviderIcon className={className} />;
}
