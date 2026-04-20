import pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs?worker";

const PDF_WORKER_KEY = "__readaniPdfJsWorker__";

type GlobalWithPdfWorker = typeof globalThis & {
  __readaniPdfJsWorker__?: Worker;
};

export function getPdfJsWorkerPort(): Worker {
  const scope = globalThis as GlobalWithPdfWorker;

  if (!scope[PDF_WORKER_KEY]) {
    scope[PDF_WORKER_KEY] = new pdfjsWorker();
  }

  return scope[PDF_WORKER_KEY];
}
