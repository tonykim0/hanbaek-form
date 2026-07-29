/**
 * PDF 분할 유틸리티.
 * 통합 PDF에서 지정된 페이지 범위를 추출하여 새 PDF를 생성합니다.
 */
import { PDFDocument } from 'pdf-lib';

// 암호화(권한 설정)된 PDF도 열 수 있도록 (한전 청구서·일부 스캔본은 /Encrypt 포함)
const LOAD_OPTS = { ignoreEncryption: true } as const;

/**
 * 원본 PDF에서 지정된 페이지들만 추출하여 새 PDF Buffer를 생성합니다.
 * @param pdfBuffer 원본 PDF
 * @param pages 추출할 페이지 번호 배열 (1-based)
 *
 * 실패(암호화/손상/범위 초과)해도 예외를 던지지 않고 원본 버퍼를 그대로 반환한다.
 * → 서류 1개 문제로 접수 전체가 실패하는 것을 방지 (분할만 생략, 첨부는 유지).
 */
export async function splitPdf(
  pdfBuffer: Buffer,
  pages: number[]
): Promise<Buffer> {
  try {
    const srcDoc = await PDFDocument.load(pdfBuffer, LOAD_OPTS);
    const newDoc = await PDFDocument.create();

    // pages는 1-based, pdf-lib는 0-based
    const indices = pages
      .map((p) => p - 1)
      .filter((i) => i >= 0 && i < srcDoc.getPageCount());

    // 유효한 페이지가 하나도 없으면 원본을 그대로 반환 (빈 PDF 방지)
    if (indices.length === 0) {
      console.warn('[pdf-split] 유효 페이지 없음 → 원본 반환', { pages });
      return pdfBuffer;
    }

    const copiedPages = await newDoc.copyPages(srcDoc, indices);
    for (const page of copiedPages) {
      newDoc.addPage(page);
    }

    const bytes = await newDoc.save();
    return Buffer.from(bytes);
  } catch (err) {
    console.warn('[pdf-split] 분할 실패 → 원본 반환:', err);
    return pdfBuffer;
  }
}

/**
 * 여러 PDF Buffer를 순서대로 이어붙여 하나의 PDF Buffer로 병합합니다.
 * (예: 건축물대장 + K-apt 스크린샷)
 *
 * 병합 자체가 완전히 실패하면 null을 반환한다 → 호출부에서 개별 첨부로 폴백.
 * 일부 버퍼만 손상된 경우 해당 버퍼만 건너뛴다.
 */
export async function mergePdfs(buffers: Buffer[]): Promise<Buffer | null> {
  try {
    const mergedDoc = await PDFDocument.create();
    let added = 0;

    for (const buf of buffers) {
      try {
        const srcDoc = await PDFDocument.load(buf, LOAD_OPTS);
        const copiedPages = await mergedDoc.copyPages(
          srcDoc,
          srcDoc.getPageIndices()
        );
        for (const page of copiedPages) {
          mergedDoc.addPage(page);
        }
        added++;
      } catch (err) {
        console.warn('[pdf-split] 병합 중 일부 PDF 건너뜀:', err);
      }
    }

    if (added === 0) return null;
    const bytes = await mergedDoc.save();
    return Buffer.from(bytes);
  } catch (err) {
    console.warn('[pdf-split] 병합 실패:', err);
    return null;
  }
}
