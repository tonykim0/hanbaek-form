/**
 * 파일 정규화 유틸리티.
 * - ZIP → 내부 PDF 추출
 * - SHA256 해시 계산 (중복 차단용)
 * - 표준 네이밍 생성: {현장명}_{카테고리}_{날짜}.pdf
 *
 * 서버 사이드 전용 (Node.js crypto, jszip).
 */
import JSZip from 'jszip';
import { createHash } from 'crypto';

export interface NormalizedFile {
  name: string;
  buffer: Buffer;
  hash: string;
  mimeType: 'application/pdf';
}

/**
 * File[] (multipart/form-data)을 받아 PDF 목록으로 정규화.
 * ZIP은 압축 해제하여 내부 PDF만 추출.
 */
export async function extractAndHashFiles(files: File[]): Promise<NormalizedFile[]> {
  const result: NormalizedFile[] = [];

  for (const file of files) {
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    if (file.name.toLowerCase().endsWith('.zip')) {
      const pdfs = await extractPDFsFromZip(buffer);
      result.push(...pdfs);
    } else if (file.name.toLowerCase().endsWith('.pdf')) {
      result.push({
        name: file.name,
        buffer,
        hash: sha256(buffer),
        mimeType: 'application/pdf',
      });
    }
    // HWP, XLSX 등 지원하지 않는 형식은 무시
  }

  return result;
}

/**
 * ZIP Buffer에서 PDF를 추출합니다 (Vercel Blob 경유 업로드용).
 */
export async function extractAndHashFromZipBuffer(buffer: Buffer): Promise<NormalizedFile[]> {
  return extractPDFsFromZip(buffer);
}

async function extractPDFsFromZip(buffer: Buffer): Promise<NormalizedFile[]> {
  const zip = await JSZip.loadAsync(buffer);
  const pdfs: NormalizedFile[] = [];

  for (const [path, zipFile] of Object.entries(zip.files)) {
    if (zipFile.dir) continue;
    if (!path.toLowerCase().endsWith('.pdf')) continue;
    // macOS ZIP의 __MACOSX 메타데이터 항목 제외
    if (path.startsWith('__MACOSX/')) continue;

    const pdfBuffer = await zipFile.async('nodebuffer');
    // macOS ZIP의 NFD 한글 파일명을 NFC로 정규화
    const name = (path.split('/').pop() ?? path).normalize('NFC');

    pdfs.push({
      name,
      buffer: pdfBuffer,
      hash: sha256(pdfBuffer),
      mimeType: 'application/pdf',
    });
  }

  return pdfs;
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * 표준 파일명 생성: {현장명}_{카테고리}_{날짜}.pdf
 * 파일명에 허용되지 않는 문자는 '_'로 대체.
 */
export function buildStandardName(
  현장명: string,
  category: string,
  date: string
): string {
  // 파일명용 카테고리 줄임말
  const categoryShort: Record<string, string> = {
    '계약서': '계약서',
    '합의서': '합의서',
    '직인사용 동의서': '직인동의서',
    '행위신고 업무대행 동의서': '행위신고동의서',
    '전기차충전시설 설치신청서': '설치신청서',
    '개인정보 동의서': '개인정보동의서',
    '사전현장컨설팅 결과서': '사전컨설팅',
    '입주자대표회의 회의록': '회의록',
    '한전 전기요금 청구서': '한전청구서',
    '건축물대장': '건축물대장',
    '실사보고서': '실사보고서',
    '기타': '기타',
  };

  const catShort = categoryShort[category] ?? '기타';
  // Windows/macOS 파일명 금지 문자 제거
  const safeName = 현장명.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
  return `${safeName}_${catShort}_${date}.pdf`;
}
