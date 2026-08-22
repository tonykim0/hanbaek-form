'use client';

import { useMemo, useState } from 'react';
import type { MaterialFile, MaterialGroup } from '@/lib/materials-meta';

/** 확장자별 배지 색 — 목록에서 형식을 한눈에 구분하기 위한 것 */
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

function extStyle(ext: string): string {
  return EXT_STYLES[ext] ?? 'bg-gray-100 text-gray-500 border-gray-200';
}

/**
 * 브라우저가 새 탭에서 바로 보여줄 수 있는 형식.
 * 줄을 누르면 곧장 내려받는 대신 열어 본다 — 처음 온 사람은 「받은 파일이 어디 갔지」보다
 * 화면에 뜨는 쪽이 이해가 빠르다. 못 보여주는 형식(ZIP·HWP 등)은 눌러도 내려받기다.
 */
const PREVIEWABLE = new Set(['PDF', 'PNG', 'JPG', 'JPEG', 'GIF', 'WEBP']);

function matches(file: MaterialFile, groupLabel: string, categoryLabel: string, q: string) {
  if (!q) return true;
  const haystack = [file.title, file.fileName, groupLabel, categoryLabel]
    .join(' ')
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

export default function MaterialsBrowser({ groups }: { groups: MaterialGroup[] }) {
  const [query, setQuery] = useState('');
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  /**
   * 분류 칩은 지금 고른 충전사업자 안에서 실제로 있는 분류만, 건수와 함께.
   * 사업자를 바꿔 그 분류가 사라지면 칩째 사라지고 아래 effectiveCategory 가 전체로 되돌린다.
   */
  const categories = useMemo(() => {
    const seen = new Map<string, { label: string; count: number }>();
    for (const g of groups) {
      if (activeGroup && g.key !== activeGroup) continue;
      for (const c of g.categories) {
        const cur = seen.get(c.key) ?? { label: c.label, count: 0 };
        cur.count += c.files.length;
        seen.set(c.key, cur);
      }
    }
    return [...seen.entries()].map(([key, v]) => ({ key, ...v }));
  }, [groups, activeGroup]);

  const effectiveCategory = categories.some((c) => c.key === activeCategory)
    ? activeCategory
    : null;

  const filtered = useMemo(() => {
    return groups
      .filter((g) => !activeGroup || g.key === activeGroup)
      .map((g) => ({
        ...g,
        categories: g.categories
          .filter((c) => !effectiveCategory || c.key === effectiveCategory)
          .map((c) => ({
            ...c,
            files: c.files.filter((f) => matches(f, g.label, c.label, query)),
          }))
          .filter((c) => c.files.length > 0),
      }))
      .map((g) => ({
        ...g,
        fileCount: g.categories.reduce((sum, c) => sum + c.files.length, 0),
      }))
      .filter((g) => g.fileCount > 0);
  }, [groups, activeGroup, effectiveCategory, query]);

  const resultCount = filtered.reduce((sum, g) => sum + g.fileCount, 0);

  const chipBase = 'flex-none rounded-ctl border px-3 py-1.5 text-xs font-bold transition';
  const chipOn = 'border-brand-600 bg-brand-600 text-white';
  const chipOff =
    'border-gray-200 bg-white text-gray-600 hover:border-brand-300 hover:text-brand-700';

  return (
    <div className="flex flex-col gap-4">
      {/* 검색 · 필터 */}
      <div className="bg-white border border-gray-200 rounded-panel shadow-sm p-4 flex flex-col gap-3">
        <div className="relative">
          <span
            aria-hidden
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 text-sm"
          >
            ⌕
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="자료명 검색 (예: 시방서, 제안서, 인증서)"
            className="w-full border border-gray-200 rounded-ctl pl-8 pr-3 py-2.5 text-sm placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-300"
          />
        </div>

        {/* 칩 줄마다 무엇을 고르는 것인지 이름을 붙인다 — 처음 온 사람은 회사 이름만으로는 못 고른다 */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          <span className="w-16 flex-none text-tiny font-bold text-gray-400">충전사업자</span>
          <button
            type="button"
            onClick={() => setActiveGroup(null)}
            className={`${chipBase} ${activeGroup === null ? chipOn : chipOff}`}
          >
            전체
          </button>
          {groups.map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => setActiveGroup(g.key === activeGroup ? null : g.key)}
              className={`${chipBase} ${activeGroup === g.key ? chipOn : chipOff}`}
            >
              {g.label}
              <span
                className={`ml-1.5 tabular-nums ${
                  activeGroup === g.key ? 'text-brand-100' : 'text-gray-400'
                }`}
              >
                {g.fileCount}
              </span>
            </button>
          ))}
        </div>

        {categories.length > 1 && (
          <div className="flex items-center gap-1.5 overflow-x-auto border-t border-gray-100 pt-3">
            <span className="w-16 flex-none text-tiny font-bold text-gray-400">자료 종류</span>
            <button
              type="button"
              onClick={() => setActiveCategory(null)}
              className={`${chipBase} ${effectiveCategory === null ? chipOn : chipOff}`}
            >
              전체
            </button>
            {categories.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setActiveCategory(c.key === effectiveCategory ? null : c.key)}
                className={`${chipBase} ${effectiveCategory === c.key ? chipOn : chipOff}`}
              >
                {c.label}
                <span
                  className={`ml-1.5 tabular-nums ${
                    effectiveCategory === c.key ? 'text-brand-100' : 'text-gray-400'
                  }`}
                >
                  {c.count}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {(query || activeGroup || effectiveCategory) && (
        <p className="text-xs text-gray-400 px-1">
          {resultCount > 0 ? `${resultCount}개 자료` : '조건에 맞는 자료가 없습니다'}
        </p>
      )}

      {filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-panel shadow-sm p-8 text-center">
          <p className="text-sm text-gray-500">조건에 맞는 자료가 없습니다.</p>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setActiveGroup(null);
              setActiveCategory(null);
            }}
            className="mt-3 rounded-ctl border border-gray-200 px-3 py-1.5 text-sm font-bold text-brand-700 transition hover:border-brand-300"
          >
            전체 자료 보기
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filtered.map((group) => (
            <section
              key={group.key}
              className="bg-white border border-gray-200 rounded-panel shadow-sm overflow-hidden"
            >
              <div className="flex items-center gap-2 px-4 sm:px-5 py-3 border-b border-gray-100">
                <h2 className="text-sm font-bold text-gray-900">{group.label}</h2>
                <span className="text-xs text-gray-400 tabular-nums">{group.fileCount}</span>
              </div>

              {group.categories.map((category) => (
                <div key={category.key} className="border-b border-gray-100 last:border-0">
                  <p className="px-4 sm:px-5 pt-3 pb-1 text-tiny font-semibold tracking-wide text-gray-400">
                    {category.label}
                  </p>
                  <ul>
                    {category.files.map((file) => {
                      const previewable = PREVIEWABLE.has(file.ext);
                      return (
                        <li key={file.pathname}>
                          <div className="group flex items-center gap-3 px-4 sm:px-5 py-3 transition hover:bg-brand-50/50">
                            <a
                              href={previewable ? file.url : file.downloadUrl}
                              target={previewable ? '_blank' : undefined}
                              rel={previewable ? 'noopener' : undefined}
                              title={previewable ? '새 창에서 보기' : undefined}
                              className="flex min-w-0 flex-1 items-center gap-3"
                            >
                              <span
                                className={`flex-none w-11 h-11 rounded-ctl border flex items-center justify-center text-micro font-bold ${extStyle(
                                  file.ext
                                )}`}
                              >
                                {file.ext || 'FILE'}
                              </span>

                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-medium text-gray-900 break-keep leading-snug group-hover:text-brand-800">
                                  {file.title}
                                </span>
                                <span className="block text-xs text-gray-400 mt-0.5">
                                  {[
                                    file.size,
                                    file.docDate ? `문서일 ${file.docDate}` : file.uploaded,
                                  ]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </span>
                              </span>
                            </a>

                            {/* 받는 자리는 글자로 — 아이콘 하나는 눌러도 되는지부터 헷갈린다 */}
                            <a
                              href={file.downloadUrl}
                              className="flex-none rounded-ctl border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-600 transition hover:border-brand-400 hover:bg-white hover:text-brand-700"
                            >
                              내려받기
                            </a>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
