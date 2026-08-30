/**
 * /api/projects/[id]/notes — 진행현황
 *
 * 한백과 그 현장의 협력사 둘 다 부른다. 특이사항은 양쪽에서 나온다 —
 * 관리사무소가 공사를 미뤘다는 말은 협력사가 알고, 운영사 승인이 늦다는 말은 한백이 안다.
 *
 * 자기가 쓴 것은 고치고(PATCH) 지운다(DELETE) — 남의 글은 둘 다 못 한다.
 * 남의 글인지는 저장소가 판정한다(글에 적힌 소속과 대조) — 여기서 먼저 걸러도 되지만,
 * 두 곳에서 판정하면 규칙이 어긋날 자리가 하나 더 생긴다. 지운 글은 감사기록에 남는다.
 */
import { getRepository } from '@/lib/data';
import { BadRequest, sessionWrite } from '@/lib/api/write-route';

type Params = { id: string };

export const POST = sessionWrite<Params, { body?: string }>(
  async ({ body, params, actor }) => {
    if (!body?.body?.trim()) throw new BadRequest('내용을 입력해주세요.');
    await getRepository().addNote({ projectId: params.id, body: body.body }, actor);
  }
);

export const PATCH = sessionWrite<Params, { noteId?: string; body?: string }>(
  async ({ body, params, actor }) => {
    if (!body?.noteId || !body.body?.trim()) {
      throw new BadRequest('고칠 내용을 입력해주세요.');
    }
    await getRepository().editNote(
      { projectId: params.id, noteId: body.noteId, body: body.body },
      actor
    );
  }
);

export const DELETE = sessionWrite<Params, { noteId?: string }>(
  async ({ body, params, actor }) => {
    if (!body?.noteId) throw new BadRequest('어느 기록인지 알 수 없습니다.');
    await getRepository().deleteNote({ projectId: params.id, noteId: body.noteId }, actor);
  }
);
