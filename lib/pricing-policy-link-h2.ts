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
 * 준공 일시금(lump-100). PL 은 근거 문서가 없어(금액만 한백이 확정) ★기성 미정★.
 */
import type { NewPricingRule } from '@/types/project';

const MARGIN = 200_000;

const SK_LINK_INSTALL =
  '모자분리 조건 · 7년 계약 이상 · 지역: 수도권 · 6개 광역시 · 시 단위의 상면';
const SK_LINK_MISC = [
  '· 급속충전기 연동에 대한 수수료는 제외',
  '· 대금: 완료·개통 준공 후 — 세금계산서 확인 후 익월 25일 현금 지급',
].join('\n');

const PL_LINK_MISC = [
  '· 연동 대상 기기·세부 조건은 운영사 확인 필요(코스텔·PNE 한정으로 안내된 바 있음)',
  '· 정산 방식이 확정 문서에 없어 기성 미정 — 확인되면 채운다',
].join('\n');

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
  promoExtendDeduct: null,
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
      termYears: [7],
      bldgTypes: ['공동주택'],
      startDate: '2026년 하반기',
      salesUnit: 550_000 - MARGIN,
      installTerms: null,
      miscTerms: PL_LINK_MISC,
      settlementSteps: [],
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
      miscTerms: PL_LINK_MISC,
      settlementSteps: [],
    },
  ];
}
