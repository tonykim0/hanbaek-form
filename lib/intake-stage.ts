/**
 * 접수 ZIP 의 임시 자리.
 *
 * ZIP 에서 뽑은 파일은 먼저 `intake-stage/{계정}/{배치}/` 에 올린다. 사람이 화면에서 보고
 * 고치는 동안은 어느 현장에도 붙지 않은 상태다. 접수가 되는 순간 그 현장 자리로 옮기고
 * 임시본을 지운다.
 *
 * ★임시 주소를 그대로 서류 주소로 기록하지 않는다.★
 * 그렇게 하면 「임시」 폴더 안에 영구 파일이 섞여, 오래된 것을 시간 기준으로 지울 수 없다.
 * 실제로 그래서 저장소(1GB)가 찼다 — 접수하지 않고 나간 82개가 지울 수도 없이 남았다.
 *
 * 그래서 규칙이 둘이다:
 *   1) 접수되면 옮긴다 (moveStagedTo) — 임시 자리에는 붙지 않은 것만 남는다
 *   2) 붙지 않은 채 사흘이 지난 것은 지운다 (sweepStaleStaging) — 사람이 나가버려도 정리된다
 */
import { copy, del, head, list } from '@vercel/blob';

export const STAGE_ROOT = 'intake-stage';

/** 접수자별로 자리를 가른다 — 남의 ZIP 위에 덮어쓸 수 없어야 한다 */
export const stagePrefix = (userId: string) => `${STAGE_ROOT}/${userId}`;

/*
 * 붙지 않은 임시본을 얼마나 두는가.
 *
 * 사흘이다 — 금요일 저녁에 ZIP 을 올려두고 월요일 아침에 접수하는 일이 실제로 있다.
 * 하루로 잡았더니 주말을 넘긴 사람의 파일이 사라졌다.
 */
export const STAGE_TTL_MS = 72 * 60 * 60 * 1000;

const token = () => process.env.BLOB_READ_WRITE_TOKEN;

/**
 * Blob 주소에서 저장소 안의 경로를 꺼낸다.
 *
 * 주소는 `https://{store}.public.blob.vercel-storage.com/{경로}` 모양이다.
 * 한글 파일이름은 주소에서 인코딩돼 있으므로 되돌린다.
 */
/**
 * 우리 Blob 스토어의 https 주소인가 — 맞으면 그 경로를 돌려준다.
 *
 * ★클라이언트가 준 주소를 그대로 믿지 않는다.★ 붙이기 단계에 주소가 본문으로 오는데,
 * 호스트를 안 보면 남의 서버 주소가 우리 기록에 그대로 남고(한백 화면의 링크가 된다),
 * 지울 때도 그 주소가 그대로 del() 로 나간다. 서류 붙이기가 하던 검사를 여기로 올려
 * 세금계산서도 같은 것을 보게 한다(2026-08-30 검토에서 갈려 있던 것이 드러났다).
 */
const BLOB_HOST_RE = /(^|\.)blob\.vercel-storage\.com$/;

export function ourBlobPathname(blobUrl: string): string | null {
  try {
    const u = new URL(blobUrl);
    if (u.protocol !== 'https:' || !BLOB_HOST_RE.test(u.hostname)) return null;
    return decodeURIComponent(u.pathname).replace(/^\//, '');
  } catch {
    return null;
  }
}

export function pathnameOfBlobUrl(blobUrl: string): string | null {
  try {
    return decodeURIComponent(new URL(blobUrl).pathname).replace(/^\//, '');
  } catch {
    return null;
  }
}

/**
 * 이 주소가 이 사람의 임시본인가. 임시본이면 경로를 돌려준다.
 *
 * 남의 임시 자리를 가리키는 주소는 임시본으로 보지 않는다 — 그래야 다른 접수자가 올린
 * 파일을 자기 현장에 붙일 수 없다.
 */
export function stagedPathnameOf(blobUrl: string, userId: string): string | null {
  const pathname = pathnameOfBlobUrl(blobUrl);
  if (!pathname) return null;
  return pathname.startsWith(`${stagePrefix(userId)}/`) ? pathname : null;
}

/**
 * 우리 저장소에서 그 경로의 파일을 찾는다. 없으면 던진다.
 *
 * ★주소가 아니라 경로로 찾는다.★ 우리 토큰으로 우리 스토어만 뒤지므로, 남의 Blob 스토어
 * 주소(호스트 모양이 같다)를 들고 와도 여기서 걸린다. 돌려주는 주소는 늘 우리 것이다.
 */
export async function ourBlob(pathname: string) {
  return head(pathname, { token: token() });
}

/**
 * 확장자로 내용 종류를 정한다.
 *
 * 저장소에 물어보면(head) 정확하지만 왕복이 한 번 더 붙는다. 서류를 11칸 붙이는 접수에서는
 * 그 한 번이 11번이라 눈에 띄게 느려진다 — 우리가 올린 파일이라 확장자를 우리가 안다.
 */
const CONTENT_TYPE: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
};
export const contentTypeOf = (pathname: string): string =>
  CONTENT_TYPE[(pathname.split('.').pop() ?? '').toLowerCase()] ?? 'application/octet-stream';

/**
 * 임시본을 현장 자리로 옮기고 새 주소를 돌려준다.
 *
 * 지우는 것은 부르는 쪽이 저장에 성공한 뒤에 한다(dropBlob) — 여기서 함께 지우면
 * 저장이 실패했을 때 원본도 사라져 다시 시도할 수 없다.
 *
 * 없는 파일이면 copy 가 던진다 — 부르는 쪽이 그것으로 「임시본이 사라졌다」를 판단한다.
 */
export async function moveStagedTo(stagedUrl: string, toPathname: string): Promise<string> {
  // copy 는 메타데이터를 옮겨주지 않으므로 내용 종류를 여기서 준다
  const moved = await copy(stagedUrl, toPathname, {
    access: 'public',
    contentType: contentTypeOf(stagedUrl),
    token: token(),
  });
  return moved.url;
}

/**
 * 파일 하나를 지운다. 실패해도 조용히 넘어간다.
 *
 * 옮기고 남은 임시본, 갈아치운 이전 서류, 기록에 실패한 사본이 여기로 온다.
 * 지우기가 실패해서 부르는 쪽의 일(접수·업로드)이 실패하면 안 된다 — 파일 하나가 남는 것이
 * 접수를 막는 것보다 낫다.
 */
export async function dropBlob(url: string): Promise<void> {
  await del(url, { token: token() }).catch(() => {});
}

/**
 * 붙지 않은 채 오래된 임시본을 지운다.
 *
 * 접수 ZIP 을 새로 올릴 때마다 한 번 돈다. 따로 도는 작업(cron)을 두지 않는 이유는,
 * 이 폴더에 파일이 생기는 경로가 접수 ZIP 하나뿐이라 그 자리에서 치우는 것이 확실하기 때문이다.
 *
 * 모든 계정을 대상으로 한다 — 접수되면 옮겨지므로, 여기 남아 사흘이 지난 것은 누구 것이든
 * 버려진 것이다.
 */
export async function sweepStaleStaging(
  ttlMs = STAGE_TTL_MS,
  now = Date.now()
): Promise<{ deleted: number; bytes: number }> {
  const stale: string[] = [];
  let bytes = 0;
  let cursor: string | undefined;

  do {
    const page = await list({ prefix: `${STAGE_ROOT}/`, cursor, limit: 1000, token: token() });
    for (const blob of page.blobs) {
      if (now - blob.uploadedAt.getTime() < ttlMs) continue;
      stale.push(blob.url);
      bytes += blob.size;
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  // 한 번에 다 넘기면 요청이 너무 커진다. 25개씩 끊는다.
  for (let i = 0; i < stale.length; i += 25) {
    await del(stale.slice(i, i + 25), { token: token() });
  }
  return { deleted: stale.length, bytes };
}
