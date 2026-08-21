/**
 * 정산 규칙 — 초기 시드. ★정본은 저장소다★ (DB settlement_rules · 파일 .data/settlement-rules.json)
 *
 * 단가 케이스가 기성 단계를 직접 정의하면서(2026-08-21) 규칙이 화면에서도 생긴다 —
 * 이 파일은 첫 시드와 mock 저장소에만 쓰인다. 규칙을 여기 추가해도 화면에는 안 뜬다.
 *
 * 왜 금액을 케이스 행마다 적지 않고 규칙으로 두는가:
 * 매트릭스 28행을 검산해보니 정산 「모양」은 몇 가지뿐이고 금액은 턴키에서 유도된다.
 * 금액을 행마다 손으로 적으면 케이스를 복제할 때 안 따라간다 — 실제로 3행이 그렇게 어긋나 있었다.
 * 규칙으로 두면 그 오류가 원천적으로 생기지 않는다.
 *
 * 산정 방식 셋:
 *   고정 — 대당 고정액 (운영사가 못 박은 선급금)
 *   비율 — 턴키 × 비율
 *   잔액 — 턴키 − 앞단계 합계
 *
 * 이름은 손으로 적지 않는다 — settlementRuleNameOf(단계)가 만든 문자열과 같아야 한다.
 * 운영사 이름을 이름에 박으면 같은 모양의 규칙이 이름만 다르게 쌓인다(재사용 판정은
 * 단계로 하므로 동작은 안 깨지지만, 화면에 같은 것이 두 얼굴로 뜬다).
 */
import type { SettlementRule } from '@/types/project';

export const SETTLEMENT_RULES: SettlementRule[] = [
  {
    id: 'pl-2step',
    name: '환경부 승인 200,000원 → 준공마감 잔액',
    steps: [
      { trigger: '환경부 승인', basis: { kind: '고정', unit: 200_000 } },
      { trigger: '준공마감', basis: { kind: '잔액' } },
    ],
    note: '플러그링크. 2차 금액칸에 배포가의 절반이 적혀 있으나 유형이 잔액이라 계산으로 대체된다. 한백 최종확인 대기.',
    active: true,
  },
  {
    id: 'nice-2step',
    name: '착공 1,100,000원 → 준공마감 잔액',
    steps: [
      { trigger: '착공', basis: { kind: '고정', unit: 1_100_000 } },
      { trigger: '준공마감', basis: { kind: '잔액' } },
    ],
    note: '나이스인프라.',
    active: true,
  },
  {
    id: 'sk-2step',
    name: '착공 800,000원 → 준공마감 잔액',
    steps: [
      { trigger: '착공', basis: { kind: '고정', unit: 800_000 } },
      { trigger: '준공마감', basis: { kind: '잔액' } },
    ],
    note: 'SK일렉링크.',
    active: true,
  },
  {
    id: 'env-40-60',
    name: '환경부 승인 40% → 준공마감 60%',
    steps: [
      { trigger: '환경부 승인', basis: { kind: '비율', ratio: 0.4 } },
      { trigger: '준공마감', basis: { kind: '비율', ratio: 0.6 } },
    ],
    note: '현대엔지니어링(하반기)·에버온 공통. 에버온 비고의 「40%/60%」와 일치.',
    active: true,
  },
  {
    id: 'hec-3step',
    name: '환경부 승인 300,000원 → 착공 800,000원 → 준공마감 1,200,000원',
    steps: [
      { trigger: '환경부 승인', basis: { kind: '고정', unit: 300_000 } },
      { trigger: '착공', basis: { kind: '고정', unit: 800_000 } },
      { trigger: '준공마감', basis: { kind: '고정', unit: 1_200_000 } },
    ],
    note: '현대엔지니어링(상반기). 유일한 3단계.',
    active: true,
  },
  {
    id: 'lump-100',
    name: '준공마감 100%',
    steps: [{ trigger: '준공마감', basis: { kind: '비율', ratio: 1 } }],
    note: 'SK 자체투자·플러그링크 시공 채널. 1단계 전액.',
    active: true,
  },
];

export const SETTLEMENT_RULE_BY_ID = new Map(SETTLEMENT_RULES.map((r) => [r.id, r]));
