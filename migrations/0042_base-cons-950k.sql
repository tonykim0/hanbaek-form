-- 기본공사비를 하반기 기준 95만으로 올린다 — 플러그링크·나이스인프라 (한백 2026-08-29)
-- 정의: lib/pricing-policy-plhec-h2.ts(PL_PAYOUT_CONS) · lib/pricing-policy-nice-h2.ts(PAYOUT_CONS)
--
-- ★「하반기는 시공 100만」은 프레임이 아니라 근거 없는 자릿수였다.★ 이 저장소가 스스로 정해
-- 검증 스크립트에까지 적어 둔 값이라 하반기 케이스가 전부 100만으로 서 있었는데, 실제 기준은
-- ★상반기 90만 → 하반기 95만★ 이다(한백 2026-08-29). 현대엔지니어링만 110만으로 따로 간다.
--
-- ★받는 단가(총액)는 손대지 않는다.★ 그것은 운영사와의 계약이다. 바뀌는 것은 나눔뿐이고,
-- 마진 20만은 그대로이므로 시공비가 오른 만큼 영업비가 줄어든다. 그래서 sales_unit 을
-- 새로 적지 않고 cons_unit 에서 옮긴다 — 총액이 어긋날 자리를 아예 두지 않는다.
-- cons_unit <> 950000 조건이 멱등을 만든다(두 번째 실행은 아무것도 안 맞는다).
--
-- 손대는 자리 (전부 지급조건 미확정 · 지급기록 0건 — 소급해서 뒤틀릴 돈이 없다):
--  · 플러그링크 2026년 7월 1일 턴키 8건 — 연동은 뺀다(연결만 하므로 시공비가 0이다)
--    한전불입 7년만 90만이었고 나머지 일곱은 100만이었다
--  · 나이스인프라 2026년 8월 1일 턴키 5건 (100만 → 95만)
-- 손대지 않는 자리:
--  · 상반기 — 플러그링크 1월 20일 · 나이스 1월 27일 (90만이 맞다)
--  · 나이스 7월 1일 — 정책이 「8월 1일 접수건부터」라 7월 접수는 옛 단가다(90만 그대로)
--  · 현대엔지니어링 — 110만 (0041)

update pricing_rules
set sales_unit = sales_unit + cons_unit - 950000,
    cons_unit  = 950000
where cpo = '플러그링크'
  and start_date = '2026년 7월 1일'
  and channel = '턴키'
  and biz_type <> '연동'
  and cons_unit <> 950000;

update pricing_rules
set sales_unit = sales_unit + cons_unit - 950000,
    cons_unit  = 950000
where cpo = '나이스인프라'
  and start_date = '2026년 8월 1일'
  and channel = '턴키'
  and cons_unit <> 950000;

-- 열화상카메라 설치비 — 카메라는 나이스가 무상으로 주지만 다는 일은 우리 몫이다.
-- ★대당 단가에 못 넣는다★: 3면당 1대라 기수와 대수가 다르다. 지급은 현장의 조정
-- (추가공사비)으로 나가고, 이 줄은 그때 볼 요율이다. 시기와 무관한 요율이라 활성 케이스
-- 전부에 적는다. 기타지원(나이스가 주는 것) 칸과 섞지 않는다 — 이건 우리가 주는 돈이다.
update pricing_rules
set misc_terms = case
      when misc_terms is null or misc_terms = '' then '· 열화상카메라 설치비 1대당 10만원 (시공사 지급)'
      else '· 열화상카메라 설치비 1대당 10만원 (시공사 지급)' || E'\n' || misc_terms
    end
where cpo = '나이스인프라'
  and active
  and (misc_terms is null or misc_terms not like '%열화상카메라 설치비%');
