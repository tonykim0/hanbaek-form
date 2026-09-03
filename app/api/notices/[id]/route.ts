/**
 * PATCH  /api/notices/[id] — 공지 수정 [한백 전용] (작성 시각은 그대로 — 배지가 다시 안 켜진다)
 * DELETE /api/notices/[id] — 공지 삭제 [한백 전용]
 */
import { getRepository } from '@/lib/data';
import { adminWrite, BadRequest } from '@/lib/api/write-route';

export const PATCH = adminWrite<
  { id: string },
  { title?: unknown; body?: unknown }
>('한백 관리자만 공지를 고칠 수 있습니다.', async ({ body, params, actor }) => {
  if (typeof body?.title !== 'string' || !body.title.trim()) throw new BadRequest('제목을 적어주세요.');
  if (typeof body?.body !== 'string' || !body.body.trim()) throw new BadRequest('내용을 적어주세요.');
  await getRepository().saveNotice({ id: params.id, title: body.title, body: body.body }, actor);
});

export const DELETE = adminWrite<{ id: string }, undefined>(
  '한백 관리자만 공지를 지울 수 있습니다.',
  async ({ params, actor }) => {
    await getRepository().deleteNotice(params.id, actor);
  }
);
