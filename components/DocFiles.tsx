'use client';

/**
 * 서류 파일 조작 — 미리보기 · 개별 다운로드 · 전체 ZIP.
 *
 * 파일 주소는 Vercel Blob 을 그대로 가리킨다. 미리보기는 새 탭에서 브라우저가 렌더하고,
 * 다운로드는 받아서 「현장명_서류명」으로 이름을 바꿔 저장한다 —
 * Blob 에 저장된 이름은 중복 회피용 접미사가 붙어 있어 그대로 주면 알아보기 어렵다.
 */
import { useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { useAction } from '@/lib/use-action';
import { Btn, Confirm, Err } from '@/components/ui';
import JSZip from 'jszip';
import { docContentType, MAX_DOC_BYTES, type DocFile, type ProjectDocument } from '@/types/project';
import { downloadBlob } from '@/lib/download';

/** 파일 이름에 쓸 수 없는 문자를 지운다 */
function safe(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim();
}

/* ── 파일을 끌고 들어왔는가 ────────────────────────────────────────────────
 * 창 어디로든 파일을 끌고 들어오면 서류 칸마다 드롭 자리가 펴진다. 평소에는 단추만
 * 둔다 — 늘 펼쳐 두면 칸이 스무 개인 화면에서 점선 상자가 스무 개다(화면 규칙 2).
 *
 * 리스너는 창에 한 쌍만 붙인다(구독자 집합). 칸마다 useEffect 로 붙이면 스무 쌍이 되고,
 * dragenter/leave 는 자식 요소를 지날 때마다 튀어서 깊이를 세는 상태도 스무 벌이 된다.
 * 여기서 한 번 세고 결과만 나눠 준다.
 */
let dragDepth = 0;
let dragging = false;
const dragSubs = new Set<() => void>();

/** 파일 드래그만 본다 — 글자·링크를 끌 때도 dragenter 는 뜬다 */
const hasFiles = (e: DragEvent) => Boolean(e.dataTransfer?.types?.includes('Files'));

function setDragging(next: boolean) {
  if (dragging === next) return;
  dragging = next;
  dragSubs.forEach((fn) => fn());
}

function onWindowDragEnter(e: DragEvent) {
  if (!hasFiles(e)) return;
  dragDepth += 1;
  setDragging(true);
}
function onWindowDragLeave(e: DragEvent) {
  if (!hasFiles(e)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) setDragging(false);
}
function onWindowDragEnd() {
  dragDepth = 0;
  setDragging(false);
}

/**
 * 빗맞힌 드롭을 삼킨다 (2026-08-30).
 *
 * ★놓을 자리를 빗나가면 브라우저가 그 파일을 열어 버린다★ — 작업하던 화면이 통째로
 * 사라지고, 올리던 것도 잃는다. 칸 전체를 드롭 자리로 넓혀도 칸과 칸 사이·머리말 위는
 * 남으므로, 창 밖에서 기본 동작을 막는다. 우리 칸에 놓은 것은 그 자리의 처리기가 먼저
 * 받아 올리므로 영향이 없다.
 */
function swallowStrayDrop(e: DragEvent) {
  // 파일을 끌고 있을 때만 — 글자 끌기·링크 끌기까지 막지 않는다
  if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
}

function subscribeDrag(cb: () => void): () => void {
  if (dragSubs.size === 0) {
    window.addEventListener('dragenter', onWindowDragEnter);
    window.addEventListener('dragleave', onWindowDragLeave);
    window.addEventListener('drop', onWindowDragEnd);
    window.addEventListener('dragend', onWindowDragEnd);
    window.addEventListener('dragover', swallowStrayDrop);
    window.addEventListener('drop', swallowStrayDrop);
  }
  dragSubs.add(cb);
  return () => {
    dragSubs.delete(cb);
    if (dragSubs.size === 0) {
      window.removeEventListener('dragenter', onWindowDragEnter);
      window.removeEventListener('dragleave', onWindowDragLeave);
      window.removeEventListener('drop', onWindowDragEnd);
      window.removeEventListener('dragend', onWindowDragEnd);
      window.removeEventListener('dragover', swallowStrayDrop);
      window.removeEventListener('drop', swallowStrayDrop);
      onWindowDragEnd();
    }
  };
}

/** 서버 렌더에서는 늘 false — 드래그는 브라우저에서만 일어난다 */
function useFileDragging(): boolean {
  return useSyncExternalStore(subscribeDrag, () => dragging, () => false);
}

function extOf(file: DocFile): string {
  const from = file.name ?? file.url ?? '';
  const m = from.match(/\.([a-z0-9]{2,5})(?:\?|$)/i);
  return m ? m[1].toLowerCase() : 'pdf';
}

/** 브라우저가 탭에서 그려주는 형식 — 그 밖(엑셀·워드·한글)은 내려받아야 열린다 */
const PREVIEWABLE = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'txt'];
/** 줄에서 바로 그려 보여줄 수 있는 형식 — 사진 서류(설치완료·기설치 증빙)가 이것이다 */
const THUMBNAIL = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
const isImage = (file: DocFile): boolean => THUMBNAIL.includes(extOf(file));
/** 사람이 읽는 크기 — 소수 한 자리면 「29.7MB 인데 왜 막히나」가 안 생긴다 */
const mb = (bytes: number): string => (bytes / 1024 / 1024).toFixed(1).replace(/\.0$/, '');
export const canPreview = (file: DocFile): boolean => PREVIEWABLE.includes(extOf(file));

/**
 * 받을 때 붙는 이름 — 「현장명_서류명」이다. Blob 에 저장된 이름은 중복 회피용 접미사가
 * 붙어 있어 그대로 주면 알아보기 어렵다.
 *
 * 한 칸에 여러 장이면 두 번째부터 (2)·(3) 을 붙인다 — 같은 이름 셋을 한 폴더에 받으면
 * 브라우저가 제멋대로 이름을 바꾼다.
 */
export function docFileName(siteName: string, label: string, file: DocFile, i = 0): string {
  const n = i > 0 ? `(${i + 1})` : '';
  return `${safe(siteName)}_${safe(label)}${n}.${extOf(file)}`;
}

/**
 * 서류 한 칸의 파일들 — 한 줄에 한 장이다.
 *
 * 한 칸에 여러 장이 붙는다(한백 지시 2026-08-25). 파일이 하나일 때와 모양을 가르지 않는다 —
 * 「한 장이면 단추 두 개, 여러 장이면 목록」으로 두면 같은 칸이 두 얼굴을 갖고, 두 번째
 * 장을 올리는 순간 화면이 바뀌어 무엇이 없어졌는지 찾아야 한다.
 *
 * 파일 이름을 적는다. 여러 장이 되면 「미리보기·다운로드」만으로는 어느 것을 여는지 알 수 없다.
 */
export function DocFileActions({
  doc, siteName, label, projectId, canRemove = false,
}: {
  doc: ProjectDocument;
  siteName: string;
  label: string;
  /** 파일 한 장을 뺄 때 부를 곳 — 없으면 빼기 단추를 두지 않는다 */
  projectId?: string;
  /** 이 사람이 파일을 뺄 수 있는가 (그 현장의 협력사·한백) */
  canRemove?: boolean;
}) {
  if (doc.files.length === 0) return null;

  /* 자리(여백)는 부르는 쪽이 정한다 — 부품이 자기 mt 를 갖고 있으면 줄에 세울 때 어긋난다 */
  return (
    <div className="flex flex-col gap-1">
      {doc.files.map((f, i) => (
        <FileRow
          key={f.url}
          file={f}
          index={i}
          kind={doc.kind}
          siteName={siteName}
          label={label}
          projectId={projectId}
          canRemove={canRemove && Boolean(projectId)}
        />
      ))}
    </div>
  );
}

/** 파일 한 장 — 이름 · 미리보기 · 받기 · 빼기 */
function FileRow({
  file, index, kind, siteName, label, projectId, canRemove,
}: {
  file: DocFile;
  index: number;
  kind: string;
  siteName: string;
  label: string;
  projectId?: string;
  canRemove: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const remove = useAction();

  async function download() {
    setBusy(true);
    try {
      const res = await fetch(file.url);
      if (!res.ok) throw new Error(String(res.status));
      downloadBlob(await res.blob(), docFileName(siteName, label, file, index));
    } catch {
      // 실패해도 새 탭으로 열 수 있으니 화면을 막지 않는다
      window.open(file.url, '_blank', 'noopener');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5">
        {/*
          * ★사진은 줄에서 바로 보인다★ (한백 지시 2026-08-26) — 설치완료 사진은 거점마다
          * 여러 장이라, 이름만 있으면 어느 것이 무엇인지 하나씩 눌러 봐야 했다.
          * 작은 판을 눌러 원본을 새 탭에 연다.
          *
          * next/image 를 쓰지 않는다: 파일이 Blob(외부 호스트)에 있어 remotePatterns 설정이
          * 필요하고, 콘솔 안에서 40px 로 보여주는 데 변환을 태울 이유가 없다.
          */}
        {isImage(file) && (
          <a href={file.url} target="_blank" rel="noopener noreferrer" className="shrink-0" title={file.name}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={file.url}
              alt={file.name}
              width={40}
              height={40}
              loading="lazy"
              className="h-10 w-10 rounded-ctl border border-slate-200 bg-slate-50 object-cover transition hover:border-brand-300"
            />
          </a>
        )}
        {/*
          * 이름이 곧 미리보기 링크다 — 그릴 수 있는 형식만. 엑셀·워드는 링크를 열면
          * 내려받기가 시작돼서 「받기」와 구분이 없어진다(그때는 글자로만 둔다).
          */}
        <span className="flex min-w-0 flex-1 flex-col">
          {canPreview(file) ? (
            <a
              href={file.url}
              target="_blank"
              rel="noopener noreferrer"
              title={file.name}
              className="truncate text-tiny font-bold text-brand-800 underline decoration-brand-200 transition hover:decoration-brand-500"
            >
              {file.name}
            </a>
          ) : (
            <span title={file.name} className="truncate text-tiny font-bold text-slate-700">
              {file.name}
            </span>
          )}
          {/*
            ★판독기가 읽은 제목 (한백 2026-08-31).★ 목표는 「파일을 하나하나 열어보는 것을
            최소화하는 것」이다. 칸 이름 아래에 읽은 제목이 서면, 「합의서」 칸에 「전기차
            등록대수 확인 공문」이 앉은 것이 열지 않고도 보인다.

            ★맞다/틀리다를 적지 않는다★ — 읽은 것 그대로다. 판정을 하면 틀린 판정이 생기고,
            틀린 지적은 없는 것보다 나쁘다(접수 검수를 껐던 이유가 그것이다). 두 줄을
            견주는 데 사람은 1초를 쓴다.

            파일명이 이미 그 말을 하고 있으면(「기타」는 제목이 이름에 들어간다) 적지 않는다 —
            같은 값을 두 번 두지 않는다(화면 규칙 5). 사람이 칸에서 직접 올린 파일에는
            아예 없다 — 그때는 어느 칸인지 사람이 이미 골랐다.
          */}
          {file.title && !file.name.includes(file.title) && (
            <span className="truncate text-micro text-slate-400" title={file.title}>
              읽은 제목 <span className="font-bold text-slate-600">{file.title}</span>
            </span>
          )}
        </span>
        {/*
          * 「받기」가 따로 있는 이유 — 이름 링크는 브라우저에 맡기는 것이고(그릴 수 있으면
          * 새 탭), 이쪽은 받아서 「현장명_서류명」으로 이름을 바꿔 저장한다. Blob 에 저장된
          * 이름에는 중복 회피 접미사가 붙어 있다.
          */}
        <Btn size="sm" kind="quiet" busy={busy} busyLabel="받는 중" onClick={download} className="shrink-0">
          받기
        </Btn>
        {/* 삭제는 되돌릴 수 없어 글자 단추다 — 받기(칩)와 모양으로 갈린다(화면 규칙 12) */}
        {canRemove && projectId && (
          <>
            <Btn
              size="sm"
              kind="undo"
              busy={remove.busy}
              busyLabel="삭제 중"
              className="shrink-0"
              onClick={() => setAsking(true)}
            >
              삭제
            </Btn>
            <Confirm
              open={asking}
              title={`「${file.name}」을 삭제합니다.`}
              detail="파일도 함께 사라지고 되돌릴 수 없습니다."
              confirmLabel="예, 삭제합니다"
              busy={remove.busy}
              busyLabel="삭제 중…"
              error={remove.error}
              onCancel={() => setAsking(false)}
              onConfirm={() => {
                void remove.run({
                  url: `/api/projects/${projectId}/documents/${kind}/file`,
                  method: 'DELETE',
                  body: { url: file.url },
                  fail: '빼지 못했습니다.',
                }).then((ok) => { if (ok) setAsking(false); });
              }}
            />
          </>
        )}
      </div>
      <Err>{remove.error}</Err>
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
  projectId, kind, label, filename, count = 0,
}: {
  projectId: string;
  kind: string;
  label: string;
  filename: string | null;
  /** 이 칸에 붙은 파일 장수 — 몇 장이 사라지는지 물을 때 적는다 */
  count?: number;
}) {
  const { busy, error, run } = useAction();
  const [asking, setAsking] = useState(false);

  // 여러 장이면 장수를 적는다 — 이름 하나만 적으면 나머지가 사라지는 줄 모른다
  const what = count > 1 ? `파일 ${count}장` : `파일(${filename ?? '없음'})`;

  async function remove() {
    const ok = await run({
      url: `/api/projects/${projectId}/documents/${kind}`,
      method: 'DELETE',
      fail: '삭제하지 못했습니다.',
    });
    if (ok) setAsking(false);
  }

  /* 실패 문구는 누른 단추 아래에 붙는다(화면 규칙 9) — 줄에 세워도 흐트러지지 않게 한 겹으로 */
  return (
    <div className="flex flex-col items-end">
      <Btn kind="undo" size="sm" busy={busy} busyLabel="삭제 중…" onClick={() => setAsking(true)}>
        삭제
      </Btn>
      <Err>{error}</Err>
      <Confirm
        open={asking}
        title={`「${label}」 칸을 삭제합니다.`}
        detail={`${what}도 함께 사라지고 되돌릴 수 없습니다.`}
        confirmLabel="예, 삭제합니다"
        busy={busy}
        busyLabel="삭제 중…"
        error={error}
        onConfirm={() => void remove()}
        onCancel={() => setAsking(false)}
      />
    </div>
  );
}

/**
 * 전체 ZIP 다운로드.
 *
 * 브라우저에서 파일을 하나씩 받아 묶는다. 서버에 ZIP 을 만들어 두지 않는 이유는
 * 서류가 반려·재업로드로 계속 바뀌기 때문이다 — 만들어 둔 묶음은 금방 옛것이 된다.
 */
export function DownloadAll({
  docs, siteName, labelOf, extra = [],
}: {
  docs: ProjectDocument[];
  siteName: string;
  labelOf: (kind: string) => string;
  /**
   * 파일이 아닌 값도 같이 묶는다 — 화면에만 있는 것을 묶음에서 빠뜨리지 않기 위해서다.
   *
   * 기설치 조사 내역이 그렇다(한백 지시 2026-08-25): 대수·kW·운영사가 적힌 조사 결과는
   * 올린 파일이 아니라 입력값이라, 서류를 다 받아도 그 내역만 화면에 남아 따로 옮겨
   * 적어야 했다. 여기서 글자를 그대로 .txt 로 만들어 같은 zip 에 넣는다.
   */
  extra?: Array<{ name: string; text: string }>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const withFiles = docs.filter((d) => d.files.length > 0);
  /* 세는 것은 칸이 아니라 장이다 — 「전체 다운로드 (N)」의 N 과 zip 안의 파일 수가 같아야 한다 */
  const total = withFiles.reduce((n, d) => n + d.files.length, 0) + extra.length;

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const zip = new JSZip();
      const failed: string[] = [];
      /*
       * 파일 아닌 값을 먼저 넣는다 — 받아올 것이 없어 실패할 수 없다.
       * BOM 을 앞에 붙인다: 없으면 윈도우 메모장·엑셀이 한글을 깨뜨려 읽는다.
       */
      for (const e of extra) zip.file(`${safe(siteName)}_${safe(e.name)}.txt`, `\uFEFF${e.text}`);
      /*
       * 한 칸에 여러 장이 있으면 전부 넣는다 — 두 번째부터 이름에 (2)·(3) 이 붙는다
       * (docFileName). 예전에는 첫 장만 받아서, 두 장으로 스캔한 회의록의 뒷장이
       * 묶음에서 조용히 빠졌다.
       */
      for (const d of withFiles) {
        for (const [i, f] of d.files.entries()) {
          try {
            const res = await fetch(f.url);
            if (!res.ok) throw new Error(String(res.status));
            zip.file(docFileName(siteName, labelOf(d.kind), f, i), await res.blob());
          } catch {
            failed.push(d.files.length > 1 ? `${labelOf(d.kind)}(${i + 1})` : labelOf(d.kind));
          }
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
        disabled={busy || total === 0}
        onClick={run}
        className="rounded-ctl border border-slate-300 bg-white px-2.5 py-1.5 text-small font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
      >
        {busy ? '묶는 중…' : `전체 다운로드 (${total})`}
      </button>
      {error && <span className="text-tiny font-semibold text-amber-700">{error}</span>}
    </div>
  );
}

/**
 * 서류 올리기 · 바꾸기.
 *
 * ★한 칸에 파일 하나다.★ 이미 있는 칸에 올리면 갈아치운다 — 쌓이지 않고, 이전 파일은
 * 저장소에서도 지워진다(app/api/projects/[id]/documents/[kind]/file). 그래서 파일이 이미
 * 있으면 버튼을 「파일 바꾸기」로 부른다 — 「업로드」로 두면 쌓이는 것처럼 읽힌다.
 * 「올리기」가 아니라 「파일 업로드」다(한백 확인) — 무엇을 올리는지 버튼이 말한다.
 *
 * 브라우저가 Blob 에 직접 올린다 — 서버를 거치면 스캔본이 4.5MB 를 넘을 때 막힌다.
 * 올리고 나면 반려가 자동으로 풀리고 공이 한백으로 넘어간다.
 *
 * ★끌어다 놓아도 올라간다★ (한백 요청 2026-08-24) — 파일을 창으로 끌고 들어오면 그때
 * 칸마다 드롭 자리가 펴진다. 접수 화면(UploadZone)은 원래 그렇게 되는데 서류 칸은
 * 클릭뿐이라, 스캔한 서류를 폴더에서 바로 끌어 놓을 수 없었다.
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
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  /** 여러 장을 올리는 중이면 몇 장째인가 — 단추가 그것을 말한다 */
  const [queue, setQueue] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const filesInFlight = useFileDragging();
  /** 이 칸 위에 있는가 — 창 전체의 드래그와 달리 놓을 자리를 가리킨다 */
  const [over, setOver] = useState(false);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = ''; // 같은 파일을 다시 고를 수 있게 비운다
    if (picked.length > 0) void uploadAll(picked);
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setOver(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length > 0) void uploadAll(dropped);
  }

  /**
   * 고른 것을 차례로 올린다 — 한 칸에 여러 장이 붙는다(한백 지시 2026-08-25).
   *
   * 겹쳐 올리지 않는다: 붙이는 쪽이 그 칸의 파일 목록을 읽고 한 장을 더한 뒤 저장하므로
   * (pg-store uploadDocument) 두 개가 같이 들어오면 나중 것이 앞의 것을 덮는다.
   * 몇 장째인지 단추에 적는다 — 스캔본 다섯 장이면 한참 걸린다.
   */
  async function uploadAll(files: File[]) {
    setQueue({ done: 0, total: files.length });
    for (const [i, file] of files.entries()) {
      setQueue({ done: i, total: files.length });
      const ok = await upload(file);
      // 한 장이 막히면 멈춘다 — 왜 막혔는지(용량·형식) 다음 장에도 똑같이 걸린다
      if (!ok) break;
    }
    setQueue(null);
  }

  async function upload(file: File): Promise<boolean> {
    setBusy(true);
    setError(null);
    setPct(0);
    /*
     * 왜 안 되는지를 여기서 적는다 — 크기·형식은 Blob 이 올리는 도중에 거절하고,
     * 그 실패는 아래 catch 에서 「오류가 났습니다」 한 줄로 뭉개졌다. 30MB 를 넘는
     * 사진대지 엑셀이 실제로 그렇게 튕겼고, 화면만 봐서는 형식 탓인지 알 수 없었다.
     */
    if (file.size > MAX_DOC_BYTES) {
      setError(`${mb(file.size)}MB — 한 파일은 ${mb(MAX_DOC_BYTES)}MB 까지입니다. 사진을 줄이거나 나눠서 올려 주세요.`);
      setBusy(false);
      return false;
    }
    try {
      const ext = (file.name.split('.').pop() ?? 'pdf').toLowerCase();
      // 경로는 서버가 검사한다. 시각을 붙여 이전 파일을 덮지 않게 한다.
      const pathname = `projects/${projectId}/${kind}-${Date.now()}.${ext}`;

      const tokenRes = await fetch(
        `/api/projects/${projectId}/documents/${kind}/file?step=token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pathname, contentType: docContentType(file.name, file.type) }),
        }
      );
      const tokenBody = (await tokenRes.json().catch(() => ({}))) as { token?: string; error?: string };
      if (!tokenRes.ok || !tokenBody.token) {
        setError(tokenBody.error ?? '업로드 준비에 실패했습니다.');
        return false;
      }

      const { put } = await import('@vercel/blob/client');
      const blob = await put(pathname, file, {
        access: 'public',
        token: tokenBody.token,
        /*
         * 형식은 확장자로 정한다 — 브라우저가 말하는 것을 그대로 넘기면 한컴오피스로
         * 저장한 엑셀이 application/haansoftxlsx 라 Blob 이 거절한다(같은 xlsx 인데도).
         */
        contentType: docContentType(file.name, file.type),
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
        return false;
      }
      /*
       * 전체 새로고침을 하지 않는다 — 페이지가 다시 시작되며 보던 탭이 URL 의 ?tab=
       * (또는 기본 탭)으로 되돌아갔다. 시공 탭에서 행위신고를 올렸는데 계약 탭이
       * 열리는 증상이 이것이었다(한백 확인). refresh 는 서버 데이터만 다시 그린다.
       */
      router.refresh();
      return true;
    } catch (err) {
      // 삼키지 않는다 — Blob 이 거절한 이유(크기·형식)가 여기에만 남는다
      setError(`업로드에 실패했습니다 — ${(err as Error).message}`);
      return false;
    } finally {
      setBusy(false);
    }
  }

  /*
   * 파일을 끌고 들어오면 ★칸 전체★가 드롭 자리가 된다 (한백 지시 2026-08-30).
   *
   * 예전에는 단추만 넓어졌다 — 카드 아래쪽 한 줄이라, 카드 어디에 놓아도 되는 줄 알고
   * 제목이나 파일 목록 위에 놓으면 브라우저가 그 파일을 새 탭으로 열어 버렸다(작업하던
   * 화면이 사라진다). 칸을 덮는 자리를 띄운다: 조준할 것이 없어진다.
   *
   * 덮개는 ★끌고 있을 때만★ 뜬다 — 평소에 깔려 있으면 카드 안의 링크·단추를 다 가린다.
   * 올리는 중에는 안 띄운다(진행률이 보여야 한다).
   *
   * 자리를 잡으려면 카드에 relative 가 있어야 한다 — 부르는 세 곳(계약 서류·기설치·공정
   * 서류)이 그렇게 두고 있다.
   */
  const dropOpen = filesInFlight && !busy;
  const catchDrag = {
    onDragEnter: (e: React.DragEvent) => { e.preventDefault(); setOver(true); },
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setOver(true); },
    onDragLeave: (e: React.DragEvent) => {
      // 자식으로 들어간 것은 떠난 것이 아니다 — 안 걸러내면 깜빡인다
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      setOver(false);
    },
    onDrop,
  };

  /* 자리(여백)는 부르는 쪽이 정한다 — 카드의 조작 줄에 다른 단추와 나란히 선다 */
  return (
    <div>
      {dropOpen && (
        <label
          {...catchDrag}
          className={`absolute inset-0 z-10 flex cursor-pointer items-center justify-center rounded-box border-2 border-dashed text-tiny font-bold transition ${
            over
              ? 'border-brand-500 bg-brand-50/95 text-brand-800'
              : 'border-slate-300 bg-white/90 text-slate-500'
          }`}
        >
          여기에 놓기
          <input type="file" multiple className="hidden" onChange={onPick} disabled={busy} />
        </label>
      )}
      <label
        {...catchDrag}
        className={`inline-flex cursor-pointer items-center rounded-ctl px-2 py-1 text-tiny font-bold transition ${
          rejected
            ? 'bg-brand-600 text-white hover:bg-brand-700'
            : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
        } ${busy ? 'pointer-events-none opacity-60' : ''}`}
      >
        {busy
          ? `${queue && queue.total > 1 ? `${queue.done + 1}/${queue.total} · ` : ''}업로드 중 ${pct}%`
          /*
            * 이미 파일이 있으면 「추가」다 — 예전에는 「바꾸기」였고 실제로 갈아치웠다.
            * 지금은 쌓이므로(migrations/0021) 바꾸기라고 적으면 앞 파일이 사라진다고 읽힌다.
            */
          : rejected && hasFile ? '다시 업로드' : hasFile ? '파일 추가' : '파일 업로드'}
        <input type="file" multiple className="hidden" onChange={onPick} disabled={busy} />
      </label>
      <Err className="mt-1 block">{error}</Err>
    </div>
  );
}
