/**
 * POST   /api/projects/[id]/payouts — 지급 원장에 추가 [한백 전용]
 * DELETE /api/projects/[id]/payouts — 원장에서 한 건 삭제 [한백 전용]
 *
 * 본문이 배열이면 ★한 사실로 여러 줄★을 넣는다 — 전부 들어가거나 하나도 안 들어간다
 * (추가공사비: 영업비에서 빼고 시공비에 더하는 두 줄).
 *
 * 고치는 길(PATCH)은 없다 — 금액·날짜를 반쯤 고친 흔적보다, 지우고 다시 넣는 것이
 * 감사 로그에 온전히 남는다. 지운 값은 저장소가 로그에 적는다.
 *
 * 값 검사는 저장소가 한다(checkPayoutEntry) — 화면과 여기가 같은 규칙을 봐야 한다.
 */
import { getRepository } from '@/lib/data';
import { adminWrite, BadRequest } from '@/lib/api/write-route';
import type { NewPayoutEntry } from '@/types/project';

export const POST = adminWrite<{ id: string }, NewPayoutEntry | NewPayoutEntry[]>(
  '한백 관리자만 지급을 기록할 수 있습니다.',
  async ({ body, params, actor }) => {
    if (!body) throw new BadRequest('넣을 값이 없습니다.');
    const list = Array.isArray(body) ? body : [body];
    if (list.length === 0) throw new BadRequest('넣을 값이 없습니다.');
    const ids = await getRepository().addPayoutEntries(params.id, list, actor);
    return { ids, id: ids[0] };
  }
);

export const DELETE = adminWrite<{ id: string }, { entryId?: unknown }>(
  '한백 관리자만 지급 기록을 지울 수 있습니다.',
  async ({ body, params, actor }) => {
    if (!body?.entryId || typeof body.entryId !== 'string') {
      throw new BadRequest('어느 기록인지 알 수 없습니다.');
    }
    await getRepository().deletePayoutEntry(params.id, body.entryId, actor);
  }
);
