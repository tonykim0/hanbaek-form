'use client';

/**
 * PDF 첫 장을 작은 그림으로 굽는다. [브라우저 전용]
 *
 * ★왜 필요한가★ 계약 탭에는 서류 칸이 열여섯이고 칸마다 파일 이름만 있다. 「이게 무슨
 * 서류인가」를 알려면 하나씩 열어야 했다(한백 지시 2026-08-31 「썸네일로 보여줘」).
 * 손을 올리면 뜨는 미리보기를 먼저 넣었는데, 그것은 ★한 장씩★ 보는 길이다 —
 * 열여섯 칸을 한눈에 훑으려면 늘 보이는 그림이어야 한다.
 *
 * ★한 번 구운 것은 다시 굽지 않는다.★ 같은 주소는 창을 닫을 때까지 들고 있는다 —
 * 탭을 옮겨 다시 그릴 때마다 PDF 를 또 받으면 계약 탭 한 번에 열여섯 번이 된다.
 * 굽는 중인 것도 약속으로 들고 있어서, 같은 파일을 두 곳이 동시에 물어도 한 번만 받는다.
 *
 * ★실패는 조용하다.★ 못 구우면 null 이고, 부르는 쪽은 이름만 그린다. 미리보기는 곁들이라
 * 그것 때문에 서류 칸이 깨지면 안 된다.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist';

/** 굽는 크기 — 칸 폭(넷 기준 200px 안팎)의 두 배. 화면 배율이 2 여도 흐리지 않다 */
const WIDTH = 320;

const cache = new Map<string, Promise<string | null>>();

/* pdf.js 는 무겁다(37MB 중 실려 나가는 것은 일부다) — 쓸 때 실어 온다 */
let libP: Promise<typeof import('pdfjs-dist')> | null = null;
function lib() {
  libP ??= import('pdfjs-dist').then((m) => {
    /*
     * ★일꾼은 우리 서버에서 그대로 내려준다★ — CDN 주소를 적으면 밖으로 나가는 요청이
     * 하나 늘고 그 호스트가 죽으면 우리 화면이 같이 죽는다.
     *
     * ★번들러에 태우지 않는다.★ new URL(…, import.meta.url) 로 가리키면 webpack 이
     * 정적 자산으로 뽑는데, ES 모듈인 그 파일을 Terser 가 일반 스크립트로 보고 압축하려다
     * 빌드가 멈춘다(2026-08-31 실제로 겪었다). public 의 파일은 node_modules 에서
     * 베껴 온다(scripts/copy-pdf-worker.mjs, npm predev·prebuild 가 부른다) —
     * 커밋해 두면 pdfjs-dist 를 올릴 때 API 와 일꾼의 판이 어긋난다.
     */
    m.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    return m;
  });
  return libP;
}

/**
 * 그 주소의 첫 장을 data URL 로 — 못 구우면 null.
 *
 * PDF 를 통째로 받지 않는다: pdf.js 가 조각(range)으로 받아 첫 장에 필요한 만큼만 읽는다.
 * 서류 스캔본은 장마다 이미지라 통째로 받으면 몇 MB 씩이다.
 */
export function pdfThumb(url: string): Promise<string | null> {
  const hit = cache.get(url);
  if (hit) return hit;

  const job = (async () => {
    let doc: PDFDocumentProxy | null = null;
    try {
      const pdfjs = await lib();
      doc = await pdfjs.getDocument({ url, disableAutoFetch: true, disableStream: false }).promise;
      const page = await doc.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: WIDTH / base.width });
      const cv = document.createElement('canvas');
      cv.width = Math.round(viewport.width);
      cv.height = Math.round(viewport.height);
      const ctx = cv.getContext('2d');
      if (!ctx) return null;
      /* 종이는 희다 — 칠하지 않으면 투명하게 나와 어두운 바탕에서 글자만 뜬다 */
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, cv.width, cv.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      return cv.toDataURL('image/jpeg', 0.75);
    } catch {
      return null;
    } finally {
      /* 문서를 놓아 준다 — 안 놓으면 일꾼이 파일을 물고 있어 메모리가 쌓인다 */
      void doc?.destroy();
    }
  })();

  cache.set(url, job);
  return job;
}
