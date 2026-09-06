/**
 * POST   /api/notices/[id]/files — 공지에 파일 붙이기 [한백 전용] (multipart)
 * DELETE /api/notices/[id]/files — 붙은 파일 한 장 빼기 [한백 전용] ({ url })
 *
 * 공지 첨부는 ★받아 가는 파일★이다 — 양식·서식·안내문. 검수 대상(서류)이 아니라
 * 종류를 좁히지 않는다: 엑셀 양식이 대부분이고 한글·PDF·그림도 온다.
 *
 * POST 만 adminWrite 껍데기를 안 쓴다 — 껍데기는 본문을 JSON 으로 읽는데 파일은
 * multipart 로 온다. ★권한 확인·오류 모양을 손으로 옮겨 적는 자리라 빠뜨리기 쉽다★
 * (실사고 2026-08-25 — 협력사 정보 올리기에서 열람 전용 차단이 빠져 있었다).
 * 여기는 한백 관리자만이므로 role === 'admin' 까지 본다.
 */
import { NextResponse } from 'next/server';
import { del, put } from '@vercel/blob';
import { getRepository } from '@/lib/data';
import { actorOf, getSessionUser } from '@/lib/auth/session';
import { adminWrite, BadRequest } from '@/lib/api/write-route';

/* 서버리스 본문 한도(4.5MB) 아래 — 양식 파일은 대개 수백 KB 다 */
const MAX_FILE_BYTES = 4 * 1024 * 1024;

export const DELETE = adminWrite<{ id: string }, { url?: unknown }>(
  '한백 관리자만 공지 첨부를 뺄 수 있습니다.',
  async ({ body, params, actor }) => {
    if (typeof body?.url !== 'string' || !body.url) throw new BadRequest('뺄 파일을 고르세요.');
    const gone = await getRepository().removeNoticeFile(params.id, body.url, actor);
    /* DB 가 정본이다 — Blob 삭제 실패로 요청을 실패시키지 않는다 */
    await del(gone).catch(() => undefined);
  }
);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json(
      { error: '한백 관리자만 공지 첨부를 올릴 수 있습니다.' },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;
    const form = await request.formData().catch(() => {
      throw new BadRequest('요청을 읽을 수 없습니다.');
    });
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) throw new BadRequest('파일이 없습니다.');
    if (file.size > MAX_FILE_BYTES) {
      throw new BadRequest(
        `파일이 너무 큽니다 (${(file.size / 1024 / 1024).toFixed(1)}MB). 4MB 이하로 줄여주세요.`
      );
    }

    /*
     * 이름을 그대로 경로에 쓰지 않는다 — 한글·공백·슬래시가 섞인다. 랜덤 접미사가
     * 붙으므로 같은 공지에 같은 이름을 두 번 올려도 서로 안 덮는다. 보여줄 이름은
     * DB 의 name 이 정본이라 경로가 어떻든 사람은 원래 이름으로 받는다.
     */
    const ext = file.name.includes('.') ? `.${file.name.split('.').pop()}` : '';
    const blob = await put(`notice-files/${id}${ext}`, file, {
      access: 'public',
      addRandomSuffix: true,
    });

    try {
      await getRepository().attachNoticeFile(
        id,
        { name: file.name, url: blob.url, size: file.size, uploadedAt: new Date().toISOString() },
        actorOf(session)
      );
    } catch (err) {
      await del(blob.url).catch(() => undefined); // DB 에 못 붙인 파일을 남기지 않는다
      throw err;
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const status = err instanceof BadRequest ? 400 : 422;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
