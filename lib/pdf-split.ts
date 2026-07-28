/**
 * PDF 분할 유틸리티.
 * 통합 PDF에서 지정된 페이지 범위를 추출하여 새 PDF를 생성합니다.
 */
import { PDFDocument } from 'pdf-lib';

/**
 * 원본 PDF에서 지정된 페이지들만 추출하여 새 PDF Buffer를 생성합니다.
 * @param pdfBuffer 원본 PDF
 * @param pages 추출할 페이지 번호 배열 (1-based)
 */
export async function splitPdf(
  pdfBuffer: Buffer,
  pages: number[]
): Promise<Buffer> {
  const srcDoc = await PDFDocument.load(pdfBuffer);
  const newDoc = await PDFDocument.create();

  // pages는 1-based, pdf-lib는 0-based
  const indices = pages.map((p) => p - 1).filter((i) => i >= 0 && i < srcDoc.getPageCount());

  const copiedPages = await newDoc.copyPages(srcDoc, indices);
  for (const page of copiedPages) {
    newDoc.addPage(page);
  }

  const bytes = await newDoc.save();
  return Buffer.from(bytes);
}

/**
 * 여러 PDF Buffer를 순서대로 이어붙여 하나의 PDF Buffer로 병합합니다.
 * (예: 건축물대장 + K-apt 스크린샷)
 */
export async function mergePdfs(buffers: Buffer[]): Promise<Buffer> {
  const mergedDoc = await PDFDocument.create();

  for (const buf of buffers) {
    const srcDoc = await PDFDocument.load(buf);
    const copiedPages = await mergedDoc.copyPages(srcDoc, srcDoc.getPageIndices());
    for (const page of copiedPages) {
      mergedDoc.addPage(page);
    }
  }

  const bytes = await mergedDoc.save();
  return Buffer.from(bytes);
}
