'use client';

/**
 * PDF 분류·분할 — 한 덩어리로 스캔된 서류 묶음을 종류별로 갈라 받는다.
 *
 * 스캐너는 계약서류 30~60장을 통째로 한 PDF 로 뱉는다. 그것을 계약서·회의록·건축물대장…
 * 으로 가르는 일을 사람이 손으로 하고 있었다(한백 2026-08-29).
 *
 * 판독은 접수 ZIP 과 같은 길이다 — 방향 보정 → 분류·페이지 판독 → 페이지대로 자르기.
 * 다른 것은 끝에서 하는 일뿐이다: 접수는 현장에 붙이고, 여기서는 받아 간다.
 *
 * ★가른 결과는 접수와 같지 않을 수 있다★ — 판독은 매번 조금씩 다르게 읽는다.
 * 그래서 종류를 그 자리에서 고칠 수 있게 두었다(받는 이름이 바뀐다).
 */
import { useState } from 'react';
import JSZip from 'jszip';
import { downloadBlob } from '@/lib/download';
import { Badge, Blank, Btn, Err, FIELD_CELL, PANEL } from '@/components/ui';
import type { SortResult, SortedDoc } from '@/lib/pdf-sort';

/** 고를 수 있는 종류 — 판독이 쓰는 목록과 같다(lib/prompts 의 분류 카테고리) */
const CATEGORIES = [
  '계약서', '합의서', '직인사용 동의서', '전기차충전시설 설치신청서', '개인정보 동의서',
  '사전현장컨설팅 결과서', '사진대지', '입주자대표회의 회의록', '관리단 회의록',
  '한전 전기요금 청구서', '건축물대장', 'K-apt 스크린샷', '사업자등록증', '고유번호증',
  '실사보고서', '기설치 충전기 설치이력', '기설치 증빙자료', '별지2 사전체크리스트',
  '설치승인서', '견적서', '기타',
] as const;

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)}MB`;

/** 파일 이름에 못 쓰는 글자를 바꾼다 — 종류를 고치면 이름도 따라간다 */
const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, '_').trim();

export default function PdfSorter() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SortResult | null>(null);
  /** 사람이 고쳐 놓은 종류 — 판독 값을 덮는다(받을 때 이름에 들어간다) */
  const [fixed, setFixed] = useState<Record<number, string>>({});
  const [zipping, setZipping] = useState(false);

  const nameOf = (d: SortedDoc, i: number) => {
    const cat = fixed[i];
    if (!cat || cat === d.category) return d.filename;
    // 판독 이름에서 종류만 갈아 끼운다 — 「현장명_종류.pdf」
    const base = result?.siteName ? `${safe(result.siteName)}_${safe(cat)}` : safe(cat);
    return `${base}.pdf`;
  };

  async function sort(file: File) {
    setError(null);
    setResult(null);
    setFixed({});
    try {
      setBusy('올리는 중 0%');
      const tokenRes = await fetch('/api/pdf-sort?step=token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const tb = (await tokenRes.json().catch(() => ({}))) as
        { token?: string; pathname?: string; error?: string };
      if (!tokenRes.ok || !tb.token || !tb.pathname) {
        throw new Error(tb.error ?? '업로드 준비에 실패했습니다.');
      }

      const { put } = await import('@vercel/blob/client');
      const blob = await put(tb.pathname, file, {
        access: 'public',
        token: tb.token,
        contentType: 'application/pdf',
        onUploadProgress: ({ percentage }) => setBusy(`올리는 중 ${Math.round(percentage)}%`),
      });

      setBusy('읽기 시작…');
      const res = await fetch('/api/pdf-sort', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ blobUrl: blob.url, filename: file.name }),
      });
      if (!res.ok || !res.body) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? '가르지 못했습니다.');
      }

      /* 마지막 줄이 결과다 — 그 줄이 안 오면 실패로 본다(접수 ZIP 과 같은 방식) */
      let data: SortResult | null = null;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (!data) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const ev = JSON.parse(line.slice(6)) as {
            phase: string; message?: string; done?: number; total?: number;
            result?: SortResult; error?: string;
          };
          if (ev.phase === 'error') throw new Error(ev.error ?? '가르지 못했습니다.');
          if (ev.phase === 'done' && ev.result) { data = ev.result; break; }
          setBusy(ev.total ? `${ev.message} (${(ev.done ?? 0) + 1}/${ev.total})` : (ev.message ?? '읽는 중…'));
        }
      }
      if (!data) throw new Error('읽는 중에 연결이 끊겼습니다. 다시 올려주세요.');
      setResult(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function getOne(d: SortedDoc, i: number) {
    try {
      const res = await fetch(d.blobUrl);
      if (!res.ok) throw new Error(String(res.status));
      downloadBlob(await res.blob(), nameOf(d, i));
    } catch {
      window.open(d.blobUrl, '_blank', 'noopener');
    }
  }

  async function getAll() {
    if (!result) return;
    setZipping(true);
    setError(null);
    try {
      const zip = new JSZip();
      const failed: string[] = [];
      for (const [i, d] of result.docs.entries()) {
        try {
          const res = await fetch(d.blobUrl);
          if (!res.ok) throw new Error(String(res.status));
          zip.file(nameOf(d, i), await res.blob());
        } catch {
          failed.push(d.category);
        }
      }
      const base = result.siteName ? safe(result.siteName) : '분류';
      downloadBlob(await zip.generateAsync({ type: 'blob' }), `${base}_서류.zip`);
      if (failed.length > 0) setError(`받지 못한 것: ${failed.join(' · ')}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setZipping(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* 올리는 자리 — 파일을 고르면 바로 시작한다. 「시작」 단추를 따로 두지 않는다 */}
      <section className="rounded-2xl border-2 border-dashed border-brand-300 bg-brand-50/40 p-5">
        <label className="flex cursor-pointer flex-col items-start gap-1.5">
          <span className="rounded-ctl bg-brand-700 px-4 py-2 text-base font-bold text-white transition hover:bg-brand-800">
            {busy ?? 'PDF 고르기'}
          </span>
          <span className="text-tiny text-slate-500">
            스캔 묶음 한 개 · 최대 40MB · 앞 80장까지
          </span>
          <input
            type="file"
            accept="application/pdf,.pdf"
            disabled={busy !== null}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = ''; // 같은 파일을 다시 고를 수 있게 비운다
              if (f) void sort(f);
            }}
          />
        </label>
        <Err>{error}</Err>
      </section>

      {result && (
        <section className={`${PANEL} p-5`}>
          <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-base font-black text-slate-900">
              {result.docs.length}건으로 갈랐습니다
            </h2>
            <span className="text-small font-bold text-slate-500">
              원본 {result.sourcePages}장
              {result.siteName && <span className="ml-2 text-slate-700">{result.siteName}</span>}
            </span>
            <Btn size="sm" kind="quiet" busy={zipping} busyLabel="묶는 중…" onClick={() => void getAll()} className="ml-auto">
              전체 받기 ({result.docs.length})
            </Btn>
          </div>

          {result.warnings.map((w) => (
            <p key={w} className="mb-2 rounded-box border-l-[3px] border-amber-400 bg-amber-50 px-3 py-2 text-small font-semibold text-amber-900">
              {w}
            </p>
          ))}

          <ul className="flex flex-col divide-y divide-slate-100">
            {result.docs.map((d, i) => (
              <li key={d.blobUrl} className="flex flex-wrap items-center gap-2 py-2">
                {/*
                  * 종류를 그 자리에서 고친다 — 판독이 틀리면 받는 이름도 틀린다.
                  * 파일은 그대로고 이름만 바뀐다(다시 자르지 않는다).
                  */}
                <select
                  aria-label="서류 종류"
                  value={fixed[i] ?? d.category}
                  onChange={(e) => setFixed((f) => ({ ...f, [i]: e.target.value }))}
                  className={`${FIELD_CELL} w-[210px]`}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <span className="min-w-0 flex-1 truncate text-base font-bold text-slate-800">
                  {nameOf(d, i)}
                </span>
                <Badge tone="mute">{d.pages}장</Badge>
                <span className="w-16 text-right text-tiny tabular-nums text-slate-400">{mb(d.bytes)}</span>
                <Btn size="sm" kind="quiet" onClick={() => void getOne(d, i)}>받기</Btn>
              </li>
            ))}
          </ul>
          {result.docs.length === 0 && <Blank>0건</Blank>}
        </section>
      )}
    </div>
  );
}
