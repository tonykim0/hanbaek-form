'use client';

/**
 * 접수 폼의 부품 — 상자·칸·판독 짚은 것·미리보기·대수 격자·고르개.
 *
 * 폼 본체에서 떼어 둔다. 여기 있는 것은 「어떻게 보이는가」뿐이라 상태를 모른다 —
 * 값과 바꾸는 길은 전부 프롭으로 온다.
 */
import type { ChangeEvent, ReactNode } from 'react';
import { FIELD, Picks } from '@/components/ui';
import type { DocFinding } from '@/types/intake-auto';

export function Card({
  title, note, children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-3">
        <h2 className="text-base font-black tracking-[-0.02em] text-slate-900">{title}</h2>
        {note && <p className="mt-0.5 text-tiny text-slate-400">{note}</p>}
      </div>
      {children}
    </section>
  );
}

export function Field({
  label, required, hint, span, auto, children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  span?: boolean;
  /** 판독이 채운 칸 — 사람이 고치면 표시가 사라진다 */
  auto?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${span ? 'sm:col-span-2' : ''}`}>
      <span className="mb-1 flex items-baseline gap-1.5 text-tiny font-bold tracking-[0.06em] text-slate-400">
        {label}
        {required && <span className="text-red-500">*</span>}
        {auto && (
          <span className="rounded bg-brand-100 px-1 py-0.5 text-[9px] font-bold text-brand-800">
            판독
          </span>
        )}
      </span>
      {children}
      {hint && <span className="mt-1 block text-tiny text-slate-400">{hint}</span>}
    </label>
  );
}

/**
 * 서류 한 장의 검수 결과.
 *
 * 문제가 없으면 「확인됨」한 줄이다. 있으면 무엇이 어떻게 문제인지 그대로 적는다 —
 * 「확인 필요」만 띄우면 원본을 다 열어봐야 한다.
 */
export function Finding({ finding }: { finding: DocFinding }) {
  if (!finding.checked) {
    return <p className="mt-1.5 text-micro text-slate-400">검수하지 못했습니다</p>;
  }
  if (finding.ok) {
    return (
      <p className="mt-1.5 text-micro font-bold text-brand-700">이상없음</p>
    );
  }
  return (
    <ul className="mt-1.5 flex flex-col gap-0.5">
      {finding.issues.map((x) => (
        <li key={x} className="text-micro leading-snug text-amber-900">
          · {x}
        </li>
      ))}
    </ul>
  );
}

/**
 * 올린 서류 열어보기.
 *
 * ZIP 에서 나온 것은 이미 Blob 에 있어서 주소를 그대로 열면 된다.
 * 손으로 고른 것은 아직 안 올라갔으므로 브라우저 안에서만 주소를 만들어 연다 —
 * 접수 전에도 「내가 넣은 게 이게 맞나」를 확인할 수 있어야 한다.
 *
 * 만든 주소는 새 탭이 읽은 뒤에 되돌린다. 바로 지우면 탭이 빈 화면을 띄운다.
 */
export function Preview({ url }: { url: string }) {
  function open() {
    window.open(url, '_blank', 'noopener');
  }

  return (
    <button
      type="button"
      onClick={open}
      className="mt-1 text-tiny font-bold text-brand-700 underline-offset-2 transition hover:underline"
    >
      미리보기
    </button>
  );
}

/**
 * 대수 입력 칸.
 *
 * 행이 교체유형, 열이 수전방식이다. 축이 하나뿐이면 칸도 하나만 나온다 —
 * 표를 억지로 그리면 「환경부 신규 × 한전불입」 한 칸에 머리글이 둘 붙어 읽기 어렵다.
 */
/*
 * 행 타입을 제네릭으로 받는다 — 예전에는 `keyOf: (row: never, col: never)` 라서 부르는 쪽마다
 * `as never` 를 붙여야 했다. 캐스팅은 타입 검사를 끄는 일이라, 행 종류가 바뀌어도 안 걸린다.
 */
export function QtyGrid<R extends string>({
  rows, cols, value, keyOf, onChange, rowLabel,
}: {
  rows: R[];
  cols: Array<string | null>;
  value: Record<string, number>;
  keyOf: (row: R, col: string | null) => string;
  onChange: (key: string, n: number) => void;
  /** 행 이름 — 키는 그대로 두고 보이는 말만 바꾼다(교체유형을 안 가르는 운영사) */
  rowLabel?: (row: R) => string;
}) {
  const single = rows.length === 1 && cols.length === 1;
  const num = (e: React.ChangeEvent<HTMLInputElement>) =>
    Number(e.target.value.replace(/\D/g, '') || 0);

  if (single) {
    const k = keyOf(rows[0], cols[0]);
    return (
      <span className="flex items-baseline gap-1.5">
        <input
          value={value[k] || ''}
          inputMode="numeric"
          placeholder="3"
          onChange={(e) => onChange(k, num(e))}
          className={FIELD}
        />
        <span className="shrink-0 text-sm text-slate-400">기</span>
      </span>
    );
  }

  const total = rows.reduce(
    (n, r) => n + cols.reduce((m, c) => m + (value[keyOf(r, c)] ?? 0), 0),
    0
  );

  return (
    /*
     * 좁은 화면에서는 옆으로 흐른다 (2026-08-27) — 겸용(한전불입+모자분리) 현장은 열이
     * 늘어나는데, overflow-hidden 만 두었더니 스크롤이 아니라 ★잘려 나갔다★. 대수 칸이
     * 화면 밖으로 밀린 줄 모른 채 접수되면 대수가 빠진 계약이 된다.
     * 둥근 모서리를 지키는 겉과 흐르는 속을 나눈다 — 한 겹에 둘을 주면 세로 스크롤이 딸려온다.
     */
    <div className="overflow-hidden rounded-xl border border-slate-200">
     <div className="overflow-x-auto">
      <table className="w-full text-sm">
        {cols.length > 1 && (
          <thead className="bg-slate-50 text-tiny font-bold text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left" />
              {cols.map((c) => (
                <th key={c ?? '-'} className="px-3 py-2 text-left">{c}</th>
              ))}
            </tr>
          </thead>
        )}
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r}>
              <th className="w-[150px] px-3 py-2 text-left text-small font-bold text-slate-600">
                {(rowLabel ? rowLabel(r) : r).replace('자체투자 ', '').replace(/[()]/g, '')}
              </th>
              {cols.map((c) => {
                const k = keyOf(r, c);
                return (
                  <td key={c ?? '-'} className="px-3 py-2">
                    <span className="flex items-baseline gap-1">
                      <input
                        value={value[k] || ''}
                        inputMode="numeric"
                        placeholder="0"
                        onChange={(e) => onChange(k, num(e))}
                        className="w-[72px] rounded-lg border border-slate-200 px-2 py-1 text-sm tabular-nums text-slate-900 placeholder:text-slate-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                      />
                      <span className="text-small text-slate-400">기</span>
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
     </div>
      <p className="border-t border-slate-100 bg-slate-50 px-3 py-1.5 text-tiny font-bold text-slate-500">
        합계 <span className="tabular-nums text-slate-800">{total}</span>기
      </p>
    </div>
  );
}

export function Select({
  value, onChange, options, blank,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  blank?: boolean;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={FIELD}>
      {blank && <option value="">선택</option>}
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

/** 이미 쓰이는 업체 이름 — 눌러서 넣는다. 계정에 있는 것이 먼저 온다. */
export function OrgPicks({ names, onPick }: { names: string[]; onPick: (v: string) => void }) {
  return <Picks options={names} onPick={onPick} className="mt-1.5" />;
}

