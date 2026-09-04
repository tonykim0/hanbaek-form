/**
 * 기 구축 충전기 연동 — SK·플러그링크 케이스 정의. [한백 전용]
 *
 * 연동은 설치·교체가 아니라 이미 서 있는 충전기(건설사 설치 등)를 운영사 시스템에
 * 연결하는 제3의 사업이다. 사업구분·교체유형에 「연동」 축을 늘려 담았다(2026-08-23,
 * 한백 지시 — SK 부속합의서의 연동과 PL 연동을 함께 등록).
 *
 * 금액 (한백 확인 2026-08-23):
 *   SK  7년 계약 이상 / 기당 150만 (부속합의서 [별첨1] · 모자분리 조건 · 급속 연동 수수료 제외)
 *   PL  7년 55만 · 10년 75만 — ★받는 총액이다★ (연동 작업비가 별도로 더 오지 않는다)
 *
 * ★분해: 시공비 0 · 마진 20만 · 나머지 전부 영업비★ (한백 확인 2026-08-23).
 * 연동은 설치 공사가 없어 「시공비 100만 고정」 프레임이 안 맞는다(PL 55만이 100만보다
 * 작다). 연동 작업(서버 연동·시운전·안전점검·행위신고)의 하도급 몫은 시공비 칸이 아니라
 * 지급 단계에서 다룬다.
 *
 * 기성: SK 는 부속합의서 4조(완료·개통 준공 후 지급, 세금계산서 확인 후 익월 25일)대로
 * 준공 일시금(lump-100). ★PL 연동은 자체투자와 같은 2단계다★ — 20만 먼저, 나머지는
 * 준공 이후(「연동도 자투에 포함돼」, 한백 지시 2026-09-04). 단계 정의는
 * lib/pricing-policy-plhec-h2.ts 의 PL_INV_STEPS 한 곳이고, 반영은 migrations/0053 이다.
 */
import { PL_INV_STEPS } from '@/lib/pricing-policy-plhec-h2';
import type { NewPricingRule } from '@/types/project';

const MARGIN = 200_000;

const SK_LINK_INSTALL =
  '모자분리 조건 · 7년 계약 이상 · 지역: 수도권 · 6개 광역시 · 시 단위의 상면';
/*
 * 대금 줄은 안 적는다 — SK 공통 기타(sk-h2 케이스들의 「대금: 세금계산서 확인 후 익월
 * 25일…」)와 같은 말이라, 두 벌이면 기타 행에 나란히 떠서 중복으로 읽힌다(한백 지적
 * 2026-08-23). 연동만의 조건(급속 제외)만 남긴다.
 */
const SK_LINK_MISC = '· 급속충전기 연동에 대한 수수료는 제외';

/*
 * 기성 줄은 안 적는다 — 정산 규칙 행이 단계를 그대로 보여준다(중복은 갈린다).
 * 「정산 방식이 확정 문서에 없어 기성 미정」이라 적어 두었던 줄은 걷었다 —
 * 자투와 같은 2단계로 정해졌다(한백 2026-09-04).
 */
const PL_LINK_MISC = '· 연동 대상 기기·세부 조건은 운영사 확인 필요(코스텔·PNE 한정으로 안내된 바 있음)';

const BASE = {
  cpo: undefined as never,
  bizType: '연동' as const,
  powerType: '모자분리' as const,
  replType: '연동' as const,
  channel: '턴키' as const,
  bizYear: 2026,
  consUnit: 0,
  margin: MARGIN,
  supervisionBearer: null,
  safetyFeeBearer: null,
  supplyItems: null,
  promo: null,
  promoExtend: null,
  chargeRate: null,
  coexistTerms: null,
  otherSupport: null,
  note: null,
};

export function linkRules(): NewPricingRule[] {
  return [
    {
      ...BASE,
      caseName: 'SK일렉링크 (2026년 7월 20일) | 전체 | 7·10년 연동 | 모자분리',
      cpo: 'SK일렉링크',
      termYears: [7, 10],
      bldgTypes: ['공동주택', '상업시설'],
      startDate: '2026년 7월 20일',
      salesUnit: 1_500_000 - MARGIN,
      installTerms: SK_LINK_INSTALL,
      miscTerms: SK_LINK_MISC,
      settlementSteps: [{ trigger: '준공마감', basis: { kind: '비율', ratio: 1 } }],
    },
    {
      ...BASE,
      caseName: '플러그링크 (2026년 하반기) | 공동주택 | 7년 연동 | 모자분리',
      cpo: '플러그링크',
      /*
       * ★DB 의 시작일은 '2026년 7월 1일' 이다★ — 0037 이 플러그링크의 「2026년 하반기」를
       * 계약일과 견줄 수 있는 날짜로 통일했다(케이스 이름도 같이 바꿨다). 이 파일은 0010 을
       * 재현하는 값이라 그대로 두지만, 시작일로 케이스를 골라내는 SQL 을 쓸 때는 DB 값을 본다
       * (migrations/0053 이 그렇게 골랐다) — 이 문자열로 고르면 연동 두 건이 조용히 빠진다.
       */
      termYears: [7],
      bldgTypes: ['공동주택'],
      startDate: '2026년 하반기',
      salesUnit: 550_000 - MARGIN,
      installTerms: null,
      // 충전요금은 운영사의 것이라 연동 케이스에도 같다 (한백 확정 2026-08-23) — SK 는 아직 미지정
      chargeRate: 292,
      miscTerms: PL_LINK_MISC,
      settlementSteps: PL_INV_STEPS,
    },
    {
      ...BASE,
      caseName: '플러그링크 (2026년 하반기) | 공동주택 | 10년 연동 | 모자분리',
      cpo: '플러그링크',
      termYears: [10],
      bldgTypes: ['공동주택'],
      startDate: '2026년 하반기',
      salesUnit: 750_000 - MARGIN,
      installTerms: null,
      // 충전요금은 운영사의 것이라 연동 케이스에도 같다 (한백 확정 2026-08-23) — SK 는 아직 미지정
      chargeRate: 292,
      miscTerms: PL_LINK_MISC,
      settlementSteps: PL_INV_STEPS,
    },
  ];
}
