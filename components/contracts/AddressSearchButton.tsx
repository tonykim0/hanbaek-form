'use client';

import { useCallback, useState } from 'react';

/**
 * 카카오(다음) 우편번호 서비스 주소 검색 버튼.
 *
 * 직접 타이핑하면 오타 · 없는 주소 · 지번주소가 그대로 들어가므로,
 * 검색해서 고른 도로명주소를 채워 넣습니다. 별도 API 키가 필요 없습니다.
 *
 * 스크립트는 버튼을 처음 누를 때만 불러옵니다(페이지 로딩에 영향 없음).
 */
const POSTCODE_SCRIPT_SRC =
  'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';

interface PostcodeData {
  /** 도로명주소 — 시도 + 시군구 + 도로명 + 건물번호 */
  roadAddress: string;
  /** 지번주소 (도로명주소가 없는 예외적인 경우의 대비용) */
  jibunAddress: string;
  autoRoadAddress?: string;
  autoJibunAddress?: string;
  buildingName?: string;
  zonecode?: string;
}

declare global {
  interface Window {
    daum?: {
      Postcode: new (options: {
        oncomplete: (data: PostcodeData) => void;
        onclose?: (state: string) => void;
        width?: string | number;
        height?: string | number;
      }) => { open: (options?: { popupTitle?: string }) => void };
    };
  }
}

function loadPostcodeScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.daum?.Postcode) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${POSTCODE_SCRIPT_SRC}"]`
    );
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () =>
        reject(new Error('주소 검색을 불러오지 못했습니다.'))
      );
      return;
    }

    const script = document.createElement('script');
    script.src = POSTCODE_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('주소 검색을 불러오지 못했습니다.'));
    document.head.appendChild(script);
  });
}

export default function AddressSearchButton({
  onSelect,
  label = '주소 검색',
}: {
  /** 고른 도로명주소 (건물명 제외, 상세주소 제외) */
  onSelect: (address: string) => void;
  label?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openSearch = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      await loadPostcodeScript();
      if (!window.daum?.Postcode) throw new Error('주소 검색을 불러오지 못했습니다.');

      new window.daum.Postcode({
        oncomplete: (data) => {
          // 도로명주소 우선, 없으면(예외적인 경우) 지번주소로 대체
          const address =
            data.roadAddress || data.autoRoadAddress || data.jibunAddress || '';
          if (address) onSelect(address);
        },
      }).open({ popupTitle: '주소 검색' });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [onSelect]);

  return (
    <>
      <button
        type="button"
        onClick={openSearch}
        disabled={loading}
        className="flex-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:border-brand-300 hover:text-brand-700 disabled:opacity-50"
      >
        {loading ? '여는 중…' : label}
      </button>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </>
  );
}
