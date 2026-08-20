/**
 * PATCH  /api/projects/[id]/documents/[kind] — 서류 검수 (반려 · 반려 해제)
 * DELETE /api/projects/[id]/documents/[kind] — 서류 삭제
 *
 * 한백만 호출한다. 미들웨어가 페이지 진입을 막지만 API 는 직접 호출될 수 있어
 * adminWrite 로 다시 확인하고, 저장소에서 assertAdmin 으로 한 번 더 본다.
 */
import { getRepository } from '@/lib/data';
import { adminWrite, BadRequest } from '@/lib/api/write-route';
import { dropBlob, pathnameOfBlobUrl } from '@/lib/intake-stage';

type Params = { id: string; kind: string };

/** uploaded = 반려 해제 (통과 상태로 되돌린다). 승인 단추는 없다 — 제출된 것이 기본 통과다. */
const ALLOWED = ['rejected', 'uploaded', 'approved'] as const;
type Allowed = (typeof ALLOWED)[number];

export const PATCH = adminWrite<Params, { status?: string; reason?: string | null }>(
  '한백 관리자만 검수할 수 있습니다.',
  async ({ body, params, actor }) => {
    if (!ALLOWED.includes(body?.status as Allowed)) {
      throw new BadRequest(`status 는 ${ALLOWED.join(' · ')} 중 하나여야 합니다.`);
    }
    // 「제출되지 않은 서류」·「반려 사유 없음」은 저장소가 던진다 → 422
    await getRepository().setDocumentStatus(
      {
        projectId: params.id,
        kind: params.kind,
        status: body.status as Allowed,
        reason: body.reason ?? null,
      },
      actor
    );
  }
);

export const DELETE = adminWrite<Params, undefined>(
  '한백 관리자만 서류를 지울 수 있습니다.',
  async ({ params, actor }) => {
    const { blobUrl } = await getRepository().deleteDocument(
      { projectId: params.id, kind: params.kind },
      actor
    );

    /*
     * 기록을 지운 뒤에 파일을 지운다. 순서를 바꾸면 기록이 실패했을 때 파일만 사라져
     * 「제출됨인데 열 수 없는 서류」가 된다.
     *
     * 우리 자리(projects/{현장}/)에 있는 것만 지운다 — 예전 방식으로 다른 곳을 가리키는
     * 주소가 있어도 그것까지 지울 판단은 여기서 하지 않는다.
     */
    if (blobUrl && (pathnameOfBlobUrl(blobUrl) ?? '').startsWith(`projects/${params.id}/`)) {
      await dropBlob(blobUrl);
    }
  }
);
