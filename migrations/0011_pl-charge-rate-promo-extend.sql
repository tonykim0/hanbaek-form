-- 플러그링크 요금·영업비 차감 확정, 기타에서 네 항목 삭제 (2026-08-23, 한백 확정)
--
--  · 충전요금 292원 최종 확정 — 그동안 「294.3원은 정수 칸에 못 담는다」며 기타에 적어 뒀다
--  · 영업비 차감: 6개월 149원 연장 20만 · 6개월 249원 연장 10만
--    → 한 숫자로 못 담아 promo_extend(jsonb) 를 새로 만든다. 옛 promo_extend_deduct 는
--      값이 전부 null 이라 그대로 남긴다 — 마이그레이션이 배포보다 먼저 도니 지우면
--      아직 안 바뀐 배포가 그 칸을 찾다 터진다. 새 코드가 다 나간 뒤 따로 지운다.
--  · 기타에서 삭제: 기본요금(요금 칸으로 감) · 대금 조항(기성 관련) ·
--    외주모집대행사/리베이트 금지 · 지원 초과분·취소 수수료
--
-- ★범위를 케이스 단위로 못 박는다.★ `where cpo = '플러그링크'` 로 뭉치면 상반기 케이스와
-- 연동 케이스까지 하반기 정책 문구로 덮인다 — 상반기는 기타가 비어 있는 것이 맞고(그 정책을
-- 아직 안 적었다), 연동은 자기 문구가 따로 있다(0010). 요금만 상반기를 뺀 전부에 넣는다.
--
-- lib/pricing-policy-plhec-h2.ts 가 같은 값을 들고 있다 — 둘이 갈리면 다음 반영이 되돌린다.

alter table pricing_rules
  add column if not exists promo_extend jsonb;

-- ── 충전요금 — 하반기 이후의 플러그링크 전부 (연동·자체투자 포함). 상반기는 그 정책의 값이 따로다
update pricing_rules set
  charge_rate = 292
where cpo = '플러그링크' and id not like 'pl-h1-%';

-- ── 프로모션 연장 — 프로모션이 있는 케이스만. 자체투자·연동은 문서에 프로모션 언급이 없다
update pricing_rules set
  promo_extend = '[{"months":6,"rate":149,"deduct":200000},{"months":6,"rate":249,"deduct":100000}]'::jsonb
where cpo = '플러그링크'
  and id not like 'pl-h1-%'
  and promo is not null
  and jsonb_array_length(promo) > 0;

-- ── 기타 — 하반기 보조금 케이스 다섯. 남는 것은 세 줄이다
update pricing_rules set
  misc_terms = '· 프로모션 연장은 영업비 차감으로 가능 — 7년 최대 1년 · 10년 최대 2년
· 기존 플러그링크 설치 현장 추가 영업 시 프로모션 없음(프로모션 기간만큼 계약 연장 합의서 작성 시 적용 가능)
· 보조금 미수령 시 귀책 무관 비보조금 기준 수수료 지급(기지급분 차액 환수)'
where id in (
  'pl-h2-y7-mother-new-apt',
  'pl-h2-y10-mother-new-apt',
  'pl-h2-y7-kepco-new-apt',
  'pl-h2-y10-kepco-new-apt',
  'pl-y10-mother-new-biz-2026'
);

-- ── 기타 — 하반기 자체투자 세 건. 기본요금·대금 조항을 빼면 프로모션 한 줄만 남는다
update pricing_rules set
  misc_terms = '· 프로모션은 문서에 명시 없음'
where id in (
  'pl-y7-mother-inplace-apt-2026',
  'pl-y10-mother-inplace-apt-2026',
  'pl-y10-mother-inplace-biz-2026'
);
