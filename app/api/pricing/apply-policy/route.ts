/**
 * POST /api/pricing/apply-policy — 나이스인프라 26년 하반기 정책을 케이스로 반영한다. [한백 전용]
 *
 * ★왜 라우트인가 — 한 번 쓰고 걷어낼 자리다★
 * 케이스의 정본은 DB 이고, 정책 7행을 넣는 도구는 스크립트로 만들어 뒀다
 * (`scripts/apply-nice-h2-pricing.ts`). 그런데 프로덕션의 DATABASE_URL 은 Vercel 에서
 * Sensitive 로 표시돼 있어 내려받을 수도 볼 수도 없다 — 로컬에서 프로덕션 DB 에 붙을
 * 길이 없다. 붙으려면 Supabase 의 DB 비밀번호를 리셋해야 하고, 리셋하는 순간
 * 프로덕션이 DB 를 못 붙는다(Vercel 변수 갱신 + 재배포까지 다운).
 *
 * 그래서 접속 문자열이 이미 있는 곳 — 프로덕션 서버 안 — 에서 돌린다. 관리자가 화면에서
 * 한 번 누르면 그 요청이 이 라우트로 오고, 서버가 자기 환경변수로 자기 DB 에 넣는다.
 * 비밀이 아무 데도 안 나간다.
 *
 * 값 검사·중복 판정·id 채번·정산 규칙 재사용·감사 기록은 저장소가 한다 —
 * 화면에서 케이스를 손으로 넣은 것과 똑같은 길이다. 멱등해서 두 번 눌러도 안전하다.
 *
 * ★반영을 확인했으면 이 라우트와 화면의 단추를 걷어낸다.★ 한 번 쓰는 자리를 남겨두면
 * 다음 사람이 「이게 뭔데 아직 있나」를 묻고, 정책이 또 바뀌면 이 안의 낡은 표가 돈다.
 */
import { getRepository } from '@/lib/data';
import { adminWrite } from '@/lib/api/write-route';
import { applyNiceH2 } from '@/lib/pricing-policy-nice-h2';

type Params = Record<string, never>;

export const POST = adminWrite<Params, undefined>(
  '한백 관리자만 정책을 반영할 수 있습니다.',
  async ({ actor }) => {
    const report = await applyNiceH2(getRepository(), actor, { write: true });
    /*
     * 실패가 있으면 422 로 돌려보낸다 — 화면이 초록으로 끝나면 아무도 안 본다.
     * 성공한 것은 이미 들어갔고(멱등하니 다시 눌러도 안전하다), 무엇이 왜 막혔는지 적는다.
     */
    if (report.failed > 0) {
      const why = report.steps
        .filter((s) => s.action === '실패')
        .map((s) => `${s.rule.caseName} — ${s.message}`)
        .join(' / ');
      throw new Error(`${report.failed}건을 반영하지 못했습니다: ${why}`);
    }
    return { added: report.added, fixed: report.fixed, skipped: report.skipped };
  }
);
