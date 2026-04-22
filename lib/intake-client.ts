'use client';

import type { IntakeStreamEvent } from '@/types/intake';

interface UploadTokenResponse {
  token?: string;
  error?: string;
}

interface UploadIntakeZipOptions {
  file: File;
  password: string;
  onProgress?: (percentage: number) => void;
}

interface StartIntakeSessionOptions {
  salesRepName: string;
  salesRepCompany: string;
  password: string;
  blobUrl: string;
  onEvent: (event: IntakeStreamEvent) => void;
}

export async function uploadIntakeZip({
  file,
  password,
  onProgress,
}: UploadIntakeZipOptions): Promise<string> {
  const pathname = createIntakeUploadPath();
  const tokenRes = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pathname, password }),
  });
  const tokenData = await readJsonSafely<UploadTokenResponse>(tokenRes);

  if (!tokenRes.ok || !tokenData?.token) {
    throw new Error(tokenData?.error ?? '업로드 토큰 발급 실패');
  }

  const { put } = await import('@vercel/blob/client');
  const blob = await put(pathname, file, {
    access: 'public',
    token: tokenData.token,
    onUploadProgress: ({ percentage }) => {
      onProgress?.(Math.round(percentage));
    },
  });

  return blob.url;
}

export async function startIntakeSession({
  salesRepName,
  salesRepCompany,
  password,
  blobUrl,
  onEvent,
}: StartIntakeSessionOptions): Promise<void> {
  const res = await fetch('/api/intake', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      salesRepName,
      salesRepCompany,
      password,
      blobUrl,
    }),
  });

  if (!res.body) {
    throw new Error('서버 스트림을 시작할 수 없습니다.');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const parsed = parseSseEvents(buffer + decoder.decode(value, { stream: true }));
    buffer = parsed.buffer;

    for (const event of parsed.events) {
      onEvent(event);
      if (event.phase === 'done' || event.phase === 'error') {
        return;
      }
    }
  }

  if (buffer.trim()) {
    const parsed = parseSseEvents(`${buffer}\n\n`);
    for (const event of parsed.events) {
      onEvent(event);
      if (event.phase === 'done' || event.phase === 'error') {
        return;
      }
    }
  }

  throw new Error('서버 응답이 중간에 종료되었습니다.');
}

function createIntakeUploadPath(): string {
  return `intake-${Date.now()}.zip`;
}

function parseSseEvents(buffer: string): {
  events: IntakeStreamEvent[];
  buffer: string;
} {
  const events: IntakeStreamEvent[] = [];
  const chunks = buffer.split('\n\n');
  const nextBuffer = chunks.pop() ?? '';

  for (const chunk of chunks) {
    const dataLines = chunk
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => line.slice(6));

    if (dataLines.length === 0) continue;

    try {
      events.push(JSON.parse(dataLines.join('\n')) as IntakeStreamEvent);
    } catch {
      throw new Error('서버 응답을 해석하지 못했습니다.');
    }
  }

  return { events, buffer: nextBuffer };
}

async function readJsonSafely<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}
