'use client';

/**
 * 운영사 자료실 — 포털(/materials)과 콘솔(/library)이 ★같은 부품★을 쓴다.
 *
 * ★다시 짰다 (한백 지시 2026-08-29 「이게 최선인지 고민좀」).★ 판단의 바탕은 실측이다:
 * 들어 있는 것은 29건이고 운영사는 넷이다(2026-08-29). 그 규모에서 다섯이 어긋나 있었다.
 *
 *  1. ★거르는 장치가 내용보다 컸다★ — 검색창 + 운영사 칩 5 + 분류 칩 7 이 상자 하나를
 *     차지하고, 그 아래 자료가 29건이었다. 그 규모에서는 스크롤이 필터보다 빠르다.
 *  2. ★운영사를 두 번 고르게 했다★ — 위의 칩과 아래 섹션 제목이 같은 축이다(같은 것을
 *     두 자리에 두지 않는다, 화면 규칙 5). 탭 한 줄로 합친다. 고른 운영사 안에서는 그
 *     이름을 다시 적지 않는다 — 탭이 곧 제목이다.
 *  3. ★줄을 누르면 무슨 일이 날지 몰랐다★ — PDF 는 새 탭에 열리고 ZIP·PPTX 는
 *     내려받혔다. 같은 모양의 줄이 형식에 따라 다르게 움직였다. 동작을 이름으로 꺼낸다:
 *     「보기」(열리는 형식에만 있다) · 「내려받기」(늘 있다). ★줄 자체는 누르는 것이
 *     아니다★ — 못 하는 것은 자리를 비워 두는 것이 아니라 단추가 없는 것으로 보인다.
 *  4. ★이 화면만 남의 앱처럼 생겼었다★ — gray·xs/sm·자체 칩·자체 단추를 썼다. 포털용으로
 *     만든 것이 콘솔에 그대로 들어와서다. 두 곳이 다 쓰는 말투(slate·tiny/small·Btn)로
 *     맞춘다 — 포털 머리글도 이미 slate 다. 감싸는 쪽이 배경과 제목을 갖고, 이 부품은
 *     목록만 갖는다.
 *  5. ★「최신인가」에 답하지 않았다★ — 파일명에 rev.11·v1.9·_260325 가 박혀 있는데 날짜는
 *     잔글씨였고, 문서일과 올린 날이 이름 없이 같은 자리에 뭉쳐 있었다. 이름을 붙여 가른다.
 *
 * 분류 칩은 걷었다 — 소제목이 이미 그 일을 한다. 분류가 ★일의 순서★라(영업 → 법인 →
 * 업체·보험 → 착공·안전 → 인허가·전기 → 설치·준공) 고르는 것보다 훑는 것이 빠르다.
 * 검색은 남긴다: 지금 규모에는 과하지만 자료가 늘어날 자리이고, 「사업자등록증이 어디
 * 있더라」처럼 분류를 모르고 찾는 일이 실제로 있다.
 */
import { useMemo, useState } from 'react';
import type { MaterialFile, MaterialGroup } from '@/lib/materials-meta';
import { Blank, Btn, BtnLink, FIELD_BASE } from '@/components/ui';

/** 확장자 꼬리표 색 — 형식을 한눈에 가른다. 제목보다 세면 안 되므로 작게 쓴다 */
const EXT_STYLES: Record<string, string> = {
  PDF: 'bg-red-50 text-red-600 border-red-100',
  ZIP: 'bg-amber-50 text-amber-700 border-amber-100',
  DOC: 'bg-blue-50 text-blue-600 border-blue-100',
  DOCX: 'bg-blue-50 text-blue-600 border-blue-100',
  XLS: 'bg-green-50 text-green-700 border-green-100',
  XLSX: 'bg-green-50 text-green-700 border-green-100',
  PPT: 'bg-orange-50 text-orange-600 border-orange-100',
  PPTX: 'bg-orange-50 text-orange-600 border-orange-100',
  HWP: 'bg-sky-50 text-sky-700 border-sky-100',
};
const extStyle = (ext: string) => EXT_STYLES[ext] ?? 'bg-slate-100 text-slate-500 border-slate-200';

/** 브라우저가 새 탭에서 바로 보여줄 수 있는 형식 — 나머지는 「보기」 자체가 없다 */
const PREVIEWABLE = new Set(['PDF', 'PNG', 'JPG', 'JPEG', 'GIF', 'WEBP']);

/**
 * 「새로 올라옴」 — ★마지막 갱신 때 들어온 것★.
 *
 * 오늘을 기준으로 세지 않는다. 서버와 브라우저의 시계가 갈리면 처음 그린 화면과 어긋나고,
 * 무엇보다 자료실은 한 번에 여럿을 올린다 — 가장 최근 파일에서 이 날수 안에 든 것을
 * 「이번에 들어온 것」으로 본다. ★그것이 절반을 넘으면 아예 안 붙인다★: 전부가 새것이면
 * 새것이라는 말이 뜻이 없다(처음 채운 자료실이 그렇다).
 */
const FRESH_WINDOW_DAYS = 7;

function matches(file: MaterialFile, groupLabel: string, categoryLabel: string, q: string) {
  if (!q) return true;
  const haystack = [file.title, file.fileName, groupLabel, categoryLabel].join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((term) => haystack.includes(term));
}

export default function MaterialsBrowser({ groups }: { groups: MaterialGroup[] }) {
  const [query, setQuery] = useState('');
  /** null 이면 전체 — 탭 하나가 운영사 하나다 */
  const [tab, setTab] = useState<string | null>(null);

  const total = groups.reduce((n, g) => n + g.fileCount, 0);

  const fresh = useMemo(() => {
    const all = groups.flatMap((g) => g.categories.flatMap((c) => c.files));
    if (all.length === 0) return new Set<string>();
    const newest = Math.max(...all.map((f) => f.uploadedAt));
    const cut = newest - FRESH_WINDOW_DAYS * 86_400_000;
    const keys = all.filter((f) => f.uploadedAt >= cut).map((f) => f.pathname);
    return keys.length * 2 < all.length ? new Set(keys) : new Set<string>();
  }, [groups]);

  /* 검색만 먹인 것 — 탭 건수는 「눌렀을 때 나올 수」여야 한다 */
  const searched = useMemo(
    () => groups.map((g) => ({
      ...g,
      categories: g.categories
        .map((c) => ({ ...c, files: c.files.filter((f) => matches(f, g.label, c.label, query)) }))
        .filter((c) => c.files.length > 0),
    })).map((g) => ({ ...g, fileCount: g.categories.reduce((n, c) => n + c.files.length, 0) })),
    [groups, query]
  );

  const shown = tab === null ? searched.filter((g) => g.fileCount > 0) : searched.filter((g) => g.key === tab);
  const resultCount = shown.reduce((n, g) => n + g.fileCount, 0);
  const filtering = Boolean(query) || tab !== null;

  const reset = () => { setQuery(''); setTab(null); };

  return (
    <div className="flex flex-col gap-4">
      {/*
        * 고르는 줄 하나 — 운영사 탭과 검색이 같은 줄에 선다. 상자로 감싸지 않는다:
        * 29건짜리 목록 위에 상자가 하나 더 서면 거르는 장치가 내용보다 커진다.
        * ★건수는 검색을 먹인 뒤의 수다★ — 눌렀을 때 나올 수를 미리 적는다.
        */}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-slate-200">
        <div className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist">
          {[{ key: null as string | null, label: '전체', count: resultCountOf(searched) },
            ...searched.map((g) => ({ key: g.key, label: g.label, count: g.fileCount }))].map((t) => (
              <button
                key={t.key ?? 'all'}
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={`-mb-px shrink-0 whitespace-nowrap rounded-t-ctl border-b-2 px-3.5 py-2 text-lead font-bold transition ${
                  tab === t.key
                    ? 'border-brand-600 text-brand-800'
                    : 'border-transparent text-slate-400 hover:bg-slate-50 hover:text-slate-600'
                }`}
              >
                {t.label}
                {/* 0건인 운영사도 자리를 지킨다 — 탭이 생겼다 사라지면 자리를 외울 수 없다 */}
                <span className={`ml-1.5 text-tiny font-semibold tabular-nums ${t.count === 0 ? 'text-slate-300' : 'text-slate-400'}`}>
                  {t.count}
                </span>
              </button>
            ))}
        </div>
        <div className="mb-2 flex items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="자료명 검색"
            aria-label="자료명 검색"
            className={`${FIELD_BASE} w-44`}
          />
          {filtering && (
            <span className="whitespace-nowrap text-tiny font-bold tabular-nums text-slate-400">
              {resultCount}건
            </span>
          )}
        </div>
      </div>

      {resultCount === 0 ? (
        <div className="flex flex-col gap-3">
          <Blank>{total === 0 ? '올라온 자료 0건' : '조건에 맞는 자료 0건'}</Blank>
          {/* 되돌릴 길을 그 자리에 둔다 — 거른 사람만 막다른 곳에 선다 */}
          {filtering && (
            <span className="text-center">
              <Btn size="sm" kind="quiet" onClick={reset}>전체 자료 보기</Btn>
            </span>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {shown.map((group) => (
            <section key={group.key} aria-label={group.label}>
              {/* 고른 탭이 곧 제목이다 — 전체를 볼 때만 운영사 이름을 적는다 */}
              {tab === null && (
                <h2 className="mb-1.5 flex items-baseline gap-2 text-base font-black text-slate-900">
                  {group.label}
                  <span className="text-tiny font-semibold tabular-nums text-slate-400">{group.fileCount}</span>
                </h2>
              )}
              <div className="rounded-box border border-slate-200 bg-white">
                {group.categories.map((category, i) => (
                  <div key={category.key} className={i > 0 ? 'border-t border-slate-100' : ''}>
                    {/*
                      ★분류 이름은 꼬리표가 아니라 구역 이름이다★ (한백 지적 2026-08-29
                      「글씨가 잘 안 보여」). micro(10px)·slate-400 으로 적어 놨는데, 그
                      등급은 단위·꼬리표 자리다(tailwind.config 의 눈금 설명). 자료를 찾는
                      사람이 맨 먼저 훑는 것이 이 줄이라 읽혀야 한다 — 띠를 깔아 구역을
                      가르고 글씨는 tiny·slate-600 으로 올린다. 제목(small·slate-900)보다
                      세지 않게 하는 일은 띠가 한다.
                    */}
                    <p className="border-b border-slate-100 bg-slate-50/80 px-3.5 py-1.5 text-tiny font-black tracking-[0.04em] text-slate-600">
                      {category.label}
                    </p>
                    <ul className="divide-y divide-slate-50">
                      {category.files.map((file) => (
                        <FileRow key={file.pathname} file={file} fresh={fresh.has(file.pathname)} />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

const resultCountOf = (groups: MaterialGroup[]) => groups.reduce((n, g) => n + g.fileCount, 0);

/**
 * 자료 한 줄 — 제목이 가장 세고, 동작은 오른쪽에 이름으로 선다.
 *
 * 날짜는 ★무슨 날짜인지 적는다★: 문서일(파일명에 박힌 그 문서의 날짜)과 올린 날은 다른
 * 사실이다. 예전에는 둘 중 하나를 이름 없이 보여줘서, 3월 문서가 8월에 올라온 것인지
 * 8월 문서인지 알 수 없었다.
 */
function FileRow({ file, fresh }: { file: MaterialFile; fresh: boolean }) {
  const canView = PREVIEWABLE.has(file.ext);
  return (
    <li className="flex items-center gap-3 px-3.5 py-2.5">
      <span className={`flex-none rounded-ctl border px-1.5 py-0.5 text-micro font-bold ${extStyle(file.ext)}`}>
        {file.ext || 'FILE'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="break-keep text-small font-bold leading-snug text-slate-900">{file.title}</span>
          {fresh && (
            <span className="rounded-tag bg-brand-50 px-1.5 py-0.5 text-micro font-bold text-brand-700">
              새로 올라옴
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-tiny text-slate-400">
          {[file.size, file.docDate ? `문서일 ${file.docDate}` : `올린 날 ${file.uploaded}`]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>
      {/* 열 수 없는 형식에는 「보기」가 아예 없다 — 눌러 보고 배우게 하지 않는다 */}
      <span className="flex flex-none items-center gap-1.5">
        {canView && (
          <BtnLink href={file.url} target="_blank" rel="noopener">보기</BtnLink>
        )}
        <BtnLink href={file.downloadUrl}>내려받기</BtnLink>
      </span>
    </li>
  );
}
