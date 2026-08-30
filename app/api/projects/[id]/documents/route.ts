/**
 * POST /api/projects/[id]/documents — 서류 여러 칸을 한 번에 붙인다
 *
 * ★접수의 마지막 걸음이다.★
 *
 * 예전에는 화면이 칸마다 요청을 보냈다. 11칸이면 요청이 11번이고, 요청마다 서버가 현장을
 * 통째로 다시 읽어서 12초가 걸렸다. 접수하는 사람 입장에서는 ZIP 올릴 때 이미 다 올려놓고
 * 마지막에 또 무언가를 기다리는 셈이라, 그 단계가 있다는 것 자체가 설명되지 않는다.
 *
 * 그래서 목록을 통째로 받는다. 현장은 한 번만 읽고, 옮기는 일만 몇 개씩 겹쳐 돈다.
 *
 * 파일 자체는 이미 Blob 에 있다 — 여기서 오가는 것은 주소뿐이라 본문이 작다.
 *
 * ★lib/api/write-route 껍데기를 쓰지 않는 이유★
 * 그 껍데기는 성공이면 { ok: true }, 실패면 { error } 한 줄이다. 이 라우트는 「11칸 중 9칸은
 * 붙었고 2칸이 왜 안 됐다」를 답해야 해서 실패 쪽에도 목록을 실어 보낸다 — 화면이 그 첫 칸을
 * 집어 「전기안전점검: …」처럼 어느 서류가 걸렸는지 말한다. 반쪽 성공을 한 줄로 줄일 수 없다.
 */
import { NextResponse } from 'next/server';
import { getSessionUser, viewerOf } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';
import { canAccessProject, canWrite } from '@/lib/roles';
import { attachDocument } from '@/lib/attach-doc';

/** 옮기기는 Blob 왕복이라 몇 개씩 겹친다. 한꺼번에 다 보내면 되레 느려진다. */
const WAVE = 4;

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
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

  const body = (await request.json().catch(() => null)) as
    | { docs?: Array<{
        kind?: string; filename?: string; blobUrl?: string;
        title?: string; photo?: string[];
      }> }
    | null;
  const docs = body?.docs;
  if (!Array.isArray(docs) || docs.length === 0) {
    return NextResponse.json({ error: '붙일 서류가 없습니다.' }, { status: 400 });
  }
  if (docs.length > 40) {
    return NextResponse.json({ error: '한 번에 붙일 수 있는 서류를 넘었습니다.' }, { status: 400 });
  }

  // 현장은 한 번만 읽는다 — 접근 권한과 「지금 그 칸에 무엇이 있나」를 여기서 함께 얻는다
  const detail = await getRepository().getProject(params.id, viewerOf(session));
  if (!detail || !canAccessProject(session.role, session.org, detail.project)) {
    return NextResponse.json({ error: '이 현장에 올릴 수 없습니다.' }, { status: 404 });
  }
  /** 그 칸에 이미 파일이 있는가 — 임시본이 사라진 재시도를 성공으로 볼지 가른다 */
  const hasOf = (kind: string) =>
    (detail.documents.find((d) => d.kind === kind)?.files.length ?? 0) > 0;

  const failed: Array<{ kind: string; error: string }> = [];
  let attached = 0;

  for (let i = 0; i < docs.length; i += WAVE) {
    const wave = await Promise.all(
      docs.slice(i, i + WAVE).map(async (d) => ({
        kind: d.kind ?? '',
        result: await attachDocument({
          projectId: params.id,
          kind: d.kind ?? '',
          filename: d.filename ?? '',
          blobUrl: d.blobUrl ?? '',
          title: d.title ?? null,
          photo: Array.isArray(d.photo) ? d.photo.filter((x) => typeof x === 'string') : null,
          has: hasOf(d.kind ?? ''),
          session,
        }),
      }))
    );
    for (const { kind, result } of wave) {
      if (result.ok) attached += 1;
      else failed.push({ kind, error: result.error });
    }
  }

  /*
   * 한 칸이 실패해도 나머지는 붙인다. 접수를 통째로 되돌리면 사람이 처음부터 다시 해야 하는데,
   * 붙는 일은 칸끼리 독립이라 되돌릴 이유가 없다 — 무엇이 안 붙었는지 알려주고 다시 부르면 된다.
   * 같은 목록으로 다시 불러도 이미 붙은 칸은 그냥 통과한다(멱등).
   */
  if (failed.length > 0) {
    return NextResponse.json({ attached, failed }, { status: 422 });
  }
  return NextResponse.json({ attached });
}
