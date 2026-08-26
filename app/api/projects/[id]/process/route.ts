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

/** 고칠 수 있는 날짜 칸 — 완료 체크(*DoneAt·*ConfirmedAt·*SubmitAt)도 체크한 날짜로 저장된다 */
const DATE_FIELDS = [
  'envApprovalDate', 'cpoSubmitDate', 'cpoApprovalDate', 'chargerOrderDate', 'chargerShipDate',
  'chargerRecvDate', 'startPlanDate', 'startActualDate', 'installDoneDate', 'commDoneDate',
  /*
   * ★openDate 가 빠져 있었다 (2026-08-26 발견).★ 화면·타입·저장소에는 다 있는데 이
   * 목록에만 없어서 개통완료일이 저장되지 않았고(400 「바꿀 값이 없습니다」), 그래서
   * 「개통 완료」 체크가 영원히 안 열렸다 — 개통완료 단계에 못 가고 영업비·시공비
   * 2차 지급 트리거(개통완료)도 같이 막혀 있었다. 이름이 openDoneAt 과 비슷해 눈에 안 띈다.
   */
  'openDate',
  'notifyDate',
  'notifyDoneAt', 'notifySkippedAt', 'chargerDoneAt', 'installConfirmedAt', 'openDoneAt',
  'completionSubmitAt',
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
    // 수량 칸 — 설치 실적(거점·기)과 수령 수량(충전기·모뎀). 빈 칸으로 지우는 것은 허용한다.
    for (const f of [
      'installedSpots', 'installedUnits', 'chargerQty', 'modemQty',
      'chargerOrderQty', 'modemOrderQty',
    ] as const) {
      if (!(f in body)) continue;
      const v = body[f];
      if (v === null || v === '') {
        patch[f] = null;
        continue;
      }
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 9999) {
        throw new BadRequest('수량은 0 이상의 정수여야 합니다.');
      }
      patch[f] = v;
    }
    /* 충전기 모델 — 목록(charger_models)의 id. 빈 값은 미지정으로 되돌리는 것이다 */
    if ('chargerModelId' in body) {
      const v = body.chargerModelId;
      if (v === null || v === '') patch.chargerModelId = null;
      else if (typeof v !== 'string') throw new BadRequest('충전기 모델이 올바르지 않습니다.');
      else {
        /*
         * 없는 id 는 여기서 막는다 — 그냥 넘기면 FK 위반이 나고 그 Postgres 원문이
         * 화면에 그대로 뜬다(「violates foreign key constraint …」). 사용자에게 나갈 말이 아니다.
         */
        const models = await getRepository().listChargerModels();
        if (!models.some((m) => m.id === v)) throw new BadRequest('등록된 충전기 모델이 아닙니다.');
        patch.chargerModelId = v;
      }
    }

    /*
     * 행위신고는 「완료」와 「불필요」 둘 중 하나다 (migrations/0024 가 그렇게 갈랐다).
     * 화면은 막지만 서버가 안 막아서 둘 다 켜진 현장이 만들어질 수 있었다 — 그러면
     * 「신고한 현장」을 셀 때 섞인다(2026-08-26 발견). 하나를 켜면 다른 하나를 끈다.
     */
    if (patch.notifyDoneAt) patch.notifySkippedAt = null;
    else if (patch.notifySkippedAt) patch.notifyDoneAt = null;
    if (Object.keys(patch).length === 0) throw new BadRequest('바꿀 값이 없습니다.');

    await getRepository().updateProcess(params.id, patch, actor);
  }
);
