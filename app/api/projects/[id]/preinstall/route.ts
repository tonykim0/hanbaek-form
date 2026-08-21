/**
 * PATCH /api/projects/[id]/preinstall — 기설치 조사 [그 현장의 협력사 · 한백]
 *
 * 환경부 사업은 현장마다 기설치 충전기를 조사해야 한다. 조사는 현장에 가는 쪽(협력사)이
 * 하고 한백이 확인하므로 양쪽이 쓴다 — 권한 판정은 저장소가 한다(canAccessProject).
 *
 * 서류(기설치 이력·증빙)는 이 라우트가 아니라 서류 올리기 경로로 간다.
 * 여기서 다루는 것은 「조사해서 알아낸 것」이다.
 */
import { getRepository } from '@/lib/data';
import type { PreInstall } from '@/types/project';

const STATES: PreInstall[] = ['없음', '있음'];
import { sessionWrite, BadRequest } from '@/lib/api/write-route';

type Body = {
  preInstall?: string;
  preNote?: string | null;
  preChecked?: boolean;
  /** 조사 반려 사유 [한백 전용 — 저장소가 판정]. null 은 반려 해제. */
  preRejectReason?: string | null;
};

export const PATCH = sessionWrite<{ id: string }, Body>(async ({ body, params, actor }) => {
  if (body.preInstall !== undefined && !STATES.includes(body.preInstall as PreInstall)) {
    throw new BadRequest(`기설치는 ${STATES.join(' · ')} 중 하나여야 합니다.`);
  }
  if (
    body.preRejectReason !== undefined
    && body.preRejectReason !== null
    && (typeof body.preRejectReason !== 'string' || !body.preRejectReason.trim())
  ) {
    throw new BadRequest('반려 사유를 입력해주세요.');
  }
  await getRepository().setPreInstall(
    params.id,
    {
      preInstall: body.preInstall as PreInstall | undefined,
      ...('preNote' in body ? { preNote: body.preNote ?? null } : {}),
      ...(body.preChecked !== undefined ? { preChecked: body.preChecked } : {}),
      ...('preRejectReason' in body ? { preRejectReason: body.preRejectReason ?? null } : {}),
    },
    actor
  );
});
