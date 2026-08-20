/**
 * POST /api/projects — 접수
 *
 * 로그인한 누구나 부른다. 자기 소속으로만 만들 수 있는지는 저장소가 본다.
 * 성공하면 만든 현장 번호를 돌려준다 — 화면이 그 번호로 서류를 이어 붙인다.
 */
import { getRepository } from '@/lib/data';
import { checkDraft } from '@/lib/intake-validate';
import type { IntakeDraft } from '@/types/project';
import { sessionWrite } from '@/lib/api/write-route';

export const POST = sessionWrite<Record<string, never>, IntakeDraft>(
  async ({ body, actor }) => {
    /*
     * 화면에서 이미 막지만 서버에서 한 번 더 본다 — 클라이언트 검증은 우회된다.
     * 첫 줄만 내보낸다. 예전에는 목록도 함께 실어 보냈는데 읽는 화면이 없었다.
     */
    const check = checkDraft(body);
    if (check.errors.length > 0) throw new Error(check.errors[0]);

    return { id: await getRepository().createProject(body, actor) };
  }
);
