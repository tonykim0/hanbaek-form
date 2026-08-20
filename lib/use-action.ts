'use client';

/**
 * 서버를 고치고 화면을 다시 그리는 한 번의 동작.
 *
 * ★한 곳에 모으는 이유★
 * 이 스무 줄이 콘솔에 열두 벌 있었다. 벌써 갈라지기 시작했다 — 어떤 곳은
 * 'Content-Type' 이고 어떤 곳은 'content-type', 실패 문구도 「네트워크 오류입니다.」와
 * 「…다시 시도해주세요.」로 둘, 한 곳은 throw 하고 옆에서는 setError 했다.
 * 실패했을 때 무엇이 보이는지는 화면마다 다를 이유가 없다.
 *
 * router.refresh() 를 훅 안에 둔다. 서버 컴포넌트를 다시 렌더해야 단계·정체일·공 차례가
 * 같이 갱신되는데, 이걸 부르는 것을 잊으면 「저장은 됐는데 화면이 안 바뀐다」가 된다 —
 * 부르는 쪽이 기억할 일이 아니다.
 */
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';

/** key 를 안 준 동작이 차지하는 자리 */
const ONE = ' ';

export interface ActionRequest {
  url: string;
  method?: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** JSON 으로 실어 보낼 것. 없으면 본문 없이 보낸다(DELETE). */
  body?: unknown;
  /** 서버가 이유를 안 알려줄 때 대신 보여줄 말 */
  fail?: string;
  /**
   * 실패 문구 앞에 붙일 이름. 목록·보드에서 필요하다 —
   * 카드가 스무 개인 화면에 「옮기지 못했습니다」만 뜨면 어느 현장인지 알 수 없다.
   */
  label?: string;
  /**
   * 여러 자리가 각자 도는 화면에서 어느 자리인지 — 표의 칸마다 버튼이 있는 경우다.
   * busyKey 로 되돌려받아 그 자리만 잠근다.
   */
  key?: string;
}

export function useAction() {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** 성공했으면 true. 뒤처리(입력칸 비우기·편집 닫기)는 부르는 쪽이 한다. */
  const run = useCallback(
    async (req: ActionRequest): Promise<boolean> => {
      const say = (msg: string) => setError(req.label ? `${req.label} — ${msg}` : msg);
      setBusyKey(req.key ?? ONE);
      setError(null);
      try {
        const res = await fetch(req.url, {
          method: req.method ?? 'POST',
          ...(req.body === undefined
            ? {}
            : {
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(req.body),
              }),
        });
        if (!res.ok) {
          const b = (await res.json().catch(() => ({}))) as { error?: string };
          say(b.error ?? req.fail ?? '처리하지 못했습니다.');
          return false;
        }
        router.refresh();
        return true;
      } catch {
        say('네트워크 오류입니다. 다시 시도해주세요.');
        return false;
      } finally {
        setBusyKey(null);
      }
    },
    [router]
  );

  return { busy: busyKey !== null, busyKey, error, setError, run };
}
