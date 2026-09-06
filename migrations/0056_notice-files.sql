-- 공지에 첨부파일 (한백 지시 2026-09-06)
--
-- 양식·서식처럼 협력사가 받아 가는 파일을 공지에 붙인다. 그전에는 파일을 주려면
-- 정적 안내 HTML 을 만들고 public/notices/files/ 에 파일을 두고 배포해야 했다 —
-- 공지를 표로 옮긴 이유(0051)와 같은 이유로 그 길을 여기서도 없앤다.
--
-- 서류(documents.files)와 같은 모양의 jsonb 지만 담는 것이 다르다: 저기는 검수
-- 대상이라 판독 제목·반려가 붙고, 여기는 받아 가는 것뿐이라 이름·주소·크기·올린
-- 시각뿐이다(types/project.ts NoticeFile).
--
-- ★null 을 두지 않는다★ — 빈 배열이 기본이다. null 이면 「첨부 있음」을 세는 자리마다
-- null 검사가 하나씩 붙고, 한 곳을 빠뜨리면 그 공지만 표시가 안 뜬다.

alter table notices add column if not exists files jsonb not null default '[]'::jsonb;
