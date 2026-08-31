'use client';

/**
 * 하던 일을 두고 페이지를 벗어나려 할 때 한 번 묻는다.
 *
 * ★왜 필요한가★ 서류 접수 화면에서 계약서 묶음을 올려 두고 다른 메뉴를 눌러 나가는
 * 일이 실제로 있었다(한백 2026-08-26). 파일은 저장소에 올라가 있지만 현장이 만들어지지
 * 않았으므로 접수는 없던 일이 되고, 올린 사람은 낸 줄 안다.
 *
 * ★올리는 도중도 막는다★ (한백 지시 2026-08-31). 그전에는 「올려 둔 것이 있는가」만
 * 봤는데, 올리는 중에는 아직 올려 둔 것이 없어서 그냥 나가졌다 — 도는 요청이 끊기고
 * 화면은 사라진다. 가장 아까운 순간이 안 막혀 있었다.
 *
 * 두 길을 다 막는다 — 어느 한쪽만 막으면 다른 쪽으로 그냥 나간다:
 *   창을 닫거나 새로고침 → beforeunload (브라우저가 자기 문구로 묻는다. 우리 문구는 못 넣는다)
 *   콘솔 안의 링크 클릭 → 클릭을 가로채 confirm (앱 안 이동은 beforeunload 가 안 걸린다)
 *
 * 링크는 ★캡처 단계★에서 잡는다 — Next 의 Link 가 클릭을 처리하기 전에 세워야 한다.
 *
 * ★리스너는 창에 한 벌이다.★ 부품마다 붙이면 서류 두 칸을 동시에 올릴 때 확인창이 두 번
 * 뜬다 — 한 번 「머무르기」를 눌러도 다음 창이 또 물어, 사람은 자기가 무엇을 답했는지
 * 모른다. 여기서 한 곳에 모아 세고, 걸린 이유가 하나라도 있으면 한 번만 묻는다.
 * (창 단위 드래그 감지를 한 곳에서 세는 것과 같은 이유 — components/DocFiles)
 */
import { useEffect } from 'react';

/** 지금 붙잡고 있는 이유들 — 비어 있으면 그냥 나간다 */
const reasons = new Set<{ message: string }>();

function onBeforeUnload(e: BeforeUnloadEvent) {
  if (reasons.size === 0) return;
  e.preventDefault();
  // 옛 브라우저는 이 값을 봐야 확인창을 띄운다. 문구는 브라우저가 정한다.
  e.returnValue = '';
}

function onClick(e: MouseEvent) {
  if (reasons.size === 0) return;
  // 새 탭·다운로드·수정키 조합은 이 페이지를 떠나는 것이 아니다
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const link = (e.target as HTMLElement | null)?.closest?.('a');
  if (!link) return;
  const href = link.getAttribute('href');
  if (!href || href.startsWith('#') || link.target === '_blank' || link.hasAttribute('download')) return;
  // 같은 화면 안에서 물음표만 바뀌는 이동(탭 전환 등)은 나가는 것이 아니다
  const to = new URL(href, window.location.href);
  if (to.pathname === window.location.pathname) return;

  /* 걸린 이유가 여럿이면 먼저 걸린 것을 말한다 — 두 번 묻지 않는다 */
  const [first] = reasons;
  if (!window.confirm(first.message)) {
    e.preventDefault();
    e.stopPropagation();
  }
}

function hold(message: string): () => void {
  const token = { message };
  if (reasons.size === 0) {
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
  }
  reasons.add(token);
  return () => {
    reasons.delete(token);
    if (reasons.size === 0) {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    }
  };
}

export function useLeaveGuard(active: boolean, message: string): void {
  useEffect(() => {
    if (!active) return;
    return hold(message);
  }, [active, message]);
}
