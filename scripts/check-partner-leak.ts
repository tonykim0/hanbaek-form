/**
 * 협력사 응답에 한백 전용 값이 새는지 본다.
 *
 *   npm run check:leak
 *
 * ★왜 스크립트인가★
 * 「화면에서 가리는 것으로는 부족하다」는 규칙은 사람이 지키는 문장이라 언젠가 어긴다.
 * 실제로 `settlementRule` 이 통째로 새고 있었다 — 규칙 이름이 「환경부 승인 300,000원 →
 * 착공 800,000원 → …」이고 steps.basis.unit 에 전액이 있었다(2026-08-22 발견).
 * 값을 null 로 지우는 방식이 새 필드를 놓친 것이다.
 *
 * 그래서 규칙을 실행 가능한 검사로 바꾼다 — 협력사 세션으로 상세를 받아 직렬화하고,
 * 금지된 키가 문자열로 존재하면 실패한다. 새 필드를 admin 묶음 밖에 두면 여기서 걸린다.
 */
import { loadEnvFile } from '../lib/env-file';

loadEnvFile();

import { getRepository } from '../lib/data';
import type { Viewer } from '../lib/auth/types';

/** 협력사 응답에 있어서는 안 되는 키 — 있으면 값이 null 이어도 실패로 본다 */
const FORBIDDEN = [
  'admin',            // 한백 전용 묶음 자체
  'settlementRule',   // 이름·단계에 기성 금액이 그대로 있다
  'steps',            // 기성 차수 (트리거·산정방식·수금 상태)
  'planAmount',
  'basisLabel',
  'safetyFee',        // 안전관리비 — 원가
  'cpoCloseDate',     // 운영사 준공마감 통보
] as const;

/** 협력사가 자기 일을 하려면 반드시 있어야 하는 것 — 지우다 같이 지우면 화면이 빈다 */
const REQUIRED = ['payNote', 'documents', 'lines', 'process', 'contract'] as const;

async function main() {
  const repo = getRepository();
  const admin: Viewer = { role: 'admin', org: null };
  const all = await repo.listProjects(admin);
  const targets = all.filter((p) => p.salesOrg || p.gcOrg);
  if (targets.length === 0) throw new Error('협력사가 붙은 현장이 없어 검사할 수 없습니다.');

  const problems: string[] = [];
  let checked = 0;

  for (const p of targets) {
    // 영업사·시공사 양쪽 시점으로 본다 — 한쪽만 맡은 회사가 남의 몫을 보면 그것도 누수다
    for (const [role, org] of [
      ['sales', p.salesOrg],
      ['cons', p.gcOrg],
    ] as const) {
      if (!org) continue;
      const detail = await repo.getProject(p.id, { role, org });
      if (!detail) continue;
      checked++;
      const json = JSON.stringify(detail);

      for (const key of FORBIDDEN) {
        if (json.includes(`"${key}"`)) {
          problems.push(`${p.id} (${role} ${org}): 금지된 키 "${key}" 가 응답에 있습니다`);
        }
      }
      for (const key of REQUIRED) {
        if (!json.includes(`"${key}"`)) {
          problems.push(`${p.id} (${role} ${org}): 필요한 키 "${key}" 가 없습니다`);
        }
      }
      /*
       * 단가 케이스의 금액 칸 — 키는 있어도 값이 null 이어야 한다.
       *
       * 키 이름만 보는 위 검사로는 이것을 못 잡는다. 케이스는 조건(지급자재·충전요금·
       * 설치조건·기타지원)과 금액을 한 객체에 담고 있어서, 조건은 협력사도 봐야 하고
       * 금액은 안 된다 — 키를 지우는 방식이 아니라 값을 null 로 바꾸는 방식이라 그렇다.
       * 그러면 새 금액 칸을 더한 사람이 assemble 에서 가리는 것을 잊어도 아무도 모른다.
       * 그 자리를 여기서 값으로 확인한다.
       *
       * margin 은 원가를 보는 사람만(vis.cost) 본다. salesUnit·consUnit 은
       * 자기 쪽만 보므로 role 에 따라 갈린다 — 영업사는 시공비가, 시공사는 영업비가 null 이다.
       */
      for (const l of detail.lines) {
        if (!l.rule) continue;
        const hidden: [string, unknown][] = [
          ['margin', l.rule.margin],
          [role === 'sales' ? 'consUnit' : 'salesUnit', role === 'sales' ? l.rule.consUnit : l.rule.salesUnit],
          /*
           * ★부담 주체 둘도 여기서 본다★ (감사 2026-09-04 H5).
           *
           * 금액이 아니라 글자라 위 금지 키 목록에 넣고 싶어지는데, 그러면 안 된다 —
           * 그 검사는 ★키가 있으면★ 실패라서 값을 null 로 가려도 걸린다(케이스는 조건과
           * 원가를 한 객체에 담으므로 키를 지우는 방식이 아니다). 금액과 같은 자리다.
           *
           * 접두사 검사에 기대지 말 것: 목록에 'safetyFee' 가 있는데도 safetyFeeBearer 는
           * 통과했다 — `"safetyFee"` 로 닫는 따옴표까지 견주기 때문이다. 그렇게 새 나간
           * 것이 협력사가 볼 수 있는 계약 라인 148개였다(프로덕션 실측).
           */
          ['supervisionBearer', l.rule.supervisionBearer],
          ['safetyFeeBearer', l.rule.safetyFeeBearer],
        ];
        for (const [key, v] of hidden) {
          if (v !== null) {
            problems.push(`${p.id} (${role} ${org}): 라인 ${l.id} 의 ${key} 가 안 가려졌습니다 (${String(v)})`);
          }
        }
      }

      // 남의 쪽 원장이 섞이지 않았는가
      const wrongSide = detail.payoutEntries.filter((e) =>
        role === 'sales' ? e.kind !== '영업비' : e.kind !== '시공비'
      );
      if (wrongSide.length > 0) {
        problems.push(`${p.id} (${role} ${org}): 남의 쪽 원장 ${wrongSide.length}건이 실려 있습니다`);
      }
    }
  }

  /*
   * 정산 현황(/finance)이 쓰는 두 조회도 같이 본다 (2026-08-27).
   *
   * 그 화면은 현장 상세가 아니라 목록 조회로 금액을 모은다 — 위 검사(getProject)로는
   * 안 걸리는 길이다. 기성·마진은 저장소가 아예 주지 않아야 한다(화면에서 가리지 않는다).
   */
  const partners = [...new Set(targets.flatMap((p) => [p.salesOrg, p.gcOrg]))].filter(
    (org): org is string => Boolean(org)
  );
  for (const org of partners.slice(0, 3)) {
    for (const role of ['sales', 'cons'] as const) {
      const viewer: Viewer = { role, org };
      checked++;

      const settlements = await repo.listSettlements(viewer);
      if (settlements.length > 0) {
        problems.push(`${role} ${org}: listSettlements 가 ${settlements.length}건을 돌려줍니다 (기성은 한백만)`);
      }

      const overview = await repo.listPayoutOverview(viewer);
      const json = JSON.stringify(overview);
      for (const key of ['planTotal', 'collectedTotal', 'marginTotal', 'settlementRule', 'safetyFee']) {
        if (json.includes(`"${key}"`)) {
          problems.push(`${role} ${org}: listPayoutOverview 에 금지된 키 "${key}" 가 있습니다`);
        }
      }
      // 남의 쪽 구분이 섞이면 자기 것이 아닌 금액을 세게 된다
      const mine = role === 'sales' ? '영업비' : '시공비';
      const wrong = [
        ...overview.plans.filter((row) => row.kind !== mine),
        ...overview.history.filter((row) => row.kind !== mine),
      ];
      if (wrong.length > 0) {
        problems.push(`${role} ${org}: 남의 쪽 지급 ${wrong.length}건이 실려 있습니다`);
      }
    }
  }

  console.log(`협력사 시점 ${checked}가지를 검사했습니다.`);
  if (problems.length > 0) {
    console.error(`\n실패 ${problems.length}건:`);
    for (const line of problems) console.error(`  - ${line}`);
    process.exit(1);
  }
  console.log('누수 없음 — 통과');
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error((err as Error).message);
  process.exit(1);
});
