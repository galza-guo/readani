type LoadDocumentIdentity = {
  docId: string;
  title?: string;
};

type ResolveLoadedDocumentIdentityArgs = {
  hash: string;
  filePath: string;
  identity?: LoadDocumentIdentity;
};

export function getDocumentFileName(filePath: string) {
  return filePath.split(/[/\\]/).pop() || "Untitled";
}

export function getDocumentTitleFromPath(filePath: string) {
  return getDocumentFileName(filePath).replace(/\.[^.]+$/, "");
}

export function resolveLoadedDocumentIdentity({
  hash,
  filePath,
  identity,
}: ResolveLoadedDocumentIdentityArgs) {
  const actualDocId = hash.slice(0, 12);

  if (identity?.docId === actualDocId) {
    return {
      docId: identity.docId,
      title: identity.title?.trim() || getDocumentTitleFromPath(filePath),
    };
  }

  return {
    docId: actualDocId,
    title: getDocumentTitleFromPath(filePath),
  };
}

export type { LoadDocumentIdentity };
