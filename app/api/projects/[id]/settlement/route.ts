/**
 * POST /api/projects/[id]/settlement — 준공마감일 지정 · 기성 수금 기록 [한백 전용]
 *
 * 한 라우트에서 둘을 받는다: 준공마감일은 마지막 차수를 여는 조건이고, 수금은 그 차수의
 * 끝이다. 같은 화면(기성 탭)의 같은 줄에서 이어지는 일이라 길을 나누면 화면이 두 주소를
 * 들고 있어야 한다.
 *
 * ★수금액은 「받은 만큼」이다.★ 빈 값이면 계획액대로 받은 것으로 본다 — 협의로
 * 턴키단가와 다르게 받는 현장이 있어서 적을 자리를 둔다(migrations/0034).
 */
import { getRepository } from '@/lib/data';
import { adminWrite, BadRequest } from '@/lib/api/write-route';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const POST = adminWrite<
  { id: string },
  { closeDate?: unknown; collected?: unknown }
>(
  '한백 관리자만 기성을 기록할 수 있습니다.',
  async ({ body, params, actor }) => {
    const repo = getRepository();

    if ('closeDate' in (body ?? {})) {
      const raw = body?.closeDate;
      if (raw !== null && typeof raw !== 'string') throw new BadRequest('준공마감일이 올바르지 않습니다.');
      const date = raw === null || raw.trim() === '' ? null : raw.trim();
      if (date !== null && !DATE_RE.test(date)) {
        throw new BadRequest('준공마감일은 YYYY-MM-DD 형식이어야 합니다.');
      }
      await repo.setCpoCloseDate(params.id, date, actor);
      return;
    }

    const c = body?.collected;
    if (!c || typeof c !== 'object') throw new BadRequest('바꿀 값이 없습니다.');
    const { no, at, amount } = c as { no?: unknown; at?: unknown; amount?: unknown };
    if (no !== 1 && no !== 2 && no !== 3) throw new BadRequest('차수는 1·2·3 중 하나여야 합니다.');

    // at 이 비면 수금을 되돌린다 — 잘못 찍은 수금을 푸는 길이 있어야 한다(화면 규칙 7)
    if (at === null || at === '' || at === undefined) {
      await repo.setSettlementCollected(params.id, no, null, actor);
      return;
    }
    if (typeof at !== 'string' || !DATE_RE.test(at)) {
      throw new BadRequest('수금일은 YYYY-MM-DD 형식이어야 합니다.');
    }
    let money: number | null = null;
    if (amount !== null && amount !== undefined && amount !== '') {
      if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) {
        throw new BadRequest('수금액은 0 보다 큰 원 단위 정수여야 합니다.');
      }
      money = amount;
    }
    await repo.setSettlementCollected(params.id, no, { at, amount: money }, actor);
  }
);
