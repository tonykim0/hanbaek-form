'use client';

/**
 * 하던 일을 두고 페이지를 벗어나려 할 때 한 번 묻는다.
 *
 * ★왜 필요한가★ 서류 접수 화면에서 계약서 묶음을 올려 두고 다른 메뉴를 눌러 나가는
 * 일이 실제로 있었다(한백 2026-08-26). 파일은 저장소에 올라가 있지만 현장이 만들어지지
 * 않았으므로 접수는 없던 일이 되고, 올린 사람은 낸 줄 안다.
 *
 * 두 길을 다 막는다 — 어느 한쪽만 막으면 다른 쪽으로 그냥 나간다:
 *   창을 닫거나 새로고침 → beforeunload (브라우저가 자기 문구로 묻는다. 우리 문구는 못 넣는다)
 *   콘솔 안의 링크 클릭 → 클릭을 가로채 confirm (앱 안 이동은 beforeunload 가 안 걸린다)
 *
 * 링크는 ★캡처 단계★에서 잡는다 — Next 의 Link 가 클릭을 처리하기 전에 세워야 한다.
 */
import { useEffect } from 'react';

export function useLeaveGuard(active: boolean, message: string): void {
  useEffect(() => {
    if (!active) return;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // 옛 브라우저는 이 값을 봐야 확인창을 띄운다. 문구는 브라우저가 정한다.
      e.returnValue = '';
    };

    const onClick = (e: MouseEvent) => {
      // 새 탭·다운로드·수정키 조합은 이 페이지를 떠나는 것이 아니다
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as HTMLElement | null)?.closest?.('a');
      if (!link) return;
      const href = link.getAttribute('href');
      if (!href || href.startsWith('#') || link.target === '_blank' || link.hasAttribute('download')) return;
      // 같은 화면 안에서 물음표만 바뀌는 이동(탭 전환 등)은 나가는 것이 아니다
      const to = new URL(href, window.location.href);
      if (to.pathname === window.location.pathname) return;

      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [active, message]);
}
