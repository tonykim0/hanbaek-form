-- 기설치 조사 반려가 계약 확인을 되돌리게 (한백 지적 2026-08-26 — 전주태평에스케이뷰)
--
-- 「조사도 보완이 필요하다 — 서류와 같은 이치다」로 만든 자리인데(2026-08-24), 정작
-- 서류 반려가 하는 뒷일을 안 하고 있었다. 서류를 반려하면 앞서 한 계약 확인을 지우는데
-- (pg-store reviewDocument) 조사 반려는 사유만 적고 끝났다.
--
-- 그래서 반려해 놓고도 현장이 제자리에 섰다. 확인일이 남아 있으면 단계가 시공으로
-- 유도되고(lib/stage: contractConfirmedAt 이 있으면 construction), 그러면 보드의 계약
-- 세 칸 판정 자체를 안 탄다 — 계약보완으로 내려갈 길이 없다.
--
-- 코드는 이제 둘 다 한다: 반려하면 확인을 지우고(pg-store setPreInstall), 조사 반려도
-- 계약보완으로 센다(lib/board boardColumnOf preRejected). 이미 저장된 행을 여기서 맞춘다.
--
-- ★겨냥이 좁다.★ 조사 반려가 아직 안 풀린 현장 중에서, 공정이 시작되지 않은 것만.
-- 조사 반려는 협력사가 조사를 다시 저장하면 풀리므로(pg-store), 사유가 남아 있다는 것은
-- 그 반려가 아직 열려 있다는 뜻이다. 그래도 이미 행위신고·착공까지 간 현장을 계약보완으로
-- 끌어내리지는 않는다 — 공사가 도는 중에 칸이 계약으로 돌아가면 그게 더 큰 혼란이다.
-- 그런 현장이 있으면 사람이 보고 정한다.
--
-- 보완요청일은 반려 당시의 진척일로 둔다(0020 과 같은 방식) — 조사 반려가
-- last_progress_at 을 그날로 갱신한다. current_date 는 서버 시간대라 한국 날짜와
-- 하루 어긋날 수 있고, 앱이 쓰는 날짜는 한국 달력이다(lib/date today).
--
-- 멱등: 두 번째 실행은 0행이다(확인일이 이미 비어 있다).
update projects p
set contract_confirmed_at = null,
    contract_fix_asked_at = coalesce(p.contract_fix_asked_at, p.last_progress_at),
    court = '영업사'
where p.pre_reject_reason is not null
  and p.contract_confirmed_at is not null
  and not exists (
    select 1 from processes s
    where s.project_id = p.id and s.status <> '계약완료'
  );
