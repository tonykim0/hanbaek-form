/**
 * 접수 화면이 파일을 올리는 절차.
 *
 * ★서버를 거치지 않고 Blob 에 직접 올린다★ — 서버리스 본문 한도가 4.5MB 인데 계약서
 * 묶음은 스캔본이라 그보다 크다. 서버에는 「그 경로 하나에만 유효한」 토큰을 받으러
 * 한 번, 올린 주소를 알려주러 한 번 간다.
 *
 * 화면에서 떼어 둔 이유는 줄 수가 아니라 섞임이다 — 토큰·업로드·SSE 읽기라는 통신
 * 절차와, 판독 결과를 폼 칸에 옮기는 일이 한 함수 안에 있었다. 여기는 통신만 안다:
 * 진행 상황은 콜백으로 흘려보내고, 결과만 돌려준다.
 */
import { docContentType } from '@/types/project';
import type { AutoIntakeResult } from '@/lib/intake-auto';

async function blobToken(url: string, body: unknown): Promise<{ token: string; pathname: string }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const b = (await res.json().catch(() => ({}))) as { token?: string; pathname?: string; error?: string };
  if (!res.ok || !b.token || !b.pathname) throw new Error(b.error ?? '업로드 준비에 실패했습니다.');
  return { token: b.token, pathname: b.pathname };
}

/** 계약서 묶음(ZIP)을 올리고 판독까지 — 30초쯤 걸리는 일이라 단계를 콜백으로 흘려보낸다 */
export async function uploadIntakeZip(
  zip: File,
  onPhase: (message: string) => void
): Promise<AutoIntakeResult> {
  onPhase('올리는 중 0%');
  const { token, pathname } = await blobToken('/api/projects/intake-zip?step=token', {});

  // 서버가 준 경로 그대로 올린다 — 토큰이 그 경로 하나에만 유효하다
  const { put } = await import('@vercel/blob/client');
  const blob = await put(pathname, zip, {
    access: 'public',
    token,
    contentType: zip.type || 'application/zip',
    onUploadProgress: ({ percentage }) => onPhase(`올리는 중 ${Math.round(percentage)}%`),
  });

  /*
   * 서버가 단계를 흘려보낸다(SSE). 마지막 줄이 결과다 — 그 줄이 안 오면 실패로 본다.
   */
  onPhase('읽기 시작…');
  const res = await fetch('/api/projects/intake-zip', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ blobUrl: blob.url }),
  });
  if (!res.ok || !res.body) {
    const b = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(b.error ?? '읽지 못했습니다.');
  }

  let data: AutoIntakeResult | null = null;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (!data) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    // 줄 단위로 온다. 반쪽 줄이 남으면 다음 덩어리와 이어 붙인다.
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const ev = JSON.parse(line.slice(6)) as {
        phase: string; message?: string; done?: number; total?: number;
        result?: AutoIntakeResult; error?: string;
      };
      if (ev.phase === 'error') throw new Error(ev.error ?? '읽지 못했습니다.');
      if (ev.phase === 'done' && ev.result) { data = ev.result; break; }
      onPhase(ev.total ? `${ev.message} (${(ev.done ?? 0) + 1}/${ev.total})` : (ev.message ?? '읽는 중…'));
    }
  }
  if (!data) throw new Error('읽는 중에 연결이 끊겼습니다. 다시 올려주세요.');
  return data;
}

/** 서류 한 칸의 파일 — 고른 그 자리에서 임시 자리에 올린다 */
export async function uploadIntakeFile(
  kind: string,
  file: File,
  onProgress: (percent: number) => void
): Promise<{ filename: string; blobUrl: string }> {
  const ext = (file.name.split('.').pop() ?? 'pdf').toLowerCase();
  const { token, pathname } = await blobToken('/api/projects/intake-file', { kind, ext });

  const { put } = await import('@vercel/blob/client');
  const blob = await put(pathname, file, {
    access: 'public',
    token,
    // 확장자로 정한다 — 한컴오피스 xlsx(application/haansoftxlsx)가 거절당했다
    contentType: docContentType(file.name, file.type),
    onUploadProgress: ({ percentage }) => onProgress(Math.round(percentage)),
  });
  // 이름은 사람이 고른 그 이름을 쓴다 — 경로는 우리가 지었으므로 알아볼 수 없다
  return { filename: file.name, blobUrl: blob.url };
}
