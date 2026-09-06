-- 플러그링크 하반기 케이스의 시기 표기를 계약일자 범위로 — 「2026년 7월 1일 ~ 8월 31일」 (한백 2026-09-06)
-- 정의: lib/pricing-policy-plhec-h2.ts 의 PL_START
--
-- ★왜★ 7월 1일 벌은 계약일자 7월 1일~8월 31일 접수분에 적용된다 — 9월 1일부터는 다른 정책이다
-- (한백). 시작일만 적혀 있으면 열려 있는 것처럼 읽힌다. 상반기(1월 20일)는 그대로 둔다.
-- 케이스 이름의 괄호도 같이 바뀐다 — 이름은 적용 시작에서 유도되는 표시용 라벨이다(CaseForm).
--
-- 정렬·시기 탭·중복 판정은 앞 날짜를 읽는다(lib/pricing-match startKey → 2026-07-01) —
-- 그대로 「2026 하반기」 탭에 선다. 연도를 빼면 못 읽어 상반기로 옮겨 가므로 연도를 남긴다.
-- 알아둘 것: 화면의 수정 폼은 적용 시작을 날짜 하나로 다시 만들므로, 이 케이스를 폼으로
-- 열어 저장하면 끝 날짜가 사라진다 — 그때는 「적용 시작 수정」으로 다시 적는다.
--
-- 멱등: 옛 표기만 겨냥한다 — 두 번째 실행은 0행이다.

update pricing_rules
   set start_date = '2026년 7월 1일 ~ 8월 31일',
       case_name  = replace(case_name, '플러그링크 (2026년 7월 1일) |', '플러그링크 (2026년 7월 1일 ~ 8월 31일) |')
 where cpo = '플러그링크'
   and start_date = '2026년 7월 1일';

-- 검산 — 7월 1일로 시작하는 플러그링크 케이스는 전부 새 표기여야 한다(이름까지)
do $$
declare bad int;
begin
  select count(*) into bad
    from pricing_rules
   where cpo = '플러그링크'
     and start_date like '2026년 7월 1일%'
     and (start_date <> '2026년 7월 1일 ~ 8월 31일'
          or case_name not like '플러그링크 (2026년 7월 1일 ~ 8월 31일) |%');
  if bad > 0 then
    raise exception '플러그링크 하반기 %건의 시기 표기가 맞지 않습니다', bad;
  end if;
end $$;
