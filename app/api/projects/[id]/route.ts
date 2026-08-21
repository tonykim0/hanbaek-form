/**
 * DELETE /api/projects/[id] — 현장 삭제 [한백 전용]
 *
 * 잘못 만든 현장(중복 접수·시험 입력)을 지운다 — 계약이 무산된 현장은 지우지 않고
 * 계약중단으로 세운다(/hold). 서류·공정·정산·메모가 함께 지워지고 감사기록만 남는다.
 * 화면은 삭제 전에 「삭제하시겠습니까」 확정을 거친다 — 여기는 그 확정 뒤의 실행이다.
 */
import { del } from '@vercel/blob';
import { getRepository } from '@/lib/data';
import { adminWrite } from '@/lib/api/write-route';

export const DELETE = adminWrite<{ id: string }, undefined>(
  '한백 관리자만 삭제할 수 있습니다.',
  async ({ params, actor }) => {
    const { blobUrls } = await getRepository().deleteProject(params.id, actor);
    // 파일은 최선으로 지운다 — DB 가 정본이라 Blob 삭제 실패로 막지 않는다
    await Promise.all(blobUrls.map((url) => del(url).catch(() => undefined)));
  }
);
