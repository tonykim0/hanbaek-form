'use client';

/**
 * 접수 폼의 서류 구역 — 필수·조건부·선택으로 갈라, 칸마다 파일을 받는다.
 *
 * 「무엇이 필요한가」는 lib/doc-rules 가 정하고(docs 프롭), 여기서는 그 목록을 그린다.
 * 올리는 절차는 lib/intake-upload 가 안다 — 이 부품은 고른 파일을 onPick 으로 넘길 뿐이다.
 */
import { Finding, Preview } from './parts';
import type { StagedFile } from '@/components/IntakeForm';
import { PANEL, Tag } from '@/components/ui';
import type { EvaluatedDoc } from '@/lib/doc-rules';
import type { DocReview } from '@/types/intake-auto';

/**
 * 서류를 세 묶음으로 나눈다.
 *
 * 필수만 접수를 막는다. 한 그리드에 16칸을 늘어놓으면 무엇이 접수를 막는지 배지를
 * 하나씩 읽어야 알 수 있어서, 막는 것과 아닌 것을 자리로 갈랐다.
 */
const DOC_SECTIONS = [
  { req: 'm' as const, label: '필수', note: '없으면 접수되지 않습니다' },
  { req: 'c' as const, label: '조건부', note: '해당되면 냅니다' },
  { req: 'o' as const, label: '선택', note: '있으면 함께 냅니다' },
];

export function DocSection({
  docs, check, issueCount, review, staged, picking, onPick, onRemove,
}: {
  docs: EvaluatedDoc[];
  check: { satisfiedCount: number; requiredCount: number };
  issueCount: number;
  review: DocReview | null;
  /** 칸마다 올라간 파일들 — ★한 칸에 여러 장이 붙는다★ (2026-08-31) */
  staged: Record<string, StagedFile[]>;
  /** 올리는 중인 칸 — 몇 장째인지까지 들고 있다(여러 장을 한 번에 고를 수 있다) */
  picking: Record<string, { pct: number; done: number; total: number }>;
  onPick: (kind: string, files: File[]) => void;
  /** 장 단위로 뺀다 — 두 장 중 하나만 잘못 온 경우가 있다 */
  onRemove: (kind: string, index: number) => void;
}) {
  return (
    /*
     * ★계약 탭의 서류 구역과 같은 꼴이다★ (한백 지시 2026-08-31 「접수 UI 를 계약 페이지와
     * 통일」). 같은 서류를 두 화면에서 보는데 제목 크기·칸 수·상태 표시가 달라서, 접수에서
     * 본 칸과 상세에서 보는 칸이 같은 것인지 매번 다시 읽어야 했다.
     *
     * 안내문도 걷었다(화면 규칙 2) — 「운영사·계약주체에 따라 서류가 바뀝니다」는 화면이
     * 이미 하는 일이고(조건이 맞는 칸만 그린다), 「접수가 끝난 뒤 올라갑니다」는 사람이
     * 할 일이 아니다. 판독 결과 안내는 짚은 칸이 제자리에서 말한다.
     */
    <section className={`${PANEL} p-5`}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-h3 font-black text-slate-900">서류</h2>
          <span className="text-small font-bold tabular-nums text-slate-400">
            필수 {check.satisfiedCount}/{check.requiredCount}
          </span>
          {check.satisfiedCount < check.requiredCount && <Tag tone="warn">필수 서류 미충족</Tag>}
          {issueCount > 0 && <Tag tone="warn">확인 필요 {issueCount}</Tag>}
        </div>
      </div>

      {/* 얼마나 남았는지는 숫자보다 길이로 먼저 읽힌다 */}
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-brand-500 transition-[width]"
          style={{
            width: `${check.requiredCount === 0 ? 100 : Math.round((check.satisfiedCount / check.requiredCount) * 100)}%`,
          }}
        />
      </div>

      <div className="flex flex-col gap-5">
        {DOC_SECTIONS.map((sec) => {
          const list = docs.filter((d) => d.req === sec.req);
          if (list.length === 0) return null;
          const done = list.filter((d) => staged[d.key]).length;
          return (
            <div key={sec.req}>
              {/* 묶음 머리 — 계약 탭과 같은 꼴이다(색 막대는 걷었다: 칸 색이 이미 말한다) */}
              <div className="mb-2 flex items-baseline gap-2">
                <h3 className="text-tiny font-black tracking-[0.1em] text-slate-500">
                  {sec.label}
                </h3>
                {/* 필수의 수는 위 진행 막대가 말한다 — 같은 값을 두 번 두지 않는다(규칙 5) */}
                {sec.req !== 'm' && (
                  <span className="text-tiny font-bold tabular-nums text-slate-400">
                    {done}/{list.length}
                  </span>
                )}
                <span className="text-tiny text-slate-400">{sec.note}</span>
              </div>

              {/* 칸을 넷으로 — 계약 탭과 같다(그전에는 둘이라 같은 서류가 두 배로 커 보였다) */}
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {list.map((d) => {
                  const files = staged[d.key] ?? [];
                  const filled = files[0];
                  const uploading = picking[d.key];
                  const finding = review?.findings.find((f) => f.kind === d.key);
                  const flagged = (finding !== undefined && !finding.ok)
                    || Boolean(filled?.photo?.length)
                    /* 열람용 건축물대장도 짚은 것이다 — 제출용이 아니라 다시 받아야 한다 */
                    || files.some((f) => f.stamp === '열람용');
                  const missing = !filled && d.req === 'm';

                  return (
                    <div
                      key={d.key}
                      /*
                       * ★칸 전체를 물들인다 — 계약 탭과 같은 규칙이다★ (한백 지시 2026-08-31
                       * 「접수 UI 를 계약 페이지와 통일」). 여기는 왼쪽 3px 선으로 상태를
                       * 말하고 있었는데, 계약 탭이 이미 그 방식을 버렸다: 칸이 넷씩 늘어서면
                       * 가는 선은 안 보인다(2026-08-25). 층 순서로도 배경색이 테두리보다
                       * 앞이다(화면 규칙 1).
                       *
                       *   초록 — 냈다
                       *   빨강 — 필수인데 안 냈다  (접수를 막는다)
                       *   주황 — 짚은 것이 있다    (판독 지적 · 휴대폰 사진 · 열람용 대장)
                       *   무색 — 조건부·선택
                       */
                      className={`relative flex flex-col rounded-box border p-2.5 ${
                        flagged
                          ? 'border-amber-300 bg-amber-50'
                          : filled
                            ? 'border-brand-200 bg-brand-50'
                            : missing
                              ? 'border-red-200 bg-red-50'
                              : 'border-dashed border-slate-200 bg-white'
                      }`}
                    >
                      {/* 이름과 상태 — 계약 탭과 같은 줄 배치다 */}
                      <div className="flex items-start justify-between gap-2">
                        <p className="break-keep text-small font-bold leading-snug text-slate-800">
                          {d.label}
                          {d.ext && (
                            <span className="ml-1.5 text-micro font-bold text-slate-400">{d.ext}</span>
                          )}
                        </p>
                        <span className={`shrink-0 text-micro font-black ${
                          filled ? 'text-brand-700' : missing ? 'text-red-700' : 'text-slate-400'
                        }`}>
                          {/* 몇 장인지 상태 자리가 말한다 — 두 장이 왔는데 한 장으로 보이면 안 된다 */}
                          {filled ? (files.length > 1 ? `고름 ${files.length}장` : '고름')
                            : d.req === 'o' ? '해당없음' : '미제출'}
                        </span>
                      </div>

                      {uploading !== undefined ? (
                        <div className="mt-1.5">
                          <div className="h-1 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-brand-500 transition-[width]"
                              style={{ width: `${uploading.pct}%` }}
                            />
                          </div>
                          <p className="mt-1 text-tiny font-bold text-brand-700">
                            {/* 여러 장이면 몇 장째인지 적는다 — 한 장만 올라간 줄 알고 나가는 자리였다 */}
                            올리는 중 {uploading.total > 1 ? `${uploading.done + 1}/${uploading.total} · ` : ''}{uploading.pct}%
                          </p>
                        </div>
                      ) : files.length > 0 ? (
                        /*
                          ★장마다 한 줄이다★ (한백 지시 2026-08-31 — 수완지구 숲안에1차아파트에서
                          설치신청서가 두 장인데 옛것만 보였다). 한 줄로 접으면 두 번째 장이
                          화면에 없어서, 낸 사람과 보는 사람이 다른 서류를 이야기하게 된다.
                        */
                        <ul className="mt-1 flex flex-col gap-1">
                          {files.map((f, i) => (
                            <li key={f.blobUrl} className="min-w-0">
                              <span className="flex items-baseline gap-1.5">
                                {files.length > 1 && (
                                  <span className="shrink-0 text-micro font-bold tabular-nums text-slate-400">
                                    {i + 1}
                                  </span>
                                )}
                                <span className="truncate text-tiny text-slate-500" title={f.filename}>
                                  {f.filename}
                                </span>
                              </span>
                              {/*
                                판독기가 읽은 제목 — 칸 이름과 어긋나면 열지 않고도 보인다
                                (2026-08-31). 파일명이 이미 그 말을 하면 적지 않는다(규칙 5).
                              */}
                              {f.title && !f.filename.includes(f.title) && (
                                <span className="block truncate text-tiny text-slate-400" title={f.title}>
                                  읽은 제목 <span className="text-slate-600">{f.title}</span>
                                </span>
                              )}
                              {/* 스캔본이 아니라 사진으로 보인다 — 근거까지 적는다(lib/photo-check) */}
                              {f.photo?.length ? (
                                <span className="block text-tiny font-bold text-amber-700">
                                  휴대폰 사진으로 보임
                                  <span className="ml-1 font-normal text-amber-800/70">
                                    {f.photo.join(' · ')}
                                  </span>
                                </span>
                              ) : null}
                              {/*
                                열람용 건축물대장 — 표제부에 찍힌 글자를 판독이 옮긴 것이다.
                                제출용이 아니라 발급용을 다시 받아야 한다(한백 2026-09-04).
                              */}
                              {f.stamp === '열람용' ? (
                                <span className="block text-tiny font-bold text-amber-700">
                                  열람용
                                  <span className="ml-1 font-normal text-amber-800/70">
                                    제출용은 발급용이어야 합니다
                                  </span>
                                </span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : null}

                      {finding && <Finding finding={finding} />}

                      {/*
                        ★조작은 카드 아래 제 줄이다 — 계약 탭과 같다★ (한백 지시 2026-08-31).
                        오른쪽 세로 기둥에 쌓여 있었는데, 칸이 넷으로 좁아지면 이름이 설 자리를
                        먹는다. 되돌릴 수 없는 「빼기」는 반대쪽 끝이다(화면 규칙 8).
                      */}
                      <div className="mt-2 flex items-center gap-1.5 border-t border-slate-100 pt-2">
                        {/*
                          ★「추가」다 — 「바꾸기」가 아니다★ (2026-08-31). 예전에는 갈아치웠고,
                          그래서 두 장짜리 서류를 낼 길이 없었다. 지금은 쌓이므로 이름도 그렇게 적는다
                          (현장 상세의 서류 칸이 같은 이유로 「파일 추가」다).
                        */}
                        <label className="inline-flex cursor-pointer items-center rounded-ctl border border-slate-300 bg-white px-2 py-1 text-tiny font-bold text-slate-700 transition hover:border-brand-400 hover:text-brand-800">
                          {filled ? '파일 추가' : '고르기'}
                          {/*
                            ★한 번에 여러 장을 고른다★ (한백 지시 2026-09-04). 칸이 파일을
                            쌓는 자리인데 고르기는 한 장씩이라, 세 장짜리 사진대지를 세 번
                            눌러 올려야 했다 — 현장 상세의 서류 칸과 같게 맞춘다.
                          */}
                          <input
                            type="file"
                            multiple
                            className="hidden"
                            onChange={(e) => {
                              const picked = [...(e.target.files ?? [])];
                              e.target.value = ''; // 같은 파일을 다시 고를 수 있게 비운다
                              if (picked.length > 0) onPick(d.key, picked);
                            }}
                          />
                        </label>
                        {filled && <Preview url={filled.blobUrl} />}
                        {/*
                          * ZIP 자동분류가 엉뚱한 칸에 넣는 일이 있다. 바꿀 파일이 따로
                          * 없으면 비우는 길이 있어야 한다 — 아직 접수 전이라 화면에서만 뺀다.
                          * 임시본은 사흘 뒤 청소가 걷어간다(lib/intake-stage).
                          *
                          * ★장 단위로 뺀다★ — 두 장 중 하나만 잘못 온 경우에 칸을 통째로
                          * 비우면 멀쩡한 장까지 다시 올려야 한다. 여러 장이면 번호를 적는다.
                          */}
                        {files.length > 0 && (
                          <span className="ml-auto flex shrink-0 items-baseline gap-1.5">
                            {files.map((f, i) => (
                              <button
                                key={f.blobUrl}
                                type="button"
                                onClick={() => onRemove(d.key, i)}
                                title={`${f.filename} 을(를) 뺍니다`}
                                className="text-tiny font-bold text-slate-400 transition hover:text-red-700"
                              >
                                {files.length > 1 ? `${i + 1} 빼기` : '빼기'}
                              </button>
                            ))}
                          </span>
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
