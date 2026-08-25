-- 서류 한 칸에 파일 여러 장 (한백 지시 2026-08-25)
--
-- 한 칸에 파일 하나였다. 나중에 올린 것이 앞의 것을 갈아치우고, 앞 파일은 저장소에서도
-- 지워졌다(lib/attach-doc 의 prev 정리). 회의록이 두 장으로 스캔되거나 사진대지가 동별로
-- 갈려 오면 올릴 자리가 없어서 사람이 미리 하나로 합쳐야 했다.
--
-- files 가 파일 목록의 정본이다: [{ "name", "url", "uploadedBy", "uploadedAt" }] — 올린 순서.
-- filename·blob_url 은 남긴다. 첫 파일의 사본이고, 저장소가 쓸 때마다 같이 맞춘다
-- (lib/data/pg-store.ts) — 손으로 SQL 을 볼 때 칸이 비어 보이지 않게 하기 위해서다.
--
-- 멱등: 아직 비어 있는(files = '[]') 행만 채운다. 두 번째 실행은 0행이다.
alter table documents add column if not exists files jsonb not null default '[]'::jsonb;
alter table process_documents add column if not exists files jsonb not null default '[]'::jsonb;

update documents
set files = jsonb_build_array(jsonb_build_object(
  'name', coalesce(filename, '파일'),
  'url', blob_url,
  'uploadedBy', uploaded_by,
  'uploadedAt', uploaded_at
))
where blob_url is not null and files = '[]'::jsonb;

update process_documents
set files = jsonb_build_array(jsonb_build_object(
  'name', coalesce(filename, '파일'),
  'url', blob_url,
  'uploadedBy', uploaded_by,
  'uploadedAt', uploaded_at
))
where blob_url is not null and files = '[]'::jsonb;
