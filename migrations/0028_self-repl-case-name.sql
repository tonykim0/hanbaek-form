-- 자체투자 케이스 이름에서 교체유형 괄호를 뗀다 — 그 구분이 없는 운영사 (한백 2026-08-26)
-- 정의: types/project.ts 의 replLabel · SPLITS_SELF_REPL
--
-- 나이스인프라·현대엔지니어링·플러그링크는 제자리교체와 신규위치의 단가가 같아 케이스를
-- 한 칸으로 합쳤다(0027). 그런데 이름에는 「자체투자 (제자리교체)」가 남아, 구분이 없는
-- 운영사인데도 화면이 그 말을 계속 보여 준다 — 지급조건 셀렉트와 적용조건 표가 케이스명을
-- 그대로 적는다. 화면이 만드는 라벨(replLabel)과 같은 꼴로 맞춘다.
--
-- 축(repl_type)은 그대로다. 금액·조건도 그대로다 — 보이는 이름만 바꾼다.
-- 신규위치 이름도 함께 바꾼다: 0027 의 삭제가 참조 가드에 걸려 남은 케이스가 있을 수 있다.

update pricing_rules
set case_name = replace(case_name, '자체투자 (제자리교체)', '자체투자')
where cpo in ('나이스인프라', '현대엔지니어링', '플러그링크')
  and case_name like '%자체투자 (제자리교체)%';

update pricing_rules
set case_name = replace(case_name, '자체투자 (신규위치)', '자체투자')
where cpo in ('나이스인프라', '현대엔지니어링', '플러그링크')
  and case_name like '%자체투자 (신규위치)%';
