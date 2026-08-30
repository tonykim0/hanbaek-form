'use client';

/**
 * 접수 폼의 서류 구역 — 필수·조건부·선택으로 갈라, 칸마다 파일을 받는다.
 *
 * 「무엇이 필요한가」는 lib/doc-rules 가 정하고(docs 프롭), 여기서는 그 목록을 그린다.
 * 올리는 절차는 lib/intake-upload 가 안다 — 이 부품은 고른 파일을 onPick 으로 넘길 뿐이다.
 */
import { Finding, Preview } from './parts';
import type { EvaluatedDoc } from '@/lib/doc-rules';
import type { DocReview } from '@/types/intake-auto';

/**
 * 서류를 세 묶음으로 나눈다.
 *
 * 필수만 접수를 막는다. 한 그리드에 16칸을 늘어놓으면 무엇이 접수를 막는지 배지를
 * 하나씩 읽어야 알 수 있어서, 막는 것과 아닌 것을 자리로 갈랐다.
 */
const DOC_SECTIONS = [
  { req: 'm' as const, label: '필수', rule: 'bg-red-400', note: '없으면 접수되지 않습니다' },
  { req: 'c' as const, label: '조건부', rule: 'bg-amber-400', note: '해당되면 냅니다' },
  { req: 'o' as const, label: '선택', rule: 'bg-slate-300', note: '있으면 함께 냅니다' },
];

export function DocSection({
  docs, check, issueCount, review, staged, picking, onPick, onRemove,
}: {
  docs: EvaluatedDoc[];
  check: { satisfiedCount: number; requiredCount: number };
  issueCount: number;
  review: DocReview | null;
  /** title — 판독기가 읽은 문서 제목. ZIP 에서 온 칸에만 있다 */
  staged: Record<string, { filename: string; blobUrl: string; title?: string | null }>;
  picking: Record<string, number>;
  onPick: (kind: string, file: File) => void;
  onRemove: (kind: string) => void;
}) {
  return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-base font-black tracking-[-0.02em] text-slate-900">서류</h2>
        <p className="text-small font-bold text-slate-500">
          필수 <span className="tabular-nums text-slate-900">{check.satisfiedCount}</span>
          <span className="text-slate-300"> / </span>
          <span className="tabular-nums">{check.requiredCount}</span>
          {issueCount > 0 && (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-tiny text-amber-900">
              확인 필요 {issueCount}
            </span>
          )}
        </p>
      </div>

      {/* 얼마나 남았는지는 숫자보다 길이로 먼저 읽힌다 */}
      <div className="mb-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-brand-500 transition-[width]"
          style={{
            width: `${check.requiredCount === 0 ? 100 : Math.round((check.satisfiedCount / check.requiredCount) * 100)}%`,
          }}
        />
      </div>
      <p className="mb-4 text-tiny leading-relaxed text-slate-400">
        {review
          ? '올린 서류를 한 장씩 읽어 확인했습니다. 짚은 것이 있으면 그 칸에 적혀 있습니다 — 접수를 막지는 않습니다.'
          : '운영사·계약주체·수전방식에 따라 필요한 서류가 바뀝니다. 파일은 접수가 끝난 뒤 이어서 올라갑니다.'}
      </p>

      <div className="flex flex-col gap-5">
        {DOC_SECTIONS.map((sec) => {
          const list = docs.filter((d) => d.req === sec.req);
          if (list.length === 0) return null;
          const done = list.filter((d) => staged[d.key]).length;
          return (
            <div key={sec.req}>
              <div className="mb-2 flex items-baseline gap-2">
                <span className={`h-[3px] w-5 rounded-full ${sec.rule}`} />
                <h3 className="text-tiny font-black tracking-[0.1em] text-slate-500">
                  {sec.label}
                </h3>
                <span className="text-tiny font-bold tabular-nums text-slate-400">
                  {done}/{list.length}
                </span>
                <span className="text-tiny text-slate-400">{sec.note}</span>
              </div>

              <div className="grid gap-2 lg:grid-cols-2">
                {list.map((d) => {
                  const filled = staged[d.key];
                  const uploading = picking[d.key];
                  const finding = review?.findings.find((f) => f.kind === d.key);
                  const flagged = finding !== undefined && !finding.ok;
                  const missing = !filled && d.req === 'm';

                  return (
                    <div
                      key={d.key}
                      className={`flex gap-2.5 rounded-xl border border-l-[3px] p-3 transition ${
                        flagged
                          ? 'border-slate-200 border-l-amber-500 bg-amber-50/50'
                          : filled
                            ? 'border-slate-200 border-l-brand-500 bg-white'
                            : missing
                              ? 'border-slate-200 border-l-red-400 bg-white'
                              : 'border-dashed border-slate-200 border-l-slate-200 bg-white'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-baseline gap-x-1.5 break-keep text-base font-bold leading-snug text-slate-800">
                          {d.label}
                          {d.ext && (
                            <span className="text-micro font-bold text-slate-400">{d.ext}</span>
                          )}
                        </p>

                        {uploading !== undefined ? (
                          <div className="mt-1.5">
                            <div className="h-1 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full bg-brand-500 transition-[width]"
                                style={{ width: `${uploading}%` }}
                              />
                            </div>
                            <p className="mt-1 text-tiny font-bold text-brand-700">
                              올리는 중 {uploading}%
                            </p>
                          </div>
                        ) : filled ? (
                          <>
                            <p
                              className="mt-1 truncate text-tiny text-slate-500"
                              title={filled.filename}
                            >
                              {filled.filename}
                            </p>
                            {/*
                              ★판독기가 읽은 제목 (한백 2026-08-31).★ 목표는 「파일을 하나하나
                              열어보는 걸 최소화하는 것」이다. 칸 이름 바로 아래에 읽은 제목이
                              서면, 「합의서」 칸에 「전기차 등록대수 확인 공문」이 앉은 것이
                              그 자리에서 보인다 — 열지 않고도.

                              ★맞다/틀리다를 적지 않는다.★ 읽은 것 그대로다. 판정을 하면
                              틀린 판정이 생기고, 틀린 지적은 없는 것보다 나쁘다(접수 검수를
                              껐던 이유가 그것이다). 사람이 두 줄을 견주면 1초다.

                              파일명과 같으면 적지 않는다 — 같은 말을 두 번 두지 않는다(규칙 5).
                            */}
                            {filled.title && !filled.filename.includes(filled.title) && (
                              <p className="mt-0.5 truncate text-tiny text-slate-400" title={filled.title}>
                                읽은 제목 <span className="text-slate-600">{filled.title}</span>
                              </p>
                            )}
                          </>
                        ) : (
                          <p
                            className={`mt-1 text-tiny font-bold ${
                              missing ? 'text-red-700' : 'text-slate-300'
                            }`}
                          >
                            {missing ? '미제출' : '없음'}
                          </p>
                        )}

                        {finding && <Finding finding={finding} />}
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <label className="inline-flex cursor-pointer items-center rounded-lg border border-slate-300 bg-white px-2 py-1 text-tiny font-bold text-slate-700 transition hover:border-brand-400 hover:text-brand-800">
                          {filled ? '바꾸기' : '고르기'}
                          <input
                            type="file"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              e.target.value = ''; // 같은 파일을 다시 고를 수 있게 비운다
                              if (f) onPick(d.key, f);
                            }}
                          />
                        </label>
                        {filled && <Preview url={filled.blobUrl} />}
                        {/*
                          * ZIP 자동분류가 엉뚱한 칸에 넣는 일이 있다. 바꿀 파일이 따로
                          * 없으면 비우는 길이 있어야 한다 — 아직 접수 전이라 화면에서만 뺀다.
                          * 임시본은 사흘 뒤 청소가 걷어간다(lib/intake-stage).
                          */}
                        {filled && (
                          <button
                            type="button"
                            onClick={() => onRemove(d.key)}
                            className="text-tiny font-bold text-slate-400 underline decoration-slate-300 transition hover:text-red-700"
                          >
                            빼기
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
