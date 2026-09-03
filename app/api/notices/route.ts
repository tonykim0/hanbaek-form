/**
 * POST /api/notices — 공지 등록 [한백 전용]
 *
 * 목록은 라우트가 없다 — 공지 화면(서버 컴포넌트)이 저장소를 바로 읽는다.
 */
import { getRepository } from '@/lib/data';
import { adminWrite, BadRequest } from '@/lib/api/write-route';

export const POST = adminWrite<
  Record<string, never>,
  { title?: unknown; body?: unknown }
>('한백 관리자만 공지를 쓸 수 있습니다.', async ({ body, actor }) => {
  if (typeof body?.title !== 'string' || !body.title.trim()) throw new BadRequest('제목을 적어주세요.');
  if (typeof body?.body !== 'string' || !body.body.trim()) throw new BadRequest('내용을 적어주세요.');
  const id = await getRepository().saveNotice({ title: body.title, body: body.body }, actor);
  return { id };
});
