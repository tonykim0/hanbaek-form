-- 플러그링크 하반기 — 적용 시작을 7월 1일로, 조건 칸을 정리한다 (한백 2026-08-29)
-- 정의: lib/pricing-policy-plhec-h2.ts (PL_START · PL_INSTALL_APT/BIZ · PL_MISC_SUB)
--
-- ★적용 시작이 말이었다.★ start_date 가 '2026년 하반기' 라서 케이스 이름도 세 꼴로 갈렸다:
-- 「(하반기)」·「(2026년 하반기)」·「(2026년 7월 1일)」. 시기가 말이면 어느 계약에 어느
-- 케이스가 맞는지 사람이 해석해야 한다 — 하반기 정책은 ★계약일자 7월 1일 이후★부터
-- 적용된다(한백 2026-08-29). 현대엔지니어링(7월 21일)과 같은 꼴로 맞춘다.
--
-- 이름도 한 꼴로 다시 적는다: 플러그링크 (2026년 7월 1일) | 건축물 | N년 교체유형 | 수전.
-- 교체유형 표기도 갈려 있었다(「10년 신규」 vs 「10년 환경부 신규」).
--
-- 조건 칸 (한백 2026-08-29):
--  · 설치조건 — 불릿마다 줄을 바꾼다. 「· 」로 이어 붙이면 한 문단이 되어 조건이 몇 개인지
--    세어지지 않는다. 목록 안(대상지)은 쉼표다 — 조건이 아니라 한 조건의 나열이다.
--  · 지급자재 — 문서에 조항이 없다 = 대주는 것이 「없음」이다. 빈 칸(미지정)과 다른 말이다.
--  · 기타 — 「프로모션 연장은 영업비 차감으로 가능…」을 걷는다. 그 말은 이제 연장 행의
--    이름이다(「프로모션 연장 (영업비 차감)」). 자체투자의 「프로모션은 문서에 명시 없음」과
--    연동의 두 줄도 걷는다 — 프로모션 행이 이미 「미지정」으로 그 말을 한다.
--
-- 금액·축·기성은 손대지 않는다.

update pricing_rules set start_date = '2026년 7월 1일'
where cpo = '플러그링크' and start_date = '2026년 하반기';

-- 이름을 한 꼴로 — 축이 곧 이름이다
update pricing_rules set case_name = '플러그링크 (2026년 7월 1일) | 공동주택 | 7년 환경부 신규 | 모자분리'  where id = 'pl-h2-y7-mother-new-apt';
update pricing_rules set case_name = '플러그링크 (2026년 7월 1일) | 공동주택 | 10년 환경부 신규 | 모자분리' where id = 'pl-h2-y10-mother-new-apt';
update pricing_rules set case_name = '플러그링크 (2026년 7월 1일) | 공동주택 | 7년 환경부 신규 | 한전불입'  where id = 'pl-h2-y7-kepco-new-apt';
update pricing_rules set case_name = '플러그링크 (2026년 7월 1일) | 공동주택 | 10년 환경부 신규 | 한전불입' where id = 'pl-h2-y10-kepco-new-apt';
update pricing_rules set case_name = '플러그링크 (2026년 7월 1일) | 상업시설 | 10년 환경부 신규 | 모자분리' where id = 'pl-y10-mother-new-biz-2026';
update pricing_rules set case_name = '플러그링크 (2026년 7월 1일) | 공동주택 | 7년 자체투자 | 모자분리'   where id = 'pl-y7-mother-inplace-apt-2026';
update pricing_rules set case_name = '플러그링크 (2026년 7월 1일) | 공동주택 | 10년 자체투자 | 모자분리'  where id = 'pl-y10-mother-inplace-apt-2026';
update pricing_rules set case_name = '플러그링크 (2026년 7월 1일) | 상업시설 | 10년 자체투자 | 모자분리'  where id = 'pl-y10-mother-inplace-biz-2026';
update pricing_rules set case_name = '플러그링크 (2026년 7월 1일) | 공동주택 | 7년 연동 | 모자분리'      where id = 'pl-y7-mother-link-apt-2026';
update pricing_rules set case_name = '플러그링크 (2026년 7월 1일) | 공동주택 | 10년 연동 | 모자분리'     where id = 'pl-y10-mother-link-apt-2026';

-- 설치조건 — 축마다 자기 것만, 불릿마다 줄바꿈
update pricing_rules
set install_terms = '· 총 주차면의 2%까지 지원'
  || E'\n· 10년 모자분리만 (7년 계약·한전불입 불가)'
  || E'\n· 대상지: 공영주차장, 관공서, 주민센터, 지식산업센터, 4성 이상 호텔/리조트, 사옥, 골프장, 병원'
where cpo = '플러그링크' and start_date = '2026년 7월 1일'
  and bldg_types::text like '%상업시설%';

update pricing_rules
set install_terms = '· 총 주차면의 5%까지 지원'
  || E'\n· 충전기 최소 2% 전용 구역 도색 필수'
  || E'\n· 1개 단지 최대 130대(7년) / 120대(10년)'
where cpo = '플러그링크' and start_date = '2026년 7월 1일'
  and bldg_types::text not like '%상업시설%'
  and biz_type <> '연동';

-- 지급자재 — 대주는 것이 없다(빈 칸「미지정」과 다른 말이다)
update pricing_rules set supply_items = '없음'
where cpo = '플러그링크' and start_date = '2026년 7월 1일';

-- 기타 — 연장 조항은 연장 행의 이름이 되었고, 나머지 두 문구는 프로모션 행이 대신 말한다
update pricing_rules
set misc_terms = '· 기존 플러그링크 설치 현장 추가 영업 시 프로모션 없음(프로모션 기간만큼 계약 연장 합의서 작성 시 적용 가능)'
  || E'\n· 보조금 미수령 시 귀책 무관 비보조금 기준 수수료 지급(기지급분 차액 환수)'
where cpo = '플러그링크' and start_date = '2026년 7월 1일' and biz_type = '환경부';

update pricing_rules set misc_terms = null
where cpo = '플러그링크' and start_date = '2026년 7월 1일' and biz_type in ('자체투자', '연동');
