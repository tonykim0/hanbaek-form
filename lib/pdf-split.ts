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
