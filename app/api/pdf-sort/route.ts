/**
 * POST /api/pdf-sort — 스캔 묶음 PDF 를 종류별로 가른다 [로그인한 누구나 · 열람 전용 제외]
 *
 *   POST ?step=token   업로드 토큰 발급
 *   POST { blobUrl }   올린 PDF 를 읽어 분류·분할, 가른 파일의 주소를 흘려보낸다(SSE)
 *
 * 서버를 거쳐 올리지 않는 이유는 접수 ZIP 과 같다 — 서버리스 본문 한도가 4.5MB 인데
 * 스캔본은 그보다 크다. 브라우저가 Blob 에 직접 올리고 주소만 알려준다.
 *
 * 현장에 붙이지 않는다. 여기서 나오는 것은 사람이 받아 가는 파일이고, 임시 자리에
 * 두었다가 사흘 뒤 청소가 걷어간다(lib/intake-stage).
 */
import { del } from '@vercel/blob';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { canWrite, isHanbaek } from '@/lib/roles';
import { sortPdf } from '@/lib/pdf-sort';
import { stagedPathnameOf, stagePrefix, sweepStaleStaging } from '@/lib/intake-stage';

/** 방향 보정 + 판독 + 자르기까지 도는 경로라 길다. 접수 ZIP 과 같은 예산. */
export const maxDuration = 300;

const MAX_BYTES = 40 * 1024 * 1024;
const BLOB_HOST_RE = /(^|\.)blob\.vercel-storage\.com$/;

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }
  /*
   * 판독은 부를 때마다 값이 나가는 일이라(Anthropic) 로그인만으로 열어 두지 않는다 —
   * 쓰기의 문(lib/api/write-route)을 못 쓰는 라우트라 같은 판정을 손으로 한다.
   *
   * ★한백의 눈은 연다★ (한백 지시 2026-08-31) — 열람 전용(재무)도 서류를 갈라 볼 일이
   * 있고, 값이 나가는 것을 걱정할 상대는 밖이 아니라 소속 없는 계정이다. 이 라우트는
   * 아무것도 저장하지 않으므로 「쓰기」의 문으로 재는 것이 애초에 맞지 않았다.
   */
  if (!canWrite(session.role) && !isHanbaek(session.role)) {
    return NextResponse.json(
      { error: '열람 전용 계정입니다 — 보기만 할 수 있습니다.' },
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { blobUrl?: string; filename?: string }
    | null;
  if (!body) {
    return NextResponse.json({ error: '요청을 읽을 수 없습니다.' }, { status: 400 });
  }

  // ── 1단계: 토큰 ────────────────────────────────────────────────
  if (new URL(request.url).searchParams.get('step') === 'token') {
    /* 버려진 임시본을 치우는 자리 — 접수 ZIP 과 같은 폴더를 쓰므로 여기서도 돈다 */
    try {
      const swept = await sweepStaleStaging();
      if (swept.deleted > 0) {
        console.log(`[pdf-sort] 버려진 임시본 ${swept.deleted}개 정리`);
      }
    } catch (err) {
      console.error('[pdf-sort] 임시본 정리 실패:', err);
    }

    const pathname = `${stagePrefix(session.id)}/sort-${Date.now()}.pdf`;
    try {
      const token = await generateClientTokenFromReadWriteToken({
        token: process.env.BLOB_READ_WRITE_TOKEN!,
        pathname,
        // 큰 스캔본은 오래 걸린다 — 기본 30초면 올리는 중에 만료된다
        validUntil: Date.now() + 15 * 60 * 1000,
        allowedContentTypes: ['application/pdf'],
        maximumSizeInBytes: MAX_BYTES,
      });
      return NextResponse.json({ token, pathname });
    } catch (err) {
      console.error('[pdf-sort] 토큰 발급 실패:', err);
      return NextResponse.json({ error: '업로드 준비에 실패했습니다.' }, { status: 500 });
    }
  }

  // ── 2단계: 가르기 ──────────────────────────────────────────────
  const blobUrl = body.blobUrl?.trim();
  if (!blobUrl) {
    return NextResponse.json({ error: '올린 파일 주소가 없습니다.' }, { status: 400 });
  }
  try {
    const u = new URL(blobUrl);
    if (u.protocol !== 'https:' || !BLOB_HOST_RE.test(u.hostname)) throw new Error();
  } catch {
    return NextResponse.json({ error: '파일 주소가 올바르지 않습니다.' }, { status: 400 });
  }
  /*
   * ★내가 올린 것만 읽고 지운다★ (감사 2026-09-04 H8).
   *
   * 검증이 「우리 호스트인가」뿐이었다. 그런데 이 라우트는 끝나면 그 주소를 반드시
   * 지운다(아래 finally 의 del) — 그래서 로그인한 아무 계정이나(열람 전용 포함) 우리
   * 스토어의 임의 주소를 넣으면 ★현장 서류 원본이 지워졌다★. 판독 비용도 남의 파일에
   * 쓰였다. 임시 자리는 계정별로 갈려 있고 그 판정이 이미 있다(stagedPathnameOf) —
   * 없던 것은 판정이 아니라 부르는 자리였다.
   */
  if (!stagedPathnameOf(blobUrl, session.id)) {
    return NextResponse.json(
      { error: '내가 올린 파일이 아닙니다 — 다시 올려주세요.' },
      { status: 403 }
    );
  }

  /*
   * 한 덩어리로 답하지 않고 흘려보낸다(SSE) — 60장이면 1~2분 걸리는 일이라, 어느 단계인지
   * 보이지 않으면 멈춘 것과 구분되지 않는다. 마지막 줄이 결과이고 실패도 줄로 온다.
   */
  const encoder = new TextEncoder();
  const prefix = `${stagePrefix(session.id)}/sorted-${Date.now()}`;
  const name = (body.filename ?? '묶음.pdf').slice(0, 120);

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch { /* 끊긴 연결 */ }
      };
      // 아무 말 없는 구간이 20초를 넘으면 프록시가 끊는다
      const keepalive = setInterval(() => {
        try { controller.enqueue(encoder.encode(': keepalive\n\n')); } catch { /* 끊긴 연결 */ }
      }, 8000);

      try {
        send({ phase: 'fetch', message: '올린 PDF 를 읽는 중' });
        const res = await fetch(blobUrl);
        if (!res.ok) throw new Error(`올린 파일을 읽지 못했습니다 (${res.status})`);
        const pdf = Buffer.from(await res.arrayBuffer());

        const result = await sortPdf(pdf, name, prefix, (step) => send(step));
        send({ phase: 'done', result });
      } catch (err) {
        console.error('[pdf-sort] 실패:', err);
        send({ phase: 'error', error: (err as Error).message });
      } finally {
        clearInterval(keepalive);
        /* 올린 원본은 지운다 — 가른 파일이 따로 올라갔으므로 더 쓸 일이 없다 */
        await del(blobUrl, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch(() => {});
        try { controller.close(); } catch { /* 이미 닫힘 */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
