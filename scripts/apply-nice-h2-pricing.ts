/**
 * 나이스인프라 26년 하반기 정책 반영 — 2026-08-05 배포본 (2026-08-01 접수건부터 적용).
 *
 *   npx tsx scripts/apply-nice-h2-pricing.ts            무엇이 들어갈지만 보여준다
 *   npx tsx scripts/apply-nice-h2-pricing.ts --write    실제로 넣는다
 *   DATABASE_URL=<프로덕션> npx tsx scripts/apply-nice-h2-pricing.ts --write
 *
 * 멱등하다 — 같은 칸(교체유형 × 수전 × 연수 × 유형 × 채널)을 같은 적용 시작으로 덮는
 * 활성 케이스가 이미 있으면 지나간다. 두 번 돌려도 같은 결과다.
 *
 * ★왜 스크립트인가★
 * 케이스의 정본은 DB 이고 화면(/pricing)에서 손으로 넣는 것이 정규 경로다. 그런데 이번
 * 개정은 7행이고 행마다 기성 금액이 다르다 — 손으로 넣으면 어느 한 행의 선금이 틀리고,
 * 케이스는 참조되면 불변이라 그 뒤에는 개정 말고 고칠 길이 없다. 그래서 표를 코드에 적어
 * 한 번에 넣고, 이 파일이 「무슨 근거로 그 숫자인가」의 기록이 된다.
 * 저장소 메서드를 쓰므로 검증(checkPricingRule)·중복 판정(duplicateOf)·id 채번·
 * 정산 규칙 재사용·감사 기록이 화면으로 넣은 것과 똑같이 돈다.
 *
 * ── 정책 표를 케이스로 옮긴 근거 ──────────────────────────────────────────
 * 원문은 「수수료(분리)」(보조사업)와 「수수료(턴키)」(투자사업) 두 표다. 단위는 천원이고
 * 열은 영업(모집대행사)·공사로 나뉘어 있다. 우리가 받는 단가는 그 둘의 합이다 —
 * 표의 「10년」 행(100)은 단독 금액이 아니라 10년 계약에 붙는 가산이다.
 *
 *   보조사업(환경부 신규)   영업 200 + 공사 2,400            = 2,600  (7년 모자분리)
 *                          영업 200 + 공사 2,400 + 100      = 2,700  (10년 모자분리)
 *                          영업 200 + 공사 2,200            = 2,400  (10년 한전불입)
 *   투자사업(자체투자)      공사 2,000                        = 2,000  (7년, 영업수수료 없음)
 *                          공사 2,000 + 100                  = 2,100  (10년)
 *
 * 영업 200 은 한전불입 행까지 걸린다(원문에서 그 셀이 네 행을 병합하고 있다).
 * 투자사업 표의 영업 열은 비어 있어 총액이 공사 수수료뿐이다.
 *
 * ★그레이드(영업 1,000 · 공사 100)는 단가에 넣지 않았다.★ 기준 초과 시 소급 지급되는
 * 연간 인센티브라 대당 단가가 아니다 — 단가에 섞으면 못 받을 수도 있는 돈이 확정 단가로
 * 잡힌다. 보조사업 「모자분리 교체」(공사 1,800)도 넣지 않았다 — 교체는 자체투자로만
 * 하기로 했다(2026-08-22 결정).
 *
 * ★영업비·시공비는 기존 값을 그대로 뒀다.★ 협력사에게 나가는 단가(영업비 110만 ·
 * 시공비 90만)는 정책이 정하는 값이 아니라 우리가 정하는 값이고, 분해는 따로 하기로
 * 했다(2026-08-22). 그래서 정책 인상분은 전부 마진에 있다 — 자체투자 7년은 총액이
 * 200만이라 마진이 0 이다. 분해가 정해지면 이 케이스들은 아직 참조가 없는 동안
 * 화면에서 「수정」으로 고칠 수 있다(참조가 붙으면 개정만 가능하다).
 *
 * ★기성은 고정 + 잔액이다.★ 정책의 선금은 「공사 수수료 기준 50%」인데 저장 구조의
 * 비율은 턴키 × 비율이라(lib/settlement.ts) 그 50% 를 비율로 적으면 금액이 달라진다
 * (7년: 턴키 260만의 50% = 130만 ≠ 공사 240만의 50% = 120만). 그래서 선금은 계산해서
 * 고정으로 박고 잔금을 잔액으로 둔다 — 나이스의 기존 모양(착공 → 준공마감)과 같다.
 * 잔금 트리거 「운영 개시」는 목록에 없어 준공마감으로 뒀다(트리거는 4가지뿐이고,
 * 준공마감은 운영사가 정하는 자리라 운영 개시와 같은 칸이다).
 *
 * ★7월 1일 케이스는 건드리지 않는다.★ 정책이 「8월 1일 접수건부터」라고 못 박았으므로
 * 7월 접수건은 옛 단가가 맞다. 시기가 다른 케이스가 나란히 활성인 것이 이 매트릭스의
 * 개정 방식이고(케이스 이름에 적용 시작이 들어가 화면에서 구분된다), 8월 이후 접수에
 * 옛 케이스를 못 고르게 막고 싶으면 화면에서 중지한다.
 */
import { loadEnvFile } from '../lib/env-file';

loadEnvFile();

import { pgRepository } from '../lib/data/pg-store';
import { checkPricingRule, duplicateOf } from '../lib/pricing-match';
import { stepUnits } from '../lib/settlement';
import type { Actor } from '../lib/auth/types';
import type { NewPricingRule, PowerType, ReplType, SettlementStepRule } from '../types/project';

const WRITE = process.argv.includes('--write');

const ACTOR: Actor = { id: 'script', name: '나이스 하반기 정책 반영', role: 'admin', org: null };

/** 정책이 정하는 값이 아니라 우리가 정하는 값 — 이번 개정에서 안 건드린다 */
const PAYOUT_SALES = 1_100_000; // 영업사 지급 단가
const PAYOUT_CONS = 900_000; // 시공사 지급 단가

const START_DATE = '2026년 8월 1일';
const BIZ_YEAR = 2026;

/** 정책 표 한 줄 — 금액은 원문 그대로 천원 단위로 적는다(옮기며 계산하지 않는다) */
interface PolicyRow {
  replType: ReplType;
  powerType: Extract<PowerType, '모자분리' | '한전불입'>;
  term: number;
  /** 영업(모집대행사) 수수료, 천원 */
  feeSales: number;
  /** 공사 수수료, 천원 — 10년 가산(100)을 더한 값 */
  feeCons: number;
  /** 케이스 비고에 덧붙일 정책 조건 */
  extra: string;
}

const ROWS: PolicyRow[] = [
  // 보조사업 — 수수료(분리) 표. 교체는 논외(자체투자로만 한다)
  {
    replType: '환경부 신규', powerType: '모자분리', term: 7,
    feeSales: 200, feeCons: 2400,
    extra: '프로모션 6개월/149원. 충전단가 295원, 설치비율 5%',
  },
  {
    replType: '환경부 신규', powerType: '모자분리', term: 10,
    feeSales: 200, feeCons: 2400 + 100,
    extra: '프로모션 +6개월/220원. 충전단가 295원, 설치비율 5%',
  },
  {
    replType: '환경부 신규', powerType: '한전불입', term: 10,
    feeSales: 200, feeCons: 2200,
    extra: '한전불입금 지원은 10년 계약·10기 이내. 파트너사 신청 후 당사 납부',
  },
  // 투자사업 — 수수료(턴키) 표. 영업 열이 비어 총액이 공사뿐이다. 한전수전은 불가
  {
    replType: '자체투자 (제자리교체)', powerType: '모자분리', term: 7,
    feeSales: 0, feeCons: 2000,
    extra: '한전수전 지원 불가(수전장소는 보조사업으로만). 교체공사는 케이블·배관 신설, 차단기·튜브 교체, 도색 재시공 필수',
  },
  {
    replType: '자체투자 (제자리교체)', powerType: '모자분리', term: 10,
    feeSales: 0, feeCons: 2000 + 100,
    extra: '한전수전 지원 불가(수전장소는 보조사업으로만). 교체공사는 케이블·배관 신설, 차단기·튜브 교체, 도색 재시공 필수',
  },
  {
    replType: '자체투자 (신규위치)', powerType: '모자분리', term: 7,
    feeSales: 0, feeCons: 2000,
    extra: '한전수전 지원 불가(수전장소는 보조사업으로만). 사전 입주민 의향조사 필요',
  },
  {
    replType: '자체투자 (신규위치)', powerType: '모자분리', term: 10,
    feeSales: 0, feeCons: 2000 + 100,
    extra: '한전수전 지원 불가(수전장소는 보조사업으로만). 사전 입주민 의향조사 필요',
  },
];

const won = (n: number) => n.toLocaleString('ko-KR');

function ruleOf(row: PolicyRow): NewPricingRule {
  const receive = (row.feeSales + row.feeCons) * 1000;
  const margin = receive - PAYOUT_SALES - PAYOUT_CONS;
  // 선금은 공사 수수료의 50% — 턴키 비율이 아니라 정책 표의 공사 금액에서 나온다
  const prepay = (row.feeCons * 1000) / 2;
  const steps: SettlementStepRule[] = [
    { trigger: '착공', basis: { kind: '고정', unit: prepay } },
    { trigger: '준공마감', basis: { kind: '잔액' } },
  ];

  const bizType = row.replType === '환경부 신규' ? '환경부' : '자체투자';
  // 화면(PricingMatrix)이 만드는 라벨과 같은 꼴로 — 같은 케이스가 두 얼굴로 뜨지 않게
  const caseName =
    `나이스인프라 (${START_DATE}) | 공동주택 | ${row.term}년 ${row.replType} | ${row.powerType}`;
  const feeText = row.feeSales > 0
    ? `영업수수료 ${won(row.feeSales)}천원 + 공사수수료 ${won(row.feeCons)}천원`
    : `공사수수료 ${won(row.feeCons)}천원(영업수수료 없음)`;

  return {
    caseName,
    cpo: '나이스인프라',
    bizType,
    powerType: row.powerType,
    termYears: [row.term],
    bldgTypes: ['공동주택'],
    replType: row.replType,
    channel: '턴키',
    bizYear: BIZ_YEAR,
    startDate: START_DATE,
    salesUnit: PAYOUT_SALES,
    consUnit: PAYOUT_CONS,
    margin,
    supervisionBearer: '운영사',
    // 정책: 전기안전점검 수수료 지원 — 파트너사 선납 후 정산 시 지급
    safetyFeeBearer: '한백 대납(회수)',
    note:
      `26년 하반기 정책(2026-08-05 배포, 8/1 접수건~) — ${feeText}. ` +
      `선금은 공사수수료의 50%. 영업비·시공비는 기존 단가 유지, 인상분은 마진(분해 미확정). ${row.extra}`,
    settlementSteps: steps,
  };
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL 이 없습니다 — .env.local 을 확인하세요.');

  const existing = await pgRepository.listPricingRules(ACTOR);
  console.log(`DB 의 나이스인프라 케이스 ${existing.filter((r) => r.cpo === '나이스인프라').length}건 (전체 ${existing.length}건)\n`);

  const rules = ROWS.map(ruleOf);
  let added = 0;
  let skipped = 0;

  for (const rule of rules) {
    const receive = rule.salesUnit + rule.consUnit + rule.margin;
    const amounts = stepUnits(rule.settlementSteps, receive);
    console.log(rule.caseName);
    console.log(
      `  받는 단가 ${won(receive)}  =  영업비 ${won(rule.salesUnit)} + 시공비 ${won(rule.consUnit)} + 마진 ${won(rule.margin)}`
    );
    console.log(`  기성  착공 ${won(amounts[0])} → 준공마감 잔액 ${won(amounts[1])}`);

    const bad = checkPricingRule(rule);
    if (bad.length > 0) {
      console.log(`  ✗ 검증 실패: ${bad.join(' / ')}\n`);
      skipped += 1;
      continue;
    }
    const dup = duplicateOf(rule, existing);
    if (dup) {
      console.log(`  · 이미 있음 — ${dup.caseName} (${dup.id}). 지나갑니다.\n`);
      skipped += 1;
      continue;
    }
    if (!WRITE) {
      console.log('  → 넣을 수 있습니다 (--write 를 붙이면 실제로 넣습니다)\n');
      continue;
    }
    const id = await pgRepository.addPricingRule(rule, ACTOR);
    console.log(`  ✓ 추가 ${id}\n`);
    added += 1;
    // 뒤 행의 중복 판정이 방금 넣은 것을 보게 한다
    existing.push({ ...rule, id, active: true, defaultSettlementRuleId: '' });
  }

  if (!WRITE) {
    console.log(`— 미리보기 —  넣을 것 ${rules.length - skipped}건 · 지나갈 것 ${skipped}건`);
    console.log('실제로 넣으려면 --write 를 붙이세요.');
    return;
  }
  console.log(`— 완료 —  추가 ${added}건 · 지나감 ${skipped}건`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
