'use client';

/**
 * 배치를 만지는 훅 — 세금계산서 첨부와 최종 확정.
 *
 * 배치 목록의 줄과 명세서 상세가 같은 훅을 쓴다 — 계산서는 가확정 뒤 1~2일이면
 * 오므로 어느 화면에 있든 그 자리에서 붙이고 확정할 수 있어야 하고, 두 자리가
 * 다른 길로 서버를 부르면 갈린다.
 */
import { useState, type InputHTMLAttributes } from 'react';
import { useRouter } from 'next/navigation';
import { TAX_INVOICE_TYPES, type PayoutKind } from '@/types/project';
import { useAction } from '@/lib/use-action';

/**
 * 세금계산서 업로드 — 토큰 발급 → Blob 업로드 → 배치에 붙이기.
 * 파일 입력은 inputProps 를 그대로 편다 — 고른 뒤 value 를 비우는 것(같은 파일을
 * 다시 골라도 onChange 가 뜨게)까지가 한 벌이다.
 */
export function useTaxInvoiceUpload(
  org: string,
  kind: PayoutKind,
  payDate: string,
  /** 협력사가 올리는 자리는 PDF 만 — 전자세금계산서의 정본이 PDF 다(2026-08-30) */
  pdfOnly = false
) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'pdf';
      /* 고르는 창을 넘어오는 길이 있다(드래그·구형 브라우저) — 여기서 한 번 더 본다 */
      if (pdfOnly && file.type !== 'application/pdf') {
        setError('세금계산서는 PDF 로 올려주세요.');
        return;
      }
      const tokenRes = await fetch('/api/statements/tax-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'token', ext }),
      });
      const tokenBody = (await tokenRes.json().catch(() => ({}))) as {
        token?: string; pathname?: string; error?: string;
      };
      if (!tokenRes.ok || !tokenBody.token || !tokenBody.pathname) {
        setError(tokenBody.error ?? '업로드 준비에 실패했습니다.');
        return;
      }

      const { put } = await import('@vercel/blob/client');
      const blob = await put(tokenBody.pathname, file, {
        access: 'public',
        token: tokenBody.token,
      });

      const attach = await fetch('/api/statements/tax-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org, kind, payDate, blobUrl: blob.url, filename: file.name }),
      });
      if (!attach.ok) {
        const b = (await attach.json().catch(() => ({}))) as { error?: string };
        setError(b.error ?? '저장에 실패했습니다.');
        return;
      }
      router.refresh();
    } catch {
      setError('업로드 중 오류가 났습니다.');
    } finally {
      setBusy(false);
    }
  }

  const inputProps: InputHTMLAttributes<HTMLInputElement> = {
    type: 'file',
    accept: (pdfOnly ? ['application/pdf'] : TAX_INVOICE_TYPES).join(','),
    disabled: busy,
    onChange: (e) => {
      const f = e.target.files?.[0];
      if (f) void upload(f);
      e.target.value = '';
    },
  };

  return { busy, error, inputProps };
}

/** 최종 확정·해제 — 화면 갱신은 useAction 이 한다 */
export function useFinalizeBatch(org: string, kind: PayoutKind, payDate: string) {
  const { busy, error, run } = useAction();

  const finalize = (undo = false) =>
    run({
      url: '/api/statements/finalize',
      body: { org, kind, payDate, ...(undo ? { undo: true } : {}) },
      fail: undo ? '해제하지 못했습니다.' : '확정하지 못했습니다.',
    });

  return { busy, error, finalize };
}
