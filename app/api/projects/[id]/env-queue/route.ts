/**
 * POST /api/projects/[id]/env-queue — 환경부 보조금 신청 대기번호
 *
 * 접수 뒤에 나오는 값이라 협력사 접수 폼에는 없다. 운영사가 환경부에 접수하고 그 번호를
 * 우리에게 알려주므로 한백이 콘솔에서 채운다.
 *
 * 자체투자 현장은 받을 번호가 없다 — 그 판정은 저장소가 한다(422).
 */
import { getRepository } from '@/lib/data';
import { adminWrite, BadRequest } from '@/lib/api/write-route';

export const POST = adminWrite<{ id: string }, { value?: unknown }>(
  '한백 관리자만 입력할 수 있습니다.',
  async ({ body, params, actor }) => {
    const raw = body.value;
    if (raw !== null && typeof raw !== 'string') {
      throw new BadRequest('대기번호는 문자열이어야 합니다.');
    }
    // 빈 문자열은 「지운다」는 뜻이다 — 잘못 적은 번호를 되돌릴 길이 있어야 한다
    const value = raw === null || raw.trim() === '' ? null : raw.trim();
    // 대기번호는 숫자 최대 5자리다. 연도가 붙어 오는 형태(2026-595)는 그대로 받는다.
    if (value !== null && !/^(\d{4}-)?\d{1,5}$/.test(value)) {
      throw new BadRequest('대기번호는 숫자 최대 5자리입니다 — 「595」 또는 「2026-595」 형태.');
    }
    await getRepository().setEnvQueueNo(params.id, value, actor);
  }
);
