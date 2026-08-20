'use client';

/**
 * 서류 파일 조작 — 미리보기 · 개별 다운로드 · 전체 ZIP.
 *
 * 파일 주소는 Vercel Blob 을 그대로 가리킨다. 미리보기는 새 탭에서 브라우저가 렌더하고,
 * 다운로드는 받아서 「현장명_서류명」으로 이름을 바꿔 저장한다 —
 * Blob 에 저장된 이름은 중복 회피용 접미사가 붙어 있어 그대로 주면 알아보기 어렵다.
 */
import { useState } from 'react';
import { useAction } from '@/lib/use-action';
import JSZip from 'jszip';
import type { ProjectDocument } from '@/types/project';
import { downloadBlob } from '@/lib/download';

/** 파일 이름에 쓸 수 없는 문자를 지운다 */
function safe(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim();
}

function extOf(doc: ProjectDocument): string {
  const from = doc.filename ?? doc.blobUrl ?? '';
  const m = from.match(/\.([a-z0-9]{2,5})(?:\?|$)/i);
  return m ? m[1].toLowerCase() : 'pdf';
}

/** 브라우저가 탭에서 그려주는 형식 — 그 밖(엑셀·워드·한글)은 내려받아야 열린다 */
const PREVIEWABLE = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'txt'];
export const canPreview = (doc: ProjectDocument): boolean =>
  Boolean(doc.blobUrl) && PREVIEWABLE.includes(extOf(doc));

export function docFileName(siteName: string, label: string, doc: ProjectDocument): string {
  return `${safe(siteName)}_${safe(label)}.${extOf(doc)}`;
}

/** 서류 한 칸의 미리보기·다운로드 */
export function DocFileActions({
  doc, siteName, label,
}: {
  doc: ProjectDocument;
  siteName: string;
  label: string;
}) {
  const [busy, setBusy] = useState(false);

  if (!doc.blobUrl) return null;

  async function download() {
    setBusy(true);
    try {
      const res = await fetch(doc.blobUrl!);
      if (!res.ok) throw new Error(String(res.status));
      downloadBlob(await res.blob(), docFileName(siteName, label, doc));
    } catch {
      // 실패해도 미리보기로 열 수 있으니 화면을 막지 않는다
      window.open(doc.blobUrl!, '_blank', 'noopener');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 flex gap-1.5">
      {/*
        * 미리보기는 브라우저가 탭에서 그릴 수 있는 형식에만 준다.
        * 엑셀·워드는 링크를 열면 그냥 내려받기가 시작돼서, 「미리보기」를 눌렀는데
        * 파일이 다운로드되는 일이 된다 — 그러면 아래 다운로드 버튼과 구분이 없다.
        */}
      {canPreview(doc) && (
        <a
          href={doc.blobUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 transition hover:bg-slate-50"
        >
          미리보기
        </a>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={download}
        className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 transition hover:bg-slate-50 disabled:text-slate-400"
      >
        {busy ? '받는 중' : '다운로드'}
      </button>
    </div>
  );
}

/**
 * 서류 한 칸을 지운다 — 한백만.
 *
 * ★반려와 다른 일이다.★ 반려는 「고쳐서 다시 내라」이고, 삭제는 「이 칸에 있을 서류가
 * 아니다」다 — ZIP 자동분류가 엉뚱한 칸에 밀어넣었을 때가 그렇다. 다시 올려서 덮을 수
 * 있는 경우라면 반려가 맞다.
 *
 * 되돌릴 수 없으므로 한 번 묻는다. 파일도 함께 사라진다.
 */
export function DocDelete({
  projectId, kind, label, filename,
}: {
  projectId: string;
  kind: string;
  label: string;
  filename: string | null;
}) {
  const { busy, error, run } = useAction();

  async function remove() {
    const warn = `「${label}」 칸을 지웁니다. 파일(${filename ?? '없음'})도 함께 사라지고 되돌릴 수 없습니다.`;
    if (!window.confirm(warn)) return;
    await run({
      url: `/api/projects/${projectId}/documents/${kind}`,
      method: 'DELETE',
      fail: '지우지 못했습니다.',
    });
  }

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={remove}
        className="mt-2 text-[11px] font-bold text-slate-400 underline decoration-slate-300 transition hover:text-red-700 disabled:text-slate-300"
      >
        {busy ? '지우는 중…' : '삭제'}
      </button>
      {error && <p className="mt-1 text-[11px] font-semibold text-red-700">{error}</p>}
    </>
  );
}

/**
 * 전체 ZIP 다운로드.
 *
 * 브라우저에서 파일을 하나씩 받아 묶는다. 서버에 ZIP 을 만들어 두지 않는 이유는
 * 서류가 반려·재업로드로 계속 바뀌기 때문이다 — 만들어 둔 묶음은 금방 옛것이 된다.
 */
export function DownloadAll({
  docs, siteName, labelOf,
}: {
  docs: ProjectDocument[];
  siteName: string;
  labelOf: (kind: string) => string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const withFiles = docs.filter((d) => d.blobUrl);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const zip = new JSZip();
      const failed: string[] = [];
      for (const d of withFiles) {
        try {
          const res = await fetch(d.blobUrl!);
          if (!res.ok) throw new Error(String(res.status));
          zip.file(docFileName(siteName, labelOf(d.kind), d), await res.blob());
        } catch {
          failed.push(labelOf(d.kind));
        }
      }
      if (zip.files && Object.keys(zip.files).length === 0) {
        setError('받을 수 있는 파일이 없습니다.');
        return;
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(blob, `${safe(siteName)}_서류.zip`);
      // 일부만 실패해도 나머지는 내려준다. 무엇이 빠졌는지는 알려준다.
      if (failed.length > 0) setError(`받지 못한 서류: ${failed.join(', ')}`);
    } catch {
      setError('묶는 중 오류가 났습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={busy || withFiles.length === 0}
        onClick={run}
        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
      >
        {busy ? '묶는 중…' : `전체 다운로드 (${withFiles.length})`}
      </button>
      {error && <span className="text-[11px] font-semibold text-amber-700">{error}</span>}
    </div>
  );
}

/**
 * 서류 올리기 · 바꾸기.
 *
 * ★한 칸에 파일 하나다.★ 이미 있는 칸에 올리면 갈아치운다 — 쌓이지 않고, 이전 파일은
 * 저장소에서도 지워진다(app/api/projects/[id]/documents/[kind]/file). 그래서 파일이 이미
 * 있으면 버튼을 「바꾸기」로 부른다. 「올리기」로 두면 쌓이는 것처럼 읽힌다.
 *
 * 브라우저가 Blob 에 직접 올린다 — 서버를 거치면 스캔본이 4.5MB 를 넘을 때 막힌다.
 * 올리고 나면 반려가 자동으로 풀리고 공이 한백으로 넘어간다.
 */
export function DocUpload({
  projectId, kind, rejected, hasFile = false,
}: {
  projectId: string;
  kind: string;
  rejected: boolean;
  /** 이 칸에 이미 파일이 있는가 — 버튼 이름이 갈린다 */
  hasFile?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // 같은 파일을 다시 고를 수 있게 비운다
    if (!file) return;

    setBusy(true);
    setError(null);
    setPct(0);
    try {
      const ext = (file.name.split('.').pop() ?? 'pdf').toLowerCase();
      // 경로는 서버가 검사한다. 시각을 붙여 이전 파일을 덮지 않게 한다.
      const pathname = `projects/${projectId}/${kind}-${Date.now()}.${ext}`;

      const tokenRes = await fetch(
        `/api/projects/${projectId}/documents/${kind}/file?step=token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pathname, contentType: file.type }),
        }
      );
      const tokenBody = (await tokenRes.json().catch(() => ({}))) as { token?: string; error?: string };
      if (!tokenRes.ok || !tokenBody.token) {
        setError(tokenBody.error ?? '업로드 준비에 실패했습니다.');
        return;
      }

      const { put } = await import('@vercel/blob/client');
      const blob = await put(pathname, file, {
        access: 'public',
        token: tokenBody.token,
        onUploadProgress: ({ percentage }) => setPct(Math.round(percentage)),
      });

      const confirm = await fetch(`/api/projects/${projectId}/documents/${kind}/file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blobUrl: blob.url, filename: file.name }),
      });
      if (!confirm.ok) {
        const b = (await confirm.json().catch(() => ({}))) as { error?: string };
        setError(b.error ?? '저장에 실패했습니다.');
        return;
      }
      window.location.reload();
    } catch {
      setError('업로드 중 오류가 났습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2">
      <label
        className={`inline-flex cursor-pointer items-center rounded-lg px-2 py-1 text-[11px] font-bold transition ${
          rejected
            ? 'bg-brand-700 text-white hover:bg-brand-800'
            : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
        } ${busy ? 'pointer-events-none opacity-60' : ''}`}
      >
        {busy ? `올리는 중 ${pct}%` : rejected ? '다시 올리기' : hasFile ? '바꾸기' : '올리기'}
        <input type="file" className="hidden" onChange={onPick} disabled={busy} />
      </label>
      {error && <p className="mt-1 text-[11px] font-semibold text-red-700">{error}</p>}
    </div>
  );
}
