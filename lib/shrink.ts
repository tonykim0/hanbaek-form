'use client';

/**
 * 큰 서류를 줄인다 — 안의 사진을 다시 구워서. [브라우저 전용]
 *
 * ★왜 필요한가★ (한백 지시 2026-09-04 「100메가 넘어가면 그렇게 해줘」)
 * 실사보고서·사진대지가 100MB 를 넘겨 오는 일이 있다. 원인은 하나다 — 휴대폰 원본 사진을
 * 줄이지 않고 그대로 박는다. 실측(2026-09-04):
 *
 *   실사보고서 PDF 18쪽   159MB → 3.7MB   (덩치의 대부분이 사진, 글자는 1만 자뿐)
 *   사진대지 엑셀 20장     16MB → 3.9MB   (덩치의 96% 가 사진)
 *
 * A4 에 인쇄되는 크기보다 훨씬 큰 해상도가 들어 있다. 150dpi·1600px 로 다시 구우면
 * 인쇄 품질은 그대로면서 수십 분의 일이 된다.
 *
 * ★브라우저에서 줄인다.★ 서버로 보내 줄이면 큰 파일을 일단 올려야 해서 업로드 시간·
 * 끊김이 그대로다. 여기서 줄이면 올라가는 것 자체가 작아지고, 접수 ZIP·판독 한도도
 * 안 건드린다.
 *
 * ★원본은 안 건드린다.★ 새 File 을 만들어 돌려줄 뿐이고, 사람 컴퓨터의 파일은 그대로다.
 * 못 줄이면 null 이다 — 부르는 쪽은 원래 하던 말(용량 초과)을 한다.
 */
import { PDFDocument } from 'pdf-lib';

/** 다시 굽는 기준 — A4 인쇄에 충분하고, 화면으로 보기에도 남는다 */
const MAX_EDGE = 1600; // 엑셀·이미지: 긴 변
const PDF_DPI = 150; //   PDF: 페이지를 굽는 해상도
const QUALITY = 0.72;

export interface ShrinkResult {
  file: File;
  before: number;
  after: number;
}

export type ShrinkProgress = (done: number, total: number) => void;

/** 이 파일을 줄일 수 있는가 — 단추를 세울지 정한다 */
export function canShrink(file: File): boolean {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  return ext === 'pdf' || /^xls[xm]$/.test(ext) || /^(jpe?g|png|webp)$/.test(ext);
}

export async function shrink(file: File, onProgress?: ShrinkProgress): Promise<ShrinkResult | null> {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  try {
    const out = ext === 'pdf'
      ? await shrinkPdf(file, onProgress)
      : /^xls[xm]$/.test(ext)
        ? await shrinkXlsx(file, onProgress)
        : /^(jpe?g|png|webp)$/.test(ext)
          ? await shrinkImage(file)
          : null;
    // 줄지 않았으면 원본을 쓴다 — 이미 최적인 파일을 굳이 갈아치우지 않는다
    if (!out || out.size >= file.size) return null;
    return { file: out, before: file.size, after: out.size };
  } catch (err) {
    console.warn('[shrink] 실패:', err);
    return null;
  }
}

/* ── 그림 한 장을 다시 굽는다 ─────────────────────────────────────────── */
async function bake(blob: Blob, maxEdge = MAX_EDGE): Promise<Blob | null> {
  const bmp = await createImageBitmap(blob).catch(() => null);
  if (!bmp) return null; // WMF·EMF 처럼 브라우저가 못 읽는 것 — 원본을 그대로 둔다
  const r = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(bmp.width * r));
  cv.height = Math.max(1, Math.round(bmp.height * r));
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  /* 투명 PNG 를 JPEG 로 구우면 검게 된다 — 흰 바탕을 먼저 깐다 */
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
  bmp.close();
  return new Promise((res) => cv.toBlob(res, 'image/jpeg', QUALITY));
}

async function shrinkImage(file: File): Promise<File | null> {
  const out = await bake(file);
  return out ? new File([out], file.name, { type: 'image/jpeg' }) : null;
}

/* ── 엑셀 — 안의 사진만 갈아 끼운다 (표·수식은 그대로) ──────────────── */
async function shrinkXlsx(file: File, onProgress?: ShrinkProgress): Promise<File | null> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const media = Object.keys(zip.files).filter(
    (p) => p.startsWith('xl/media/') && /\.(jpe?g|png)$/i.test(p)
  );
  if (media.length === 0) return null;

  for (const [i, path] of media.entries()) {
    onProgress?.(i, media.length);
    const blob = await zip.files[path].async('blob');
    const baked = await bake(blob);
    /*
     * 이름은 그대로 둔다 — 시트가 xl/media/image7.jpeg 를 이름으로 가리키므로
     * 확장자를 바꾸면 그림이 사라진다. 안의 바이트만 JPEG 로 바뀐다(엑셀은 읽는다).
     */
    if (baked && baked.size < blob.size) zip.file(path, baked);
  }
  onProgress?.(media.length, media.length);
  const out = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  return new File([out], file.name, { type: file.type });
}

/* ── PDF — 페이지를 통째로 다시 굽는다 ────────────────────────────────
 * ★글자가 그림이 된다★ — 검색·복사를 잃는다. 100MB 를 넘는 PDF 는 사실상 사진 묶음이라
 * (실측: 18쪽에 글자 1만 자) 그 손해가 없지만, 텍스트가 정본인 계약서에는 쓰면 안 된다.
 * 부르는 쪽이 「100MB 초과」일 때만 세우는 이유다.
 *
 * /scan 의 파이프라인과 같다(pdfjs 로 굽고 → canvas → pdf-lib 로 새 PDF).
 */
async function shrinkPdf(file: File, onProgress?: ShrinkProgress): Promise<File | null> {
  const pdfjs = await import('pdfjs-dist');
  /* 일꾼은 우리 서버에서 내려준다 — lib/pdf-render 와 같은 자리다(그 머리말 참고) */
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

  const src = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const out = await PDFDocument.create();

  for (let n = 1; n <= src.numPages; n += 1) {
    onProgress?.(n - 1, src.numPages);
    const page = await src.getPage(n);
    const view = page.getViewport({ scale: PDF_DPI / 72 });
    const cv = document.createElement('canvas');
    cv.width = Math.round(view.width);
    cv.height = Math.round(view.height);
    const ctx = cv.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, cv.width, cv.height);
    await page.render({ canvasContext: ctx, viewport: view }).promise;

    const jpg = await new Promise<Blob | null>((r) => cv.toBlob(r, 'image/jpeg', QUALITY));
    if (!jpg) return null;
    const img = await out.embedJpg(await jpg.arrayBuffer());
    /* 종이 크기는 원래 그대로 — 굽는 해상도만 낮췄지 지면이 작아지면 안 된다 */
    const size = page.getViewport({ scale: 1 });
    const p = out.addPage([size.width, size.height]);
    p.drawImage(img, { x: 0, y: 0, width: size.width, height: size.height });
    page.cleanup();
  }
  onProgress?.(src.numPages, src.numPages);
  await src.destroy();

  const bytes = await out.save();
  return new File([new Uint8Array(bytes)], file.name, { type: 'application/pdf' });
}
