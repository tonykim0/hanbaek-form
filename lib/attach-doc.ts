/**
 * 올라온 파일 하나를 현장의 서류 칸에 붙인다.
 *
 * 한 장씩 올리는 길(현장 상세의 「다시 올리기」)과 접수 때 한꺼번에 붙이는 길이 이 함수를
 * 같이 쓴다. 두 벌로 두면 한쪽만 고쳐지는 일이 생긴다 — 실제로 권한 검사와 고아 파일
 * 정리가 그렇게 어긋나기 쉬운 자리다.
 *
 * 서버 전용.
 */
import { actorOf } from '@/lib/auth/session';
import type { SessionPayload } from '@/lib/auth/types';
import { getRepository } from '@/lib/data';
import { isKnownDocKind } from '@/lib/data/assemble';
import {
  dropBlob,
  moveStagedTo,
  ourBlob,
  pathnameOfBlobUrl,
  stagedPathnameOf,
} from '@/lib/intake-stage';

const BLOB_HOST_RE = /(^|\.)blob\.vercel-storage\.com$/;

export type AttachResult =
  | { ok: true; already?: boolean }
  | { ok: false; status: number; error: string };

export async function attachDocument(input: {
  projectId: string;
  kind: string;
  filename: string;
  blobUrl: string;
  /** 지금 그 칸이 가리키는 파일. 갈아치우면 이것을 지운다. */
  prev: string | null;
  session: SessionPayload;
}): Promise<AttachResult> {
  const { projectId, kind, session } = input;
  const filename = input.filename.trim();
  if (!input.blobUrl || !filename) {
    return { ok: false, status: 400, error: '올린 파일 정보가 없습니다.' };
  }
  /*
   * 경로 조작을 막는다 — kind 는 우리가 아는 서류 종류 이름뿐이다.
   * 글자 모양(정규식)으로 걸렀더니 'photoDone' 처럼 대문자가 든 이름이 막혀서
   * 설치완료사진을 올릴 수 없었다. 목록으로 대조하는 편이 좁고 정확하다.
   */
  if (!isKnownDocKind(kind)) {
    return { ok: false, status: 400, error: '서류 종류가 올바르지 않습니다.' };
  }
  try {
    const u = new URL(input.blobUrl);
    if (u.protocol !== 'https:' || !BLOB_HOST_RE.test(u.hostname)) throw new Error();
  } catch {
    return { ok: false, status: 400, error: '파일 주소가 올바르지 않습니다.' };
  }

  /*
   * 두 가지 주소만 받는다.
   *
   *   projects/{현장}/{종류}-…   ← 그 칸의 토큰으로 올린 것
   *   intake-stage/{계정}/…      ← 접수 화면에서 올린 것 (ZIP 에서 나왔거나 사람이 고른 것)
   *
   * 임시본은 그대로 기록하지 않고 현장 자리로 옮긴다. 임시 주소를 서류 주소로 쓰면
   * 「임시」 폴더 안에 영구 파일이 섞여 오래된 것을 지울 수 없게 된다(lib/intake-stage).
   */
  const own = `projects/${projectId}/${kind}-`;
  const pathname = pathnameOfBlobUrl(input.blobUrl) ?? '';
  const staged = stagedPathnameOf(input.blobUrl, session.id);
  if (!staged && !pathname.startsWith(own)) {
    return { ok: false, status: 400, error: '이 현장·서류의 파일 주소가 아닙니다.' };
  }

  const prev = input.prev;
  const prevIsOurs = (pathnameOfBlobUrl(prev ?? '') ?? '').startsWith(`projects/${projectId}/`);

  let blobUrl: string;
  /** 저장이 실패하면 되돌릴 사본 */
  let copied: string | null = null;

  if (staged) {
    // 확장자는 파일이름이 아니라 실제 올라간 경로에서 딴다
    const ext = (staged.split('.').pop() ?? 'pdf').toLowerCase();
    try {
      blobUrl = await moveStagedTo(staged, `${own}${Date.now()}.${ext}`);
      copied = blobUrl;
    } catch (err) {
      /*
       * 임시본이 없다. 두 가지 경우이고, 갈라서 답해야 한다.
       *
       * ★이미 이 칸에 붙여둔 뒤의 재시도★ — 접수가 도중에 끊겨 다시 누른 경우다.
       * 실패로 답하면 재시도가 막혀 영구히 접수할 수 없다 — 성공으로 본다(멱등).
       *
       * 그 밖은 청소가 걷어간 것이다. ZIP 을 다시 올려야 한다.
       */
      if (prev && prevIsOurs) return { ok: true, already: true };
      console.error('[attach-doc] 임시본 옮기기 실패:', err);
      return {
        ok: false,
        status: 422,
        error: '임시로 보관한 파일을 찾을 수 없습니다. 접수 ZIP 을 다시 올려주세요.',
      };
    }
  } else {
    /*
     * ★클라이언트가 준 주소를 그대로 믿지 않는다.★
     * 호스트 모양(*.blob.vercel-storage.com)은 남의 Blob 스토어도 같다. 그 주소를 기록하면
     * 한백이 검수하는 계약서가 협력사 서버의 파일이 되고, 승인 뒤 내용이 바뀔 수도 있다.
     * 그래서 경로만 받아 우리 저장소에서 직접 찾고, 찾은 주소를 쓴다.
     * 올라오지 않은 파일을 기록하는 일도 이걸로 함께 막힌다.
     */
    try {
      blobUrl = (await ourBlob(pathname)).url;
    } catch {
      return { ok: false, status: 422, error: '올린 파일을 찾을 수 없습니다. 다시 올려주세요.' };
    }
  }

  try {
    await getRepository().uploadDocument(
      { projectId, kind, filename, blobUrl },
      actorOf(session)
    );
  } catch (err) {
    // 기록이 안 됐으면 방금 만든 사본을 남기지 않는다 — 아무도 가리키지 않는 파일이 된다
    if (copied) await dropBlob(copied);
    return { ok: false, status: 422, error: (err as Error).message };
  }

  /*
   * 저장이 끝난 뒤에 지운다. 순서를 바꾸면 저장이 실패했을 때 원본이 사라져 다시 시도할 길이 없다.
   * 지우기가 실패해도 접수는 성공이다 — 파일 하나가 남는 것이 접수를 막는 것보다 낫다.
   */
  if (staged) await dropBlob(input.blobUrl);
  /*
   * 갈아치운 이전 파일도 지운다. 경로에 시각이 붙어 있어 새로 올리면 늘 다른 파일이므로,
   * 안 지우면 반려·재업로드를 반복한 칸에 아무도 안 보는 스캔본이 쌓인다.
   */
  if (prev && prevIsOurs && prev !== blobUrl) await dropBlob(prev);

  return { ok: true };
}
