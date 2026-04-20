export const READANI_VERSION = __READANI_APP_VERSION__;
export const READANI_BUILD_TIMESTAMP = __READANI_BUILD_TIMESTAMP__;
export const READANI_PRODUCT_NAME = "readani";
export const READANI_AUTHOR_NAME = "Gallant GUO";
export const READANI_AUTHOR_EMAIL = "glt@gallantguo.com";
export const READANI_UPSTREAM_AUTHOR_NAME = "Everett (everettjf)";
export const READANI_UPSTREAM_AUTHOR_URL = "https://github.com/everettjf";
export const READANI_UPSTREAM_REPO_NAME = "PDFRead";
export const READANI_UPSTREAM_REPO_URL = "https://github.com/everettjf/PDFRead";

function formatBuildTimestamp(timestamp: string): string {
  const parsedTimestamp = new Date(timestamp);

  if (Number.isNaN(parsedTimestamp.getTime())) {
    return timestamp;
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(parsedTimestamp);
}

function resolveReleaseYear(timestamp: string): number {
  const parsedTimestamp = new Date(timestamp);

  if (Number.isNaN(parsedTimestamp.getTime())) {
    return new Date().getFullYear();
  }

  return parsedTimestamp.getFullYear();
}

export const READANI_BUILD_TIMESTAMP_LABEL = formatBuildTimestamp(READANI_BUILD_TIMESTAMP);
export const READANI_COPYRIGHT_LINE = `Copyright © ${resolveReleaseYear(
  READANI_BUILD_TIMESTAMP
)} ${READANI_AUTHOR_NAME}. All rights reserved.`;
