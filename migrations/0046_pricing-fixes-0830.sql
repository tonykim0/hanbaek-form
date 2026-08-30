-- 단가 손질 셋 — 한백 지시 2026-08-30
--
-- ① 플러그링크 상업시설 자체투자 10년 — 남는 5만은 한백 마진이다
--    0042 로 기본시공비를 95만으로 내리면서, 영업비가 0이던 이 케이스에 5만이 생겼다.
--    그 자리에 영업사가 없다 — 자체투자 상업시설은 영업 수수료가 없는 구성이라 총액
--    120만이 시공비와 마진으로만 채워져 있었다. 그래서 5만은 마진으로 간다(한백).
--    영업 5만 → 0 · 마진 20만 → 25만. 시공 95만과 총액 120만은 그대로다.
--
-- ② 나이스 상반기 두 건도 기본시공비 100만 — 0044 에서 미뤘던 것이다
--    그때는 홍릉동부아파트가 이 케이스를 참조하는데 787.5만이 이미 나가 있어 손대지
--    않았다. 그 지급이 잘못 들어간 것이라 한백이 해제했다(지급기록 0건 확인).
--    총액과 마진 25만은 그대로고 영업비가 10만 줄어든다:
--      10년  영업 125만 → 115만 · 시공 90만 → 100만 (총 240만)
--       7년  영업 105만 →  95만 · 시공 90만 → 100만 (총 220만)
--    ★지급조건 잠금도 같이 푼다.★ 잠금의 근거가 「지급이 나갔다」였는데(0035 가 이관
--    현장을 첫 지급일로 소급해 잠갔다) 그 지급이 사라졌다. 남겨 두면 저장소가 같은
--    변경을 화면에서는 거절해, DB 와 앱이 다른 말을 한다. 지급기록이 0건인 것을
--    조건에 달아 그 현장만 푼다 — 관리자가 화면에서 다시 확정할 수 있다.
--
-- ③ 나이스 연동 케이스의 조건 칸 — 정책 「3. 코스텔 연동」을 옮긴다 (0045 에서 비워 둔 자리)
--    수수료는 완속만 붙는다. 그래서 이 90만 케이스가 곧 완속이고, 충전요금도 완속값
--    249원이다(0045 는 나이스 일반 단가 295원을 넣어 두었다 — 연동은 요금체계가 따로다).

update pricing_rules set sales_unit = 0, margin = 250000
where id = 'pl-y10-mother-inplace-biz-2026' and sales_unit = 50000;

update pricing_rules
set sales_unit = sales_unit + cons_unit - 1000000,
    cons_unit  = 1000000
where cpo = '나이스인프라'
  and start_date = '2026년 1월 27일'
  and channel = '턴키'
  and cons_unit <> 1000000;

update projects set payout_terms_confirmed_at = null
where name like '%홍릉동부%'
  and payout_terms_confirmed_at is not null
  and not exists (select 1 from payout_entries pe where pe.project_id = projects.id);

update pricing_rules set
  charge_rate   = 249,
  install_terms = '· 코스텔 충전기 연동 — 급속·완속 가능 (과금형 제외)',
  note          = '완속만 — 급속 연동은 수수료 없음',
  misc_terms    = '· 수수료는 완속만 — 급속 연동은 수수료 없음'
    || E'\n· 요금체계(연동) — 급속 299원 · 완속 249원'
    || E'\n· 미연동은 나이스 공시요금 (추가설치 건 등)'
where id = 'nice-y7-10-mother-link-apt-2026';
