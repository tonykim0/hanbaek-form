/**
 * PATCH /api/projects/[id]/payment — 지급일·비고 저장
 *
 * 넘긴 필드만 바뀐다. 화면이 일부만 보내도 나머지가 지워지지 않게 한다.
 */
import { getRepository } from '@/lib/data';
import type { PaymentPatch } from '@/lib/data/repository';
import { adminWrite, BadRequest } from '@/lib/api/write-route';

const DATE_FIELDS = ['salesPay1Date', 'salesPay2Date', 'consPay1Date', 'consPay2Date'] as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const PATCH = adminWrite<{ id: string }, Record<string, unknown>>(
  '한백 관리자만 저장할 수 있습니다.',
  async ({ body, params, actor }) => {
    const patch: PaymentPatch = {};
    for (const f of DATE_FIELDS) {
      if (!(f in body)) continue;
      const v = body[f];
      if (v === null || v === '') {
        patch[f] = null;
        continue;
      }
      if (typeof v !== 'string' || !DATE_RE.test(v)) {
        throw new BadRequest(`${f} 는 YYYY-MM-DD 형식이어야 합니다.`);
      }
      patch[f] = v;
    }
    if ('payNote' in body) {
      const v = body.payNote;
      if (v !== null && typeof v !== 'string') throw new BadRequest('비고는 문자열이어야 합니다.');
      patch.payNote = typeof v === 'string' && v.trim() ? v.trim() : null;
    }
    await getRepository().setPayment(params.id, patch, actor);
  }
);
