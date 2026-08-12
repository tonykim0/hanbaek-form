'use client';

/**
 * 담당자 모드 판별 훅.
 *
 * useSearchParams() 대신 window.location 을 읽습니다 — 계약서 페이지들은 정적
 * 프리렌더 대상이라 useSearchParams 를 쓰면 Suspense 경계나 동적 렌더가 강제됩니다.
 * 첫 렌더에서는 false 이고 마운트 직후 켜지므로, 협력사 화면에 도구가 잠깐
 * 비쳤다 사라지는 일은 없습니다 (반대 방향이라 안전합니다).
 */

import { useEffect, useState } from 'react';
import { INTERNAL_MODE_PARAM } from './internal-mode';

export function useInternalModeState(): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setEnabled(params.get(INTERNAL_MODE_PARAM) === '1');
  }, []);

  return enabled;
}

export function useInternalMode(): boolean {
  return useInternalModeState() ?? false;
}
