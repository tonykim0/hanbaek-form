'use client';

/**
 * 현장 보드 — 어떤 현장이 어느 단계에 있는가.
 *
 * 목록이 아니라 칸이다. 138건이 되면 「어느 단계가 막혀 있나」는 표를 훑어서는 안 보이고
 * 칸 높이로 한눈에 보인다.
 *
 * 옮기는 일 자체(요청·임시 위치·실패 처리)는 껍데기 ProjectsView 가 쥔다. 표에서도 같은
 * 동작을 쓰기 때문이다 — 두 벌로 두면 한쪽만 고쳐지는 일이 생긴다.
 *
 * 끌어다 놓으면 공정 단계가 바뀐다. 다만 아무 데나 놓을 수는 없다 —
 * 계약 칸은 서류·단가에서 유도되는 값이라 옮길 대상이 아니고, 공정 칸도 조건이 있다.
 * 놓을 수 없는 칸은 끌기 시작할 때 미리 흐려진다. 놓고 나서 거절당하는 것보다 낫다.
 */
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { ProjectSummary } from '@/types/project';
import { BOARD_COLUMNS, boardColumnOf, type BoardBand, type BoardColumn } from '@/lib/board';
import { Tag } from '@/components/ui';

/** 띠별 강조색 — 카드까지 색을 입히면 읽히지 않는다. 줄 머리글만 물들인다. */
const BAND_RULE: Record<BoardBand, string> = {
  계약: 'bg-sky-400',
  시공: 'bg-brand-400',
  멈춤: 'bg-slate-300',
};
const BAND_TEXT: Record<BoardBand, string> = {
  계약: 'text-sky-800',
  시공: 'text-brand-800',
  멈춤: 'text-slate-500',
};

export default function ProjectBoard({
  projects, band, busyId,
}: {
  /** 이미 걸러진 목록. 임시 위치도 반영돼 있다. */
  projects: ProjectSummary[];
  /**
   * 이 보드가 그리는 국면 — 계약 또는 시공.
   * 두 띠를 한 화면에 접어 넣던 때는 줄마다 높이가 반쪽이었다. 페이지를 국면별로
   * 나눴으므로(사이드바 계약/시공) 한 띠가 화면 전부를 쓴다 — 시공 단계를 더
   * 쪼개도 칸이 들어갈 자리가 생긴다.
   */
  band: '계약' | '시공';
  busyId: string | null;
}) {
  const columns = useMemo(() => {
    const byKey = new Map<BoardColumn, ProjectSummary[]>();
    for (const p of projects) {
      const key = boardColumnOf(p);
      const bucket = byKey.get(key);
      if (bucket) bucket.push(p);
      else byKey.set(key, [p]);
    }
    // 칸 안은 오래 멈춘 순 — 축은 아니지만 어느 것부터 볼지는 알려준다
    for (const list of byKey.values()) list.sort((a, b) => b.stalledDays - a.stalledDays);
    return byKey;
  }, [projects]);

  /*
   * 카드를 끌어 옮기지 않는다 — 스치는 끌기에 단계가 바뀐다(한백 확인).
   * 옮기는 자리는 표의 단계 셀렉트다. 보드는 보고, 눌러 들어가는 곳.
   */
  const visible = BOARD_COLUMNS.filter(
    // 보류는 멈춘 현장이 있을 때만 나타난다. 늘 비어 있는 칸은 자리만 먹는다.
    (c) => c.key !== '보류' || (columns.get('보류')?.length ?? 0) > 0
  );

  /*
   * 띠마다 줄을 바꾼다.
   *
   * 열한 칸을 한 줄로 늘어놓으면 창보다 넓어서 뒤쪽 칸이 화면 밖에 있다.
   * 「어떤 현장이 어느 단계인가」를 답할 화면인데 단계 절반이 안 보이면 답을 못 한다.
   * 줄로 끊고 그 줄 안에서 칸이 폭을 나눠 채운다(아래 gridTemplateColumns).
   *
   * 칸 안쪽은 따로 스크롤한다. 한 칸에 60건이 쌓여도 그 칸만 길어지고 아래 줄은
   * 제자리에 있어야 한다 — 안 그러면 계약 칸이 부풀어 시공 줄을 화면 밖으로 밀어낸다.
   */
  const bands: BoardBand[] = [band, '멈춤'];

  /*
   * 계약과 시공이 남은 높이를 반씩 쓴다.
   *
   * 예전에는 띠 높이가 그 띠의 가장 많은 칸에 딸려 있었다. 계약에 현장이 몰려 있으면
   * 계약 줄만 길어지고 시공 줄은 카드 한 장 높이로 납작해져서, 시공 칸에 카드를 끌어다
   * 놓을 자리조차 좁았다 — 두 줄의 높이가 「몇 건 있나」에 따라 매번 달라졌다.
   *
   * 위쪽 chrome(제목·필터 막대·본문 여백)이 13rem 쯤이라 그만큼 뺀다.
   * 창이 아주 낮으면 30rem 아래로는 줄이지 않고 그때는 페이지가 스크롤된다.
   *
   * 멈춤은 늘리지 않는다 — 나타날 때만 있는 줄이고, 세 줄을 똑같이 나누면
   * 보류 몇 건이 계약·시공과 같은 자리를 차지한다.
   */
  return (
    <div className="flex h-[calc(100vh-13rem)] min-h-[30rem] flex-col gap-6">
      {bands.map((band) => {
        const cols = visible.filter((c) => c.band === band);
        if (cols.length === 0) return null;
        const total = cols.reduce((n, c) => n + (columns.get(c.key)?.length ?? 0), 0);

        return (
          <section
            key={band}
            aria-label={`${band} 구역`}
            className={`flex min-h-0 flex-col ${band === '멈춤' ? 'shrink-0' : 'flex-1'}`}
          >
            <header className="mb-2 flex items-center gap-2.5">
              <span aria-hidden className={`h-[3px] w-6 rounded-full ${BAND_RULE[band]}`} />
              <h2 className={`text-tiny font-black tracking-[0.12em] ${BAND_TEXT[band]}`}>
                {band}
              </h2>
              <span className="text-tiny font-bold tabular-nums text-slate-400">{total}건</span>
            </header>

            {/*
              * 칸이 줄의 폭을 나눠 채운다.
              *
              * 예전에는 칸이 272px 고정이라 계약 5칸이 1400px 을 넘겼고, 창이 그보다 좁으면
              * 뒤쪽 칸이 화면 밖에 있었다 — 「어떤 현장이 어느 단계인가」를 답할 화면인데
              * 단계 절반이 안 보이면 답을 못 한다.
              *
              * minmax(200px, 1fr) 이라 넓은 창에서는 칸이 늘어 폭을 정확히 채우고,
              * 200px×칸수보다 좁아지면 그때만 이 줄이 가로로 밀린다.
              *
              * 칸 수가 줄마다 다르므로(계약 5 · 시공 5 · 멈춤 1) 인라인 스타일로 넘긴다 —
              * Tailwind 는 grid-cols-${n} 같은 동적 클래스를 만들지 못한다.
              *
              * 두 칸 이하인 줄은 늘리지 않는다. 「보류」 한 칸이 화면을 다 차지하면
              * 그게 이 화면에서 제일 중요한 것처럼 보인다.
              */}
            <div className="-mx-5 min-h-0 flex-1 overflow-x-auto px-5 pb-1 sm:-mx-6 sm:px-6">
              <div
                className="grid h-full gap-3"
                style={{
                  gridTemplateColumns: `repeat(${cols.length}, minmax(200px, ${
                    cols.length >= 3 ? '1fr' : '320px'
                  }))`,
                }}
              >
                {cols.map((col) => {
                  const list = columns.get(col.key) ?? [];
                  return (
                    <section
                      key={col.key}
                      aria-label={col.label}
                      className="flex min-h-0 min-w-0 flex-col rounded-panel border border-slate-200 bg-slate-50/60 p-2.5"
                    >
                      <header className="flex items-baseline justify-between gap-2 px-1.5 pb-2">
                        <h3 className="text-base font-black tracking-[-0.01em] text-slate-800">
                          {col.label}
                        </h3>
                        <span
                          className={`text-lead font-black tabular-nums ${
                            list.length > 0 ? 'text-slate-700' : 'text-slate-300'
                          }`}
                        >
                          {list.length}
                        </span>
                      </header>

                      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
                        {list.map((p) => (
                          <Card key={p.id} p={p} busy={busyId === p.id} />
                        ))}
                        {list.length === 0 && (
                          <p className="flex h-full items-center justify-center rounded-box border border-dashed border-slate-200 text-tiny text-slate-300">
                            없음
                          </p>
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

/**
 * 카드 한 장.
 *
 * ★카드 아무 데나 눌러도 현장으로 들어간다.★ 예전에는 현장명 글자만 링크였다 —
 * 카드가 눌리는 물건처럼 생겼는데 정작 글자를 맞춰 눌러야 했다.
 * 키보드로도 들어갈 수 있게 role·tabIndex·Enter 를 둔다.
 */
function Card({ p, busy }: { p: ProjectSummary; busy: boolean }) {
  const router = useRouter();
  const qty = p.lines.reduce((sum, l) => sum + l.qty, 0);
  const org = p.salesOrg ?? p.gcOrg;
  // 계약연수는 라인마다 다를 수 있다 — 「7·10년」처럼 둘 다 적는다
  const terms = [...new Set(p.lines.map((l) => l.termYears))].sort((a, b) => a - b);

  return (
    <article
      role="link"
      tabIndex={0}
      aria-label={`${p.name} 상세`}
      onClick={() => router.push(`/projects/${p.id}`)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          router.push(`/projects/${p.id}`);
        }
      }}
      className={`cursor-pointer rounded-box border border-slate-200 bg-white p-2.5 text-left transition hover:border-brand-300 hover:bg-brand-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${busy ? 'opacity-50' : ''}`}
    >
      <p className="break-keep text-lead font-bold leading-snug text-slate-900">{p.name}</p>
      <p className="mt-1 text-tiny leading-snug text-slate-500">
        {p.cpo} · {qty}대{terms.length ? ` · ${terms.join('·')}년` : ''}
      </p>
      {org && <p className="text-tiny leading-snug text-slate-400">{org}</p>}

      <div className="mt-2 flex flex-wrap items-center gap-1">
        {p.rejectedDocs > 0 && (
          <Tag tone="stop">반려 {p.rejectedDocs}</Tag>
        )}
        {!p.priced && (
          <Tag>단가 미지정</Tag>
        )}
        {p.holdState && (
          <Tag tone="hold">{p.holdState}</Tag>
        )}
        {p.stalledDays >= 14 && (
          <span
            className={`ml-auto text-micro font-black tabular-nums ${
              p.stalledDays >= 30 ? 'text-red-700' : 'text-amber-700'
            }`}
            title="마지막 진척 후 경과일"
          >
            {p.stalledDays}일
          </span>
        )}
      </div>
    </article>
  );
}
