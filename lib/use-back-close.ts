'use client';

/**
 * 화면을 통째로 대체하는 폼·오버레이를 브라우저 뒤로 가기로 닫는다.
 *
 * ★왜 필요한가★
 * 단가표에서 케이스를 누르면 폼이 열리고 화면 맨 위로 스크롤까지 한다 — 사람 눈에는
 * 페이지가 바뀐 것이다. 그런데 URL 은 그대로라, 뒤로 가기를 누르면 폼이 닫히는 게 아니라
 * 그 전에 보던 페이지(계정설정 등)로 튕겼다(2026-08-23 실사고). 열릴 때 히스토리에
 * 한 칸을 얹어 두면 뒤로 가기가 그 칸을 걷어내며 폼을 닫는다.
 *
 * ★어디에 쓰는가★ 화면 대부분을 대체하는 전환에만 쓴다 — 케이스 폼, 새 계정 폼처럼.
 * 드롭다운·인라인 편집·필터 칩은 그 자리에서 여닫는 것이라 뒤로 가기 대상이 아니다.
 *
 * 갈래 셋이 다 맞아떨어져야 한다:
 *  - 뒤로 가기로 닫음: popstate → close(). 얹은 칸은 이미 걷혔으니 더 할 일 없다.
 *  - 취소·저장으로 닫음: open 이 false 가 되면 cleanup 이 얹은 칸을 back() 으로 걷는다 —
 *    안 걷으면 다음 뒤로 가기가 한 번 헛돈다.
 *  - 열린 채 다른 페이지로 이동: 이동이 이미 히스토리를 쌓은 뒤라 back() 하면 새 페이지를
 *    되돌려 버린다 — state 의 표식을 보고 우리가 얹은 칸일 때만 걷는다. 이 경우 /pricing
 *    쪽에 헛칸이 하나 남는 것은 감수한다(완전 해결은 폼 상태를 URL 에 싣는 것뿐이다).
 */
import { useEffect, useRef } from 'react';

const MARK = 'hanbaek-overlay';

export function useBackClose(open: boolean, close: () => void): void {
  // close 가 렌더마다 새 함수여도 effect 를 다시 걸지 않는다 — 히스토리 칸이 중복으로 쌓인다
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!open) return;
    window.history.pushState({ [MARK]: true }, '');
    const onPop = () => closeRef.current();
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      const st = window.history.state as Record<string, unknown> | null;
      if (st && st[MARK]) window.history.back();
    };
  }, [open]);
}
