/**
 * POST /api/projects/[id]/docs-missing — 누락 서류 보완요청 · 그 취소
 *
 * 한백이 검토 중인 계약에서 「필수인데 안 낸 서류」를 한 번에 반려로 세워 계약보완으로
 * 내리는 자리다. 서류 한 장의 반려(PATCH documents/[kind])는 올라온 파일에만 걸리므로,
 * 안 낸 서류는 그 길로 되돌릴 수 없다(저장소가 미제출 검수를 거절한다).
 *
 * 무엇을 겨냥할지는 여기서 정하지 않는다 — 저장소가 필수·미제출을 다시 판정한다
 * (lib/data/assemble.ts missingRequiredDocs). 화면이 목록을 보내면 화면과 서버가 갈린다.
 */
import { getRepository } from '@/lib/data';
import { adminWrite, BadRequest } from '@/lib/api/write-route';

export const POST = adminWrite<{ id: string }, { ask?: unknown; reason?: unknown }>(
  '한백 관리자만 보완요청할 수 있습니다.',
  async ({ body, params, actor }) => {
    if (typeof body?.ask !== 'boolean') throw new BadRequest('ask 가 필요합니다.');
    if (body.reason != null && typeof body.reason !== 'string') {
      throw new BadRequest('reason 은 글자여야 합니다.');
    }
    // 「누락된 필수 서류가 없습니다」는 저장소가 던진다 → 422
    await getRepository().askMissingDocs(
      params.id,
      body.ask,
      (body.reason as string | undefined) ?? null,
      actor
    );
  }
);
