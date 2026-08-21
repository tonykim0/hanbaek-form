/**
 * POST /api/projects/[id]/biz-year — 환경부 사업연도
 *
 * 접수 연도가 기본값으로 들어간다. 이월 현장(작년 사업이 올해 접수)만 한백이 고친다.
 */
import { getRepository } from '@/lib/data';
import { adminWrite, BadRequest } from '@/lib/api/write-route';

export const POST = adminWrite<{ id: string }, { value?: unknown }>(
  '한백 관리자만 입력할 수 있습니다.',
  async ({ body, params, actor }) => {
    const raw = body.value;
    if (raw !== null && typeof raw !== 'string') {
      throw new BadRequest('사업연도는 문자열이어야 합니다.');
    }
    // 빈 문자열은 「지운다」는 뜻이다 — 잘못 적은 연도를 되돌릴 길이 있어야 한다
    const text = raw === null || raw.trim() === '' ? null : raw.trim();
    if (text !== null && !/^20\d{2}$/.test(text)) {
      throw new BadRequest('사업연도는 연도 4자리입니다 — 「2026」 형태.');
    }
    await getRepository().setBizYear(params.id, text === null ? null : Number(text), actor);
  }
);
