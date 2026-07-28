/**
 * Notion API 클라이언트.
 * - 노션 DB entry 생성 (전기차 실사관리)
 * - 파일 업로드 + 페이지 첨부 (Notion File Upload API)
 *
 * 서버 사이드 전용.
 */
import { Client, APIResponseError } from '@notionhq/client';
import JSZip from 'jszip';
import type { ExtractedMetadata, ClassifiedFile, ClassifiedFileInfo, FileCategory } from '@/types/intake';
import type { NormalizedFile } from './files';
import { buildStandardName } from './files';
import { splitPdf } from './pdf-split';
import { createHash } from 'crypto';

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DB_ID = process.env.NOTION_DB_ID!;

export interface SalesRep {
  name: string;
  company: string;
}

/**
 * 노션 DB에 신규 entry를 생성합니다.
 * 메타데이터가 없어도 생성 가능 (Claude 실패 fallback).
 */
export async function createNotionEntry(
  salesRep: SalesRep,
  metadata: ExtractedMetadata | null
): Promise<{ id: string; url: string }> {
  const currentYear = new Date().getFullYear();

  const properties: Record<string, any> = {
    '현장명': {
      title: [{ text: { content: metadata?.현장명 ?? '(미확인)' } }],
    },
    '영업현황': { select: { name: '계약완료' } },
    '*사업연도': { select: { name: `${currentYear}년` } },
    '접수자': { rich_text: [{ text: { content: salesRep.name } }] },
    '접수자 소속': { rich_text: [{ text: { content: salesRep.company } }] },
  };

  if (metadata) {
    if (metadata.주소) {
      properties['현장주소'] = { rich_text: [{ text: { content: metadata.주소 } }] };
    }
    if (metadata.건축물유형) {
      properties['건축물 유형'] = { select: { name: metadata.건축물유형 } };
    }
    if (metadata.CPO && metadata.CPO.length > 0) {
      properties['운영사'] = { select: { name: metadata.CPO[0] } };
    }
    if (metadata.계약대수 != null) {
      properties['계약대수'] = { number: metadata.계약대수 };
    }
    if (metadata.계약기간) {
      properties['계약기간'] = { select: { name: metadata.계약기간 } };
    }
    if (metadata.총주차면수 != null) {
      properties['총 주차면수'] = { number: metadata.총주차면수 };
    }
    if (metadata.전력인입) {
      const mapped = mapPowerInletToSujeon(metadata.전력인입);
      if (mapped) properties['수전방식'] = { select: { name: mapped } };
    }
    if (metadata.현장담당자) {
      properties['현장담당자'] = {
        rich_text: [{ text: { content: metadata.현장담당자 } }],
      };
    }
    if (metadata.현장연락처) {
      properties['현장연락처'] = { phone_number: metadata.현장연락처 };
    }
    const has설치신청서 = metadata.files.some(
      (f) => f.category === '전기차충전시설 설치신청서'
    );
    if (has설치신청서) {
      properties['사업구분'] = { select: { name: '환경부' } };
    }
  }

  const page = await notion.pages.create({
    parent: { database_id: DB_ID },
    properties,
  });

  return {
    id: page.id,
    url: (page as { url: string }).url,
  };
}

/**
 * PDF 파일들을 Notion File Upload API로 페이지에 첨부합니다.
 *
 * 통합 PDF(1개 파일에 여러 서류)인 경우:
 *   Claude가 pages 필드로 서류별 페이지 범위를 지정하면
 *   pdf-lib로 분할하여 각각 개별 파일로 첨부합니다.
 *
 * rate limit: 3 req/sec → 파일 간 400ms sleep
 */
export async function attachFilesToPage(
  pageId: string,
  files: NormalizedFile[],
  metadata: ExtractedMetadata | null
): Promise<ClassifiedFile[]> {
  const today = formatToday();
  const uploadItems = await buildUploadItems(files, metadata);
  const { classifiedFiles } = await attachUploadItemsToPage(pageId, uploadItems, today);
  return classifiedFiles;
}

export interface UploadItem {
  originalName: string;
  category: FileCategory;
  standardName: string;
  buffer: Buffer;
}

export interface AttachmentProgress {
  current: number;
  total: number;
  standardName: string;
  item: UploadItem;
}

export interface AttachUploadItemsOptions {
  onProgress?: (progress: AttachmentProgress) => void;
  /** 지정 시, 모든 분할 파일을 한 번에 압축한 ZIP을 페이지 상단에 추가로 첨부 */
  siteName?: string;
}

export interface AttachUploadItemsResult {
  classifiedFiles: ClassifiedFile[];
  warnings: string[];
}

/**
 * 통합 PDF 분할을 포함한 업로드 항목 목록 생성.
 */
export async function buildUploadItems(
  files: NormalizedFile[],
  metadata: ExtractedMetadata | null
): Promise<UploadItem[]> {
  const items: UploadItem[] = [];

  for (const file of files) {
    const normalName = file.name.normalize('NFC');

    // 이 파일에 매칭되는 metadata entries (통합 PDF면 여러 개)
    const matchedInfos: ClassifiedFileInfo[] = metadata?.files.filter(
      (f) => f.originalName.normalize('NFC') === normalName
    ) ?? [];

    if (matchedInfos.length <= 1) {
      // 일반 케이스: 1파일 = 1서류 (또는 metadata 없음)
      const category = matchedInfos[0]?.category ?? '기타';
      items.push({
        originalName: file.name,
        category,
        standardName: metadata?.현장명
          ? buildStandardName(metadata.현장명, category)
          : file.name,
        buffer: file.buffer,
      });
    } else {
      // 통합 PDF: pages 기반 분할
      // 페이지 분리 금지 카테고리는 같은 파일 내 항목들을 하나로 합침
      const merged = mergeNoSplitCategories(matchedInfos);

      for (const info of merged) {
        let buffer: Buffer;
        if (info.pages && info.pages.length > 0) {
          buffer = await splitPdf(file.buffer, info.pages);
        } else {
          buffer = file.buffer;
        }

        items.push({
          originalName: file.name,
          category: info.category,
          standardName: metadata?.현장명
            ? buildStandardName(metadata.현장명, info.category)
            : file.name,
          buffer,
        });
      }
    }
  }

  return items;
}

export async function attachUploadItemsToPage(
  pageId: string,
  uploadItems: UploadItem[],
  today: string,
  options: AttachUploadItemsOptions = {}
): Promise<AttachUploadItemsResult> {
  const classifiedFiles: ClassifiedFile[] = [];
  const warnings: string[] = [];
  const nameCount = new Map<string, number>();

  // 개별 파일 이름(중복 시 _2, _3 ...)을 사전 확정 → ZIP 내부/페이지 블록 동일
  const resolvedItems = uploadItems.map((item) => ({
    item,
    uniqueName: createUniqueFileName(item.standardName, nameCount),
  }));

  const siteName = options.siteName?.trim() ?? '';
  const shouldBundle = siteName.length > 0 && resolvedItems.length > 1;
  const totalSteps = resolvedItems.length + (shouldBundle ? 1 : 0);
  let currentStep = 0;

  // ── 번들 ZIP 먼저 첨부 (페이지 상단 위치) ────────────────────
  if (shouldBundle) {
    currentStep++;
    const zipName = buildBundleZipName(siteName);

    options.onProgress?.({
      current: currentStep,
      total: totalSteps,
      standardName: zipName,
      item: {
        originalName: zipName,
        category: '기타',
        standardName: zipName,
        buffer: Buffer.alloc(0),
      },
    });

    try {
      const zipBuffer = await buildBundleZip(resolvedItems);
      await uploadAndAttach(pageId, zipBuffer, zipName, 'application/zip');
      await sleep(400);
    } catch (err) {
      console.error('[notion] 번들 ZIP 첨부 실패:', err);
      warnings.push(`${zipName} 첨부 실패`);
    }
  }

  // ── 개별 파일 첨부 ──────────────────────────────────────────
  for (const { item, uniqueName } of resolvedItems) {
    currentStep++;

    options.onProgress?.({
      current: currentStep,
      total: totalSteps,
      standardName: uniqueName,
      item,
    });

    try {
      await uploadAndAttach(pageId, item.buffer, uniqueName);
      classifiedFiles.push({
        originalName: item.originalName,
        category: item.category,
        date: today,
        standardName: uniqueName,
        hash: createHash('sha256').update(item.buffer).digest('hex'),
      });
    } catch (err) {
      const code = err instanceof APIResponseError ? err.code : 'unknown';
      console.error(`[notion] 파일 첨부 실패 (${uniqueName}) code=${code}:`, err);
      warnings.push(`${uniqueName} 첨부 실패`);
    }

    await sleep(400);
  }

  return { classifiedFiles, warnings };
}

function mapPowerInletToSujeon(value: string): string | null {
  const map: Record<string, string> = {
    '모자분리': '모자분리',
    '한전수전': '한전불입',
    '모자분리 + 한전수전': '한전불입+모자분리',
  };
  return map[value] ?? null;
}

function buildBundleZipName(siteName: string): string {
  const safe = siteName.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
  return `${safe}_전체.zip`;
}

async function buildBundleZip(
  resolvedItems: Array<{ item: UploadItem; uniqueName: string }>
): Promise<Buffer> {
  const zip = new JSZip();
  for (const { item, uniqueName } of resolvedItems) {
    zip.file(uniqueName, item.buffer);
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/** 일시적 오류(네트워크·429·5xx)에 한해 지수 백오프로 재시도한다. */
async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  attempts = 3
): Promise<T> {
  let lastError: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i >= attempts || !isRetryableError(err)) break;
      console.warn(`[notion] ${label} 재시도 ${i}/${attempts - 1}:`, err);
      await sleep(500 * i);
    }
  }
  throw lastError;
}

function isRetryableError(err: unknown): boolean {
  if (err instanceof APIResponseError) {
    return err.status === 429 || err.status >= 500;
  }
  // fetch 헬퍼가 던지는 "... failed: <status> ..." 메시지에서 상태코드 판별
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.match(/failed:\s*(\d{3})/);
  if (m) {
    const s = Number(m[1]);
    return s === 429 || s >= 500;
  }
  return true; // 네트워크/알 수 없는 오류 → 재시도
}

/**
 * 단일 파일을 Notion에 업로드 + 페이지에 블록 첨부.
 * 각 단계(업로드 세션/전송, 블록 첨부)를 일시 오류 시 재시도해 누락을 줄인다.
 */
export async function uploadAndAttach(
  pageId: string,
  buffer: Buffer,
  standardName: string,
  contentType: string = 'application/pdf'
): Promise<void> {
  // Step 1+2: 업로드 세션 생성 + 바이너리 전송 (재시도 시 새 세션 발급 → 중복 없음)
  const fileUploadId = await withRetry(async () => {
    const createRes = await fetch('https://api.notion.com/v1/file_uploads', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ filename: standardName, content_type: contentType }),
    });
    if (!createRes.ok) {
      throw new Error(`file_uploads.create failed: ${createRes.status} ${await createRes.text()}`);
    }
    const fileUpload = (await createRes.json()) as { id: string };

    const formData = new FormData();
    const ab = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    ) as ArrayBuffer;
    formData.append('file', new Blob([ab], { type: contentType }), standardName);

    const sendRes = await fetch(
      `https://api.notion.com/v1/file_uploads/${fileUpload.id}/send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
          'Notion-Version': '2022-06-28',
        },
        body: formData,
      }
    );
    if (!sendRes.ok) {
      throw new Error(`file_uploads.send failed: ${sendRes.status} ${await sendRes.text()}`);
    }
    return fileUpload.id;
  }, `업로드(${standardName})`);

  // Step 3: 페이지 블록으로 첨부
  await withRetry(
    () =>
      notion.blocks.children.append({
        block_id: pageId,
        children: [createFileBlock(standardName, fileUploadId) as any],
      }),
    `첨부(${standardName})`
  );
}

function createFileBlock(name: string, fileUploadId: string) {
  return {
    type: 'file',
    file: {
      file_upload: { id: fileUploadId },
      name,
    },
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatToday(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}${mm}${dd}`;
}

function createUniqueFileName(
  standardName: string,
  nameCount: Map<string, number>
): string {
  const count = (nameCount.get(standardName) ?? 0) + 1;
  nameCount.set(standardName, count);
  return count > 1 ? standardName.replace('.pdf', `_${count}.pdf`) : standardName;
}

// 여러 페이지여도 하나의 파일로 유지해야 하는 카테고리
// (계약서: SK 별첨1·현대 운영서비스계약서+약관처럼 계약 관련 페이지는 항상 1개 파일로 통합)
const NO_SPLIT_CATEGORIES = new Set<string>([
  '계약서',
  '한전 전기요금 청구서',
  '건축물대장',
]);

/**
 * NO_SPLIT_CATEGORIES에 해당하는 항목은 같은 카테고리끼리 pages를 합쳐 1개 항목으로 만든다.
 */
function mergeNoSplitCategories(infos: ClassifiedFileInfo[]): ClassifiedFileInfo[] {
  const result: ClassifiedFileInfo[] = [];
  const merged = new Map<string, ClassifiedFileInfo>();

  for (const info of infos) {
    if (!NO_SPLIT_CATEGORIES.has(info.category)) {
      result.push(info);
      continue;
    }
    const existing = merged.get(info.category);
    if (!existing) {
      merged.set(info.category, { ...info, pages: info.pages ? [...info.pages] : [] });
    } else {
      if (info.pages) existing.pages = [...(existing.pages ?? []), ...info.pages];
    }
  }

  return [...result, ...merged.values()];
}
