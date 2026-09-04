'use client';

/**
 * 시공 줄의 정본 — 줄 껍데기와 이름 열.
 *
 * ★오와열은 부품이 정한다★ (한백 지적 2026-09-04 「환경부 승인대기부터 준공완료까지
 * UI 좀 다 통일해줄래? 지금 오와열이 전혀 맞지 않는다」).
 *
 * 여섯 줄 부품(NeedRow·CheckRow·ModelRow·CountsRow·DateRow·DocRow)이 이름 폭·여백·
 * 틈을 자리마다 손으로 적고 있었다. 실제로 갈려 있던 값:
 *
 *   이름 폭     w-32 다섯 · w-52 하나   (2026-09-04 에 서류 줄만 넓혔다 — 그래서 더 어긋났다)
 *   세로 여백   py-2 다섯 · py-2.5 하나
 *   틈          gap-3 다섯 · gap-x-3 하나
 *   날짜 값 폭  입력칸 132px · 굳은 글자 150px  (고칠 수 있는지에 따라 뒤가 18px 밀렸다)
 *
 * 자리마다 적으면 한 줄을 고칠 때마다 나머지와 어긋난다 — 화면 규칙의 「부품에 추가한다」가
 * 이 자리다(components/ui.tsx 의 Th·Td 가 표에서 하는 일과 같다).
 */
import type { ReactNode } from 'react';

/**
 * 줄 껍데기 — 시공 줄은 모두 같은 여백·틈을 쓴다.
 *
 * gap-y-1 은 좁은 화면에서 접혔을 때의 줄 간격이다 — 안 주면 접힌 줄이 서로 붙는다.
 */
export const ROW = 'flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2 text-base';

/**
 * 오른쪽이 여러 층으로 쌓이는 줄(서류) — 이름을 위로 붙인다.
 *
 * items-center 로 두면 파일 목록이 길어질 때 이름이 그 세로 가운데로 끌려 내려간다
 * (2026-09-04 「서류 업로드하면 UI 가 틀어진다」의 원인).
 * relative 는 끌어다 놓는 덮개가 이 줄을 덮기 때문이다(DocFiles 의 DocUpload).
 */
export const ROW_STACK = 'relative flex items-start gap-x-3 px-3.5 py-2 text-base';

/**
 * 날짜 값 한 칸의 폭 — 입력칸(DatePicker)과 글자로 굳은 값이 같아야 그 뒤가 안 어긋난다.
 * 값을 고치려면 DatePicker 의 입력칸 폭도 같이 본다.
 */
export const DATE_CELL = 'w-[132px]';

/**
 * 줄의 이름 열.
 *
 * ★폭을 못 박는다★ — 줄이 여럿 늘어선 자리라 이름이 제각각 너비면 값·상태·날짜가
 * 줄마다 다른 자리에 선다. w-48(192px)은 가장 긴 이름 「전기안전관리자 선임신고증명서」
 * (13px × 15자 ≈ 186px)가 한 줄에 들어가는 폭이다 — w-32(128px)에서는 세 줄로 접혔다.
 * 더 긴 이름이 생기면 낱말에서 접히게 break-keep 을 준다(글자 중간에서 끊지 않는다).
 *
 * py-0.5 — 값 쪽 첫 줄 높이는 입력칸·단추가 정하고(약 28px) 이름은 글줄(20.8px)이라,
 * 그만큼 내려 글자 가운데를 값에 맞춘다. 쌓이는 줄(ROW_STACK)에서 특히 필요하다.
 *
 * ★strong 은 「사람이 선언하는 자리」다★ — 대상 고르기(NeedRow)와 완료 선언(CheckRow).
 * 그 줄은 값을 적는 자리가 아니라 단계를 넘기는 자리라, 이름이 무엇을 묻는지 먼저 읽혀야
 * 한다. 나머지(날짜·수량·모델·서류)는 값이 주인이라 이름을 뒤로 물린다.
 */
export function RowLabel({
  strong = false, children,
}: {
  strong?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={`w-48 shrink-0 break-keep py-0.5 leading-snug ${
        strong ? 'font-bold text-slate-700' : 'text-slate-500'
      }`}
    >
      {children}
    </span>
  );
}
