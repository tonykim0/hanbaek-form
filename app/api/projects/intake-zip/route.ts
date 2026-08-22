/**
 * POST /api/projects/intake-zip — 접수 ZIP 자동 처리
 *
 *   POST ?step=token   업로드 토큰 발급
 *   POST { blobUrl }   올린 ZIP 을 읽어 분류·판독·주소대조
 *
 * 서버를 거쳐 올리지 않는 이유: 서버리스 본문 한도가 4.5MB 다. 계약서 묶음은 스캔본이라
 * 그것보다 크다. 그래서 브라우저가 Blob 에 직접 올리고 끝난 뒤 주소만 알려준다 —
 * 포털의 접수(/api/upload → /api/intake)가 같은 방식이다.
 *
 * 현장을 만들지는 않는다. 사람이 확인·수정한 뒤 POST /api/projects 로 접수한다.
 *
 * 포털의 /api/intake 와 다른 라우트다. 그쪽은 노션이 필수 경로이고 세션을 안 본다.
 * 여기는 로그인한 사람만 부를 수 있고 노션을 타지 않는다.
 */
import { del } from '@vercel/blob';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { canWrite } from '@/lib/roles';
import { autoIntakeFromZip } from '@/lib/intake-auto';
import { stagePrefix, sweepStaleStaging } from '@/lib/intake-stage';

/** 분류·판독까지 도는 경로라 길다. 포털의 판독 라우트와 같은 예산. */
export const maxDuration = 300;

const ZIP_CONTENT_TYPES = [
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
];
/** 스캔본 묶음이라 크다. 안쪽 PDF 총량은 lib/intake-auto 가 따로 막는다. */
const MAX_BYTES = 60 * 1024 * 1024;
const BLOB_HOST_RE = /(^|\.)blob\.vercel-storage\.com$/;

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }
  /*
   * 열람 전용은 올리지 않는다. 쓰기의 문은 lib/api/write-route 한 곳이지만 이 라우트는
   * 그 껍데기를 못 쓴다(위 머리말) — 그래서 같은 판정을 여기서 한 번 더 부른다.
   */
  if (!canWrite(session.role)) {
    return NextResponse.json(
      { error: '열람 전용 계정입니다 — 보기만 할 수 있습니다.' },
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => null)) as { blobUrl?: string } | null;
  if (!body) {
    return NextResponse.json({ error: '요청을 읽을 수 없습니다.' }, { status: 400 });
  }

  // ── 1단계: 토큰 ────────────────────────────────────────────────
  if (new URL(request.url).searchParams.get('step') === 'token') {
    /*
     * 올리기 전에 버려진 임시본을 치운다.
     *
     * 접수하지 않고 나가면 ZIP 에서 뽑은 파일이 임시 자리에 남는다. 접수된 것은 현장 자리로
     * 옮겨지므로(lib/intake-stage), 여기 남아 하루가 지난 것은 버려진 것이다.
     * 이 폴더에 파일이 생기는 경로가 접수 ZIP 하나뿐이라 그 자리에서 치우면 충분하다.
     *
     * 실패해도 올리기를 막지 않는다 — 청소는 다음 접수 때 또 돈다.
     */
    try {
      const swept = await sweepStaleStaging();
      if (swept.deleted > 0) {
        console.log(
          `[intake-zip] 버려진 임시본 ${swept.deleted}개 정리 (${(swept.bytes / 1024 / 1024).toFixed(1)}MB)`
        );
      }
    } catch (err) {
      console.error('[intake-zip] 임시본 정리 실패:', err);
    }

    /*
     * 경로를 서버가 만든다. 클라이언트가 지어 보내면 세션 id 를 알려줘야 하고,
     * 토큰이 묶인 경로와 실제 올리는 경로가 한 글자라도 어긋나면 업로드가 거절된다.
     * 만들어서 함께 돌려주면 어긋날 수가 없다.
     */
    const pathname = `${stagePrefix(session.id)}/zip-${Date.now()}.zip`;
    try {
      const token = await generateClientTokenFromReadWriteToken({
        token: process.env.BLOB_READ_WRITE_TOKEN!,
        pathname,
        // 큰 파일은 오래 걸린다. 기본 30초로는 올리는 중에 만료된다.
        validUntil: Date.now() + 15 * 60 * 1000,
        allowedContentTypes: ZIP_CONTENT_TYPES,
        maximumSizeInBytes: MAX_BYTES,
      });
      return NextResponse.json({ token, pathname });
    } catch (err) {
      console.error('[intake-zip] 토큰 발급 실패:', err);
      return NextResponse.json({ error: '업로드 준비에 실패했습니다.' }, { status: 500 });
    }
  }

  // ── 2단계: 읽기 ────────────────────────────────────────────────
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
   * 한 덩어리로 답하지 않고 흘려보낸다(SSE).
   *
   * 판독까지 30초쯤 걸리는데 그동안 화면에 「읽는 중」 한 줄만 있으면 멈춘 것과 구분되지 않는다.
   * 어느 단계인지 · 몇 장을 읽는지 · 몇 개를 올렸는지가 보여야 기다릴 수 있다.
   *
   * 마지막 줄이 결과이고(done), 실패도 줄로 보낸다(error) — 상태 코드는 이미 200 으로 떠났다.
   */
  const encoder = new TextEncoder();
  const prefix = `${stagePrefix(session.id)}/${Date.now()}`;

  const stream = new ReadableStream({
    async start(controller) {
      /** 사람이 창을 닫으면 enqueue 가 던진다 — 그때 판독을 멈추지는 않는다(임시본 정리가 꼬인다) */
      const send = (event: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch { /* 끊긴 연결 */ }
      };
      // 중간에 아무 말도 없는 구간이 20초를 넘으면 프록시가 끊는다
      const keepalive = setInterval(() => {
        try { controller.enqueue(encoder.encode(': keepalive\n\n')); } catch { /* 끊긴 연결 */ }
      }, 8000);

      try {
        send({ phase: 'fetch', message: '올린 ZIP 을 읽는 중' });
        const res = await fetch(blobUrl);
        if (!res.ok) throw new Error(`올린 파일을 읽지 못했습니다 (${res.status})`);
        const zip = Buffer.from(await res.arrayBuffer());

        const result = await autoIntakeFromZip(zip, prefix, (step) => send(step));
        send({ phase: 'done', result });
      } catch (err) {
        console.error('[intake-zip] 실패:', err);
        send({ phase: 'error', error: (err as Error).message });
      } finally {
        clearInterval(keepalive);
        /*
         * 올린 ZIP 은 지운다. 안의 파일은 칸별로 따로 올려뒀으므로 묶음 원본은 더 쓸 일이 없다.
         * 실패했을 때도 지운다 — 남겨두면 다시 시도할 때마다 쌓인다.
         */
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
      // Vercel 프록시가 흘려보내는 응답을 모아두지 않게 한다
      'X-Accel-Buffering': 'no',
    },
  });
}
