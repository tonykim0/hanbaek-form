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
 *
 * ★묶음을 여럿 고르면 차례로 가른다★ (한백 지시 2026-09-04). 스캐너가 현장마다 한
 * 묶음을 뱉으므로 하루치가 대여섯 개다 — 한 개씩 고르고 기다리는 일을 없앤다.
 * 겹쳐 돌리지 않는다: 판독 한 번이 40MB·80장이라 같이 보내면 서로를 밀어낸다.
 * 결과는 이어 붙고, 현장명은 ★묶음마다 다르므로 장마다 들고 다닌다★ — 하나로 합치면
 * 다른 현장 이름이 파일명에 붙는다.
 */
import { useState } from 'react';
import JSZip from 'jszip';
import { downloadBlob } from '@/lib/download';
import { Badge, Blank, Btn, Err, FIELD_CELL, PANEL } from '@/components/ui';
import type { SortResult, SortedDoc } from '@/lib/pdf-sort';

/** 가른 한 장 — 어느 묶음(현장)에서 나왔는지 같이 들고 다닌다 */
type Sorted = SortedDoc & { siteName: string | null };

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
  /** 가른 것들 — 묶음을 여럿 고르면 차례로 갈라 뒤에 이어 붙는다 */
  const [docs, setDocs] = useState<Sorted[]>([]);
  /** 넣은 묶음 — 몇 개를 몇 장 넣었는지. 가른 것의 합과 견줘 빠진 장을 사람이 본다 */
  const [sources, setSources] = useState<Array<{ name: string; pages: number }>>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  /** 사람이 고쳐 놓은 종류 — 판독 값을 덮는다(받을 때 이름에 들어간다) */
  const [fixed, setFixed] = useState<Record<number, string>>({});
  const [zipping, setZipping] = useState(false);

  const nameOf = (d: Sorted, i: number) => {
    const cat = fixed[i];
    if (!cat || cat === d.category) return d.filename;
    // 판독 이름에서 종류만 갈아 끼운다 — 「현장명_종류.pdf」
    const base = d.siteName ? `${safe(d.siteName)}_${safe(cat)}` : safe(cat);
    return `${base}.pdf`;
  };

  /** 묶음이 하나면 그 현장 이름 — 여럿이면 이름 하나로 부를 수 없다 */
  const siteNames = [...new Set(docs.map((d) => d.siteName).filter((n): n is string => Boolean(n)))];
  const sourcePages = sources.reduce((n, s) => n + s.pages, 0);

  /**
   * 고른 묶음을 차례로 가른다 — 한 번에 하나씩 보낸다(판독 한 번이 40MB·80장이다).
   * 한 묶음이 막히면 멈추고 거기까지 가른 것은 그대로 둔다 — 다시 다 올리지 않게.
   */
  async function sortAll(files: File[]) {
    setError(null);
    setDocs([]);
    setSources([]);
    setWarnings([]);
    setFixed({});
    for (const [i, file] of files.entries()) {
      if (!(await sort(file, i, files.length))) break;
    }
    setBusy(null);
  }

  /** 묶음 하나를 가른다 — 갈랐으면 true. 진행은 단추가 말한다 */
  async function sort(file: File, done: number, total: number): Promise<boolean> {
    // 여러 묶음이면 몇 번째인지 앞에 붙인다 — 어느 것을 도는 중인지 화면이 말해야 한다
    const step = total > 1 ? `묶음 ${done + 1}/${total} · ` : '';
    const say = (m: string) => setBusy(`${step}${m}`);
    try {
      say('올리는 중 0%');
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
        onUploadProgress: ({ percentage }) => say(`올리는 중 ${Math.round(percentage)}%`),
      });

      say('읽기 시작…');
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
          say(ev.total ? `${ev.message} (${(ev.done ?? 0) + 1}/${ev.total})` : (ev.message ?? '읽는 중…'));
        }
      }
      if (!data) throw new Error('읽는 중에 연결이 끊겼습니다. 다시 올려주세요.');
      /* 이어 붙인다 — 앞 묶음의 번호(fixed 의 열쇠)가 밀리지 않게 뒤에만 더한다 */
      const got: SortResult = data;
      setDocs((ds) => [...ds, ...got.docs.map((d) => ({ ...d, siteName: got.siteName }))]);
      setSources((ss) => [...ss, { name: file.name, pages: got.sourcePages }]);
      setWarnings((ws) => [...ws, ...got.warnings]);
      return true;
    } catch (err) {
      // 여러 묶음이면 어느 것이 막혔는지 적는다
      setError(total > 1 ? `${file.name}: ${(err as Error).message}` : (err as Error).message);
      return false;
    }
  }

  async function getOne(d: Sorted, i: number) {
    try {
      const res = await fetch(d.blobUrl);
      if (!res.ok) throw new Error(String(res.status));
      downloadBlob(await res.blob(), nameOf(d, i));
    } catch {
      window.open(d.blobUrl, '_blank', 'noopener');
    }
  }

  async function getAll() {
    if (docs.length === 0) return;
    setZipping(true);
    setError(null);
    try {
      const zip = new JSZip();
      const failed: string[] = [];
      for (const [i, d] of docs.entries()) {
        try {
          const res = await fetch(d.blobUrl);
          if (!res.ok) throw new Error(String(res.status));
          zip.file(nameOf(d, i), await res.blob());
        } catch {
          failed.push(d.category);
        }
      }
      // 현장이 하나면 그 이름 — 여럿을 한 이름으로 부르면 안에 든 것을 속인다
      const base = siteNames.length === 1 ? safe(siteNames[0]) : '분류';
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
            스캔 묶음 여럿 · 묶음마다 최대 40MB · 앞 80장까지 · 차례로 가릅니다
          </span>
          <input
            type="file"
            accept="application/pdf,.pdf"
            multiple
            disabled={busy !== null}
            className="hidden"
            onChange={(e) => {
              const picked = [...(e.target.files ?? [])];
              e.target.value = ''; // 같은 파일을 다시 고를 수 있게 비운다
              if (picked.length > 0) void sortAll(picked);
            }}
          />
        </label>
        <Err>{error}</Err>
      </section>

      {sources.length > 0 && (
        <section className={`${PANEL} p-5`}>
          <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-base font-black text-slate-900">
              {docs.length}건으로 갈랐습니다
            </h2>
            <span className="text-small font-bold text-slate-500">
              {/* 묶음이 여럿이면 몇 묶음이었는지도 적는다 — 장수만으로는 다 넣었는지 모른다 */}
              {sources.length > 1 && `묶음 ${sources.length}개 · `}
              원본 {sourcePages}장
              {siteNames.length > 0 && (
                <span className="ml-2 text-slate-700">{siteNames.join(' · ')}</span>
              )}
            </span>
            <Btn size="sm" kind="quiet" busy={zipping} busyLabel="묶는 중…" onClick={() => void getAll()} className="ml-auto">
              전체 받기 ({docs.length})
            </Btn>
          </div>

          {/* 묶음이 여럿이면 같은 경고가 두 번 올 수 있다 — 열쇠는 자리로 준다 */}
          {warnings.map((w, i) => (
            <p key={`${i}-${w}`} className="mb-2 rounded-box border-l-[3px] border-amber-400 bg-amber-50 px-3 py-2 text-small font-semibold text-amber-900">
              {w}
            </p>
          ))}

          <ul className="flex flex-col divide-y divide-slate-100">
            {docs.map((d, i) => (
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
          {docs.length === 0 && <Blank>0건</Blank>}
        </section>
      )}
    </div>
  );
}
