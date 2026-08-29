/**
 * DELETE /api/projects/[id] — 현장 삭제 [한백 전용]
 *
 * 잘못 만든 현장(중복 접수·시험 입력)을 지운다 — 계약이 무산된 현장은 지우지 않고
 * 계약중단으로 세운다(/hold). 서류·공정·정산·메모가 함께 지워지고 감사기록만 남는다.
 * 화면은 삭제 전에 「삭제하시겠습니까」 확정을 거친다 — 여기는 그 확정 뒤의 실행이다.
 *
 * ★파일은 지우지 않는다★ (2026-08-29). 예전에는 여기서 그 현장의 Blob 파일을 전부
 * `del()` 했다. Vercel Blob 에는 버전도 휴지통도 시점 복구도 없고 삭제가 영구다 —
 * 문서가 스스로 「no native backup system」이라고 적는다. 현장 하나를 잘못 지르는 것으로
 * 계약서·보험증권·준공서류가 영영 사라지는 길을 열어 둘 이유가 없다. DB 는 덤프로
 * 되살아나므로, 파일이 남아 있으면 그 덤프가 곧 복구가 된다.
 *
 * 주인을 잃은 파일은 감사기록에 목록으로 남는다(저장소가 적는다) — 저장 요금이 아까워질
 * 만큼 쌓이면 그 목록을 보고 사람이 확인한 뒤 지운다.
 */
import { getRepository } from '@/lib/data';
import { adminWrite } from '@/lib/api/write-route';

export const DELETE = adminWrite<{ id: string }, undefined>(
  '한백 관리자만 삭제할 수 있습니다.',
  async ({ params, actor }) => {
    const { keptFiles } = await getRepository().deleteProject(params.id, actor);
    return { keptFiles };
  }
);
