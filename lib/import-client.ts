'use client';

/**
 * 스캔 PDF 업로드 + 판독 호출 (클라이언트).
 *
 * 작은 파일은 서버로 바로 보내고, 서버리스 본문 한도(4.5MB)를 넘으면
 * Blob에 먼저 올린 뒤 URL만 넘깁니다 — /intake와 같은 방식입니다.
 */

import type { CpoKey, FormImportResult } from './form-import';

/** 이 크기 이하는 multipart로 바로 전송 (서버 라우트의 상한과 맞춰둡니다) */
const INLINE_LIMIT_BYTES = 4 * 1024 * 1024;

export const CPO_LABELS: Record<CpoKey, string> = {
  hec: '현대엔지니어링',
  nice: '나이스인프라',
  sk: 'SK일렉링크',
  pluglink: '플러그링크',
};

export type ImportPhase =
  | { kind: 'uploading'; percentage: number }
  | { kind: 'reading' };

export interface ImportOptions {
  file: File;
  cpo: CpoKey;
  onPhase?: (phase: ImportPhase) => void;
}

export async function importFormFromPdf({
  file,
  cpo,
  onPhase,
}: ImportOptions): Promise<FormImportResult> {
  if (file.size <= INLINE_LIMIT_BYTES) {
    onPhase?.({ kind: 'reading' });
    const body = new FormData();
    body.append('file', file);
    body.append('cpo', CPO_LABELS[cpo]);
    const res = await fetch('/api/import-form', { method: 'POST', body });
    return readResult(res);
  }

  onPhase?.({ kind: 'uploading', percentage: 0 });
  const blobUrl = await uploadPdf(file, (percentage) =>
    onPhase?.({ kind: 'uploading', percentage })
  );

  onPhase?.({ kind: 'reading' });
  const res = await fetch('/api/import-form', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blobUrl, fileName: file.name, cpo: CPO_LABELS[cpo] }),
  });
  return readResult(res);
}

async function uploadPdf(
  file: File,
  onProgress: (percentage: number) => void
): Promise<string> {
  const pathname = `form-import-${Date.now()}.pdf`;
  const tokenRes = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pathname }),
  });
  const tokenData = await readJsonSafely<{ token?: string; error?: string }>(tokenRes);
  if (!tokenRes.ok || !tokenData?.token) {
    throw new Error(tokenData?.error ?? '업로드 토큰 발급에 실패했습니다.');
  }

  const { put } = await import('@vercel/blob/client');
  const blob = await put(pathname, file, {
    access: 'public',
    contentType: 'application/pdf',
    token: tokenData.token,
    onUploadProgress: ({ percentage }) => onProgress(Math.round(percentage)),
  });
  return blob.url;
}

async function readResult(res: Response): Promise<FormImportResult> {
  const data = await readJsonSafely<FormImportResult & { error?: string }>(res);
  if (!res.ok || !data || data.error) {
    throw new Error(data?.error ?? `판독 요청이 실패했습니다 (${res.status})`);
  }
  return data;
}

async function readJsonSafely<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}
