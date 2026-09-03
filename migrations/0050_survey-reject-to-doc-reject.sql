-- 조사 반려를 설치이력 칸 반려로 옮긴다 (한백 지시 2026-09-03)
--
-- 「조사 반려」는 기설치 두 칸(legacylog·legacyev)을 돌려보내는 ★세 번째 문★이었다.
-- 앞의 둘과 결과가 같았다: stage 가 반려 한 건으로 같이 세고(lib/stage.ts), board 가
-- 같은 칸(계약보완)으로 보냈다(lib/board.ts). 기본 사유부터 「기설치 이력엑셀 파일/
-- 증빙자료 필요」였고 — 그 두 칸이 비었다는 말이다 — 푸는 조건도 서류였다
-- (설치이력 파일이 올라오면 저절로 풀렸다, lib/data/store/docs.ts).
--
-- 그래서 문을 하나로 줄인다: 파일이 있으면 칸별 반려, 없으면 누락 서류 보완요청.
-- 살아 있는 조사 반려는 ★그 사유 그대로★ 설치이력 칸의 반려로 옮긴다 — 안 옮기면
-- 반려가 사라져 현장이 조용히 계약보완에서 빠져나간다(공이 협력사에서 없어진다).
--
-- 컬럼은 지우지 않는다 — 되돌릴 길을 남긴다(화면 규칙 7). 코드가 더 읽지 않을 뿐이다.

INSERT INTO documents (project_id, kind, filename, blob_url, status, reject_reason, uploaded_by, uploaded_at, files)
SELECT p.id, 'legacylog', NULL, NULL, 'rejected', p.pre_reject_reason, NULL, NULL, '[]'::jsonb
  FROM projects p
 WHERE p.pre_reject_reason IS NOT NULL
ON CONFLICT (project_id, kind) DO UPDATE
   SET status = 'rejected',
       reject_reason = EXCLUDED.reject_reason
 WHERE documents.status <> 'rejected';   -- 이미 반려면 그 칸의 사유가 더 구체적이다

UPDATE projects SET pre_reject_reason = NULL WHERE pre_reject_reason IS NOT NULL;
