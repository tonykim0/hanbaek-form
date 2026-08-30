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
import { PDFDocument } from 'pdf-lib';

export interface NormalizedFile {
  name: string;
  buffer: Buffer;
  hash: string;
  /** application/pdf(=AI 분류 대상) 또는 xlsx/pptx 등 원본 첨부(통과) */
  mimeType: string;
}

/** PDF(및 이미지→PDF 변환본)만 AI 분류 대상. 그 외는 원본 그대로 첨부(통과) */
export function isPdfFile(file: NormalizedFile): boolean {
  return file.mimeType === 'application/pdf';
}

// 원본 그대로 첨부하는 통과 파일 형식 (AI 분류·분할 안 함)
const PASSTHROUGH_TYPES: Record<string, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint',
};

const ZIP_SIGNATURES = [
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from([0x50, 0x4b, 0x05, 0x06]),
  Buffer.from([0x50, 0x4b, 0x07, 0x08]),
];

/**
 * ZIP Buffer에서 PDF를 추출합니다 (Vercel Blob 경유 업로드용).
 */
export async function extractAndHashFromZipBuffer(buffer: Buffer): Promise<NormalizedFile[]> {
  return extractPDFsFromZip(buffer);
}

export function isZipBuffer(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  return ZIP_SIGNATURES.some((signature) => buffer.subarray(0, 4).equals(signature));
}

async function extractPDFsFromZip(buffer: Buffer): Promise<NormalizedFile[]> {
  if (!isZipBuffer(buffer)) {
    throw new Error('ZIP 형식이 아닙니다.');
  }

  const zip = await JSZip.loadAsync(buffer);
  const pdfs: NormalizedFile[] = [];

  for (const [path, zipFile] of Object.entries(zip.files)) {
    if (zipFile.dir) continue;
    if (path.startsWith('__MACOSX/')) continue;

    const lower = path.toLowerCase();
    const isPdf = lower.endsWith('.pdf');
    const isPng = lower.endsWith('.png');
    const isJpg = lower.endsWith('.jpg') || lower.endsWith('.jpeg');
    const isHeic = lower.endsWith('.heic') || lower.endsWith('.heif');
    const ext = lower.split('.').pop() ?? '';
    const passthroughType = PASSTHROUGH_TYPES[ext];
    if (!isPdf && !isPng && !isJpg && !isHeic && !passthroughType) continue;

    const sourceBuffer = await zipFile.async('nodebuffer');
    const baseName = (path.split('/').pop() ?? path).normalize('NFC');

    if (isPdf) {
      pdfs.push({
        name: baseName,
        buffer: sourceBuffer,
        hash: sha256(sourceBuffer),
        mimeType: 'application/pdf',
      });
      continue;
    }

    // xlsx/pptx 등: 변환·분류 없이 원본 그대로 첨부
    if (passthroughType) {
      pdfs.push({
        name: baseName,
        buffer: sourceBuffer,
        hash: sha256(sourceBuffer),
        mimeType: passthroughType,
      });
      continue;
    }

    // 이미지→PDF 변환 실패(손상·비표준 이미지) 시 해당 파일만 건너뜀 (전체 실패 방지)
    try {
      let pdfBuffer: Buffer;
      if (isHeic) {
        // HEIC(아이폰 사진)는 PNG로 먼저 변환 후 PDF 임베드
        const png = await heicToPng(sourceBuffer);
        pdfBuffer = await imageToPdf(png, 'png');
      } else {
        pdfBuffer = await imageToPdf(sourceBuffer, isPng ? 'png' : 'jpg');
      }
      const pdfName = baseName.replace(/\.(png|jpe?g|heic|heif)$/i, '.pdf');
      pdfs.push({
        name: pdfName,
        buffer: pdfBuffer,
        hash: sha256(pdfBuffer),
        mimeType: 'application/pdf',
      });
    } catch (err) {
      console.warn(`[files] 이미지 변환 실패, 건너뜀: ${baseName}`, err);
    }
  }

  return pdfs;
}

/**
 * HEIC/HEIF → PNG 변환. heic-convert(libheif wasm)를 필요할 때만 동적 로드.
 * (JPEG 출력은 pdf-lib embedJpg가 거부하는 경우가 있어 PNG로 변환)
 */
async function heicToPng(heicBuffer: Buffer): Promise<Buffer> {
  const convert = (await import('heic-convert')).default;
  const out = await convert({ buffer: heicBuffer, format: 'PNG' });
  return Buffer.from(out);
}

async function imageToPdf(imageBuffer: Buffer, kind: 'png' | 'jpg'): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const image = kind === 'png'
    ? await pdfDoc.embedPng(imageBuffer)
    : await pdfDoc.embedJpg(imageBuffer);
  const page = pdfDoc.addPage([image.width, image.height]);
  page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  return Buffer.from(await pdfDoc.save());
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * 표준 파일명 생성: {현장명}_{카테고리}.{ext}
 * 파일명에 허용되지 않는 문자는 '_'로 대체. ext 기본값은 pdf.
 *
 * ★「기타」만 제목을 뒤에 붙인다 (한백 지적 2026-08-31).★ 나머지 스무 카테고리는 이름이
 * 곧 그 서류가 무엇인지를 말하지만, 기타는 「위 스무 개가 아니다」는 말뿐이라 무슨 서류인지
 * 이름에서 사라졌다 — 통합 PDF 에서 잘려 나온 조각은 원본 파일명조차 없어서, 열어 보기
 * 전에는 알 길이 없었다. 그래서 판독기가 읽은 문서 제목을 이름에 싣는다:
 *   {현장명}_기타_전기차 등록대수 확인 공문.pdf
 * 제목이 없으면(판독 실패·이름 규칙만으로 온 파일) 그냥 「기타」다 — 없는 것을 지어내지 않는다.
 */
export function buildStandardName(
  현장명: string,
  category: string,
  ext: string = 'pdf',
  /** 문서에 적힌 제목 — 기타일 때만 쓴다 */
  title?: string | null
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
    '사진대지': '사진대지',
    '입주자대표회의 회의록': '회의록',
    '관리단 회의록': '관리단회의록',
    '한전 전기요금 청구서': '한전청구서',
    '건축물대장': '건축물대장',
    'K-apt 스크린샷': 'kapt스크린샷',
    '설치승인서': '설치승인서',
    '사업자등록증': '사업자등록증',
    '고유번호증': '고유번호증',
    '실사보고서': '실사보고서',
    '견적서': '견적서',
    '기타': '기타',
  };

  const catShort = categoryShort[category] ?? '기타';
  // Windows/macOS 파일명 금지 문자 제거
  const clean = (v: string) => v.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
  const safeName = clean(현장명);
  /*
   * 제목은 기타에만, 그리고 길이를 자른다 — 공문 제목이 한 문장인 일이 있어서
   * 그대로 붙이면 파일명이 화면 밖으로 나간다. 자를 때는 말줄임을 넣지 않는다(파일명이다).
   */
  const tail = catShort === '기타' && title?.trim()
    /* 공백 접기가 먼저다 — 뒤에 하면 줄바꿈이 금지 문자로 잡혀 「협조_요청」이 된다 */
    ? `_${clean(title.replace(/\s+/g, ' ')).slice(0, 40)}`
    : '';
  return `${safeName}_${catShort}${tail}.${ext}`;
}
