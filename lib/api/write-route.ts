/**
 * 쓰기 라우트의 껍데기.
 *
 * ★한 곳에 모으는 이유★
 * 라우트 아홉 개가 같은 네 단계를 각자 적고 있었다 — 권한 확인 → 본문 읽기 → 값 검사 →
 * 저장소 호출. 벌써 갈라져 있었다: 어떤 곳은 try/catch 로 본문을 읽고 옆에서는
 * `.catch(() => null)` 을 쓰고, 어떤 곳은 400 을 주고 옆에서는 같은 잘못에 422 를 줬다.
 *
 * 화면(lib/use-action.ts)이 `{ error }` 하나만 보고 문구를 띄우므로, 이 응답 모양이
 * 라우트마다 다르면 화면이 무엇을 믿을지 알 수 없다. 계약을 여기 한 곳에 못 박는다.
 *
 * 본문을 안 보낸 요청(DELETE 등)은 handle 에 body 가 undefined 로 들어간다 — 본문을 쓰는
 * 핸들러는 `if (!body...)` 로 먼저 막는다.
 *
 *   401  로그인 안 됨            (sessionWrite)
 *   403  한백 전용인데 협력사임   (adminWrite)
 *   403  열람 전용 계정          (모든 쓰기 — 아래 canWrite)
 *   400  값이 틀렸다             (BadRequest 를 throw)
 *   422  규칙에 걸렸다           (저장소가 던진 그 밖의 Error)
 *   200  { ok: true }
 *
 * 권한은 여기서도 확인하고 저장소에서 assertAdmin 으로 한 번 더 본다 — 나중에 새 라우트를
 * 추가할 때 이 껍데기를 안 쓰더라도 저장소가 잡아준다.
 */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { actorOf, getSessionUser } from '@/lib/auth/session';
import type { Actor } from '@/lib/auth/types';
import { canWrite } from '@/lib/roles';

/**
 * 값이 틀렸다 — 400 으로 나간다.
 *
 * 규칙에 걸린 것(422)과 가른다. 「구분이 셋 중 하나가 아니다」는 보낸 값이 틀린 것이고,
 * 「관리자 계정은 여기서 못 바꾼다」는 값은 맞지만 규칙이 막는 것이다. 둘을 같은 코드로
 * 두면 화면이 「다시 입력하세요」와 「할 수 없는 일입니다」를 구분해 말할 수 없다.
 */
export class BadRequest extends Error {}

type Handler<P, B> = (input: {
  body: B;
  params: P;
  actor: Actor;
}) => Promise<unknown>;

function wrap<P, B>(adminOnly: boolean, deny: string, handle: Handler<P, B>) {
  return async (request: Request, ctx: { params: P }): Promise<NextResponse> => {
    const session = adminOnly ? await requireAdmin() : await getSessionUser();
    if (!session) {
      return NextResponse.json({ error: deny }, { status: adminOnly ? 403 : 401 });
    }

    /*
     * ★열람 전용은 여기서 전부 걸린다.★
     *
     * 쓰기마다 「이 사람이 이걸 할 수 있나」를 적어 두면 다음에 만드는 라우트가 빠뜨린다.
     * 열람 전용의 규칙은 자리마다 다르지 않다 — 어떤 쓰기도 안 된다. 그러면 판정할 자리는
     * 쓰기의 입구 한 곳이면 된다. 저장소의 assertAdmin 이 한 번 더 보지만 그것은 한백
     * 전용 쓰기만 본다: 협력사도 하는 쓰기(접수·진행현황·공정)는 여기가 유일한 문이다.
     */
    if (!canWrite(session.role)) {
      return NextResponse.json(
        { error: '열람 전용 계정입니다 — 보기만 할 수 있습니다.' },
        { status: 403 }
      );
    }

    /*
     * 본문 없는 요청은 잘못이 아니다.
     *
     * DELETE 는 보통 본문 없이 온다(주소에 무엇을 지울지 다 적혀 있다). 예전에는 여기서
     * request.json() 이 곧바로 던져서 「요청을 읽을 수 없습니다」 400 이 나갔다 —
     * 그래서 삭제 라우트는 이 껍데기를 못 쓰고 네 단계를 각자 적고 있었다.
     *
     * 보낸 것이 아예 없으면 undefined, 보냈는데 JSON 이 아니면 400 이다. 둘을 가른다.
     */
    const raw = await request.text().catch(() => '');
    let body: B;
    if (raw.trim() === '') {
      body = undefined as B;
    } else {
      try {
        body = JSON.parse(raw) as B;
      } catch {
        return NextResponse.json({ error: '요청을 읽을 수 없습니다.' }, { status: 400 });
      }
    }

    try {
      // 핸들러가 객체를 돌려주면 응답에 실어 보낸다 (묶음 처리의 실패 목록 같은 것)
      const extra = await handle({ body, params: ctx.params, actor: actorOf(session) });
      return NextResponse.json(
        extra && typeof extra === 'object' ? { ok: true, ...extra } : { ok: true }
      );
    } catch (err) {
      const status = err instanceof BadRequest ? 400 : 422;
      return NextResponse.json({ error: (err as Error).message }, { status });
    }
  };
}

/** 한백 전용 쓰기. deny 는 403 으로 나가는 문구다 — 무엇을 못 하는지 적는다. */
export const adminWrite = <P, B>(deny: string, handle: Handler<P, B>) =>
  wrap<P, B>(true, deny, handle);

/** 로그인한 누구나 하는 쓰기 (그 현장의 협력사 · 한백). 누가 무엇을 할 수 있는지는 저장소가 본다. */
export const sessionWrite = <P, B>(handle: Handler<P, B>) =>
  wrap<P, B>(false, '로그인이 필요합니다.', handle);
