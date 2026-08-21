/**
 * POST /api/projects/[id]/process — 공정 마일스톤 날짜·메모 [한백 · 그 현장의 시공사]
 *
 * 넘긴 필드만 바뀐다. 상태(status)는 여기서 받지 않는다 — 조건을 확인해야 하므로
 * /status 로만 움직인다. 날짜는 그 조건의 근거일 뿐이다.
 *
 * 누가 어느 칸을 적는지는 저장소가 본다(assertProcessWrite) — 시공사는 한백 전용
 * 두 칸(환경부 승인일·충전기 발주일)을 뺀 전부를 직접 적는다.
 */
import { getRepository } from '@/lib/data';
import type { ProcessPatch } from '@/lib/data/repository';

/** 고칠 수 있는 날짜 칸 */
const DATE_FIELDS = [
  'envApprovalDate', 'cpoSubmitDate', 'cpoApprovalDate', 'chargerOrderDate', 'chargerShipDate',
  'chargerRecvDate', 'startPlanDate', 'startActualDate', 'installDoneDate', 'commDoneDate',
] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
import { BadRequest, sessionWrite } from '@/lib/api/write-route';

export const POST = sessionWrite<{ id: string }, Record<string, unknown>>(
  async ({ body, params, actor }) => {
    const patch: ProcessPatch = {};
    for (const f of DATE_FIELDS) {
      if (!(f in body)) continue;
      const v = body[f];
      // 빈 칸으로 지우는 것은 허용한다 — 잘못 적은 날짜를 되돌릴 길이 있어야 한다
      if (v === null || v === '') {
        patch[f] = null;
        continue;
      }
      if (typeof v !== 'string' || !DATE_RE.test(v) || Number.isNaN(Date.parse(v))) {
        throw new BadRequest(`${f} 는 YYYY-MM-DD 형식이어야 합니다.`);
      }
      patch[f] = v;
    }
    if ('memo' in body) {
      const v = body.memo;
      if (v !== null && typeof v !== 'string') throw new BadRequest('memo 는 문자열이어야 합니다.');
      patch.memo = v === '' ? null : (v as string | null);
    }
    // 설치 실적 — 몇 거점 · 몇 기. 빈 칸으로 지우는 것은 허용한다.
    for (const f of ['installedSpots', 'installedUnits'] as const) {
      if (!(f in body)) continue;
      const v = body[f];
      if (v === null || v === '') {
        patch[f] = null;
        continue;
      }
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 9999) {
        throw new BadRequest('설치 실적은 0 이상의 정수여야 합니다.');
      }
      patch[f] = v;
    }
    if (Object.keys(patch).length === 0) throw new BadRequest('바꿀 값이 없습니다.');

    await getRepository().updateProcess(params.id, patch, actor);
  }
);
