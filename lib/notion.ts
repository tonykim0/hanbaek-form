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
  _salesRep: SalesRep,
  metadata: ExtractedMetadata | null
): Promise<{ id: string; url: string }> {
  const currentYear = new Date().getFullYear();

  const properties: Record<string, any> = {
    '현장명': {
      title: [{ text: { content: metadata?.현장명 ?? '(미확인)' } }],
    },
    '영업현황': { select: { name: '계약완료' } },
    '*사업연도': { select: { name: `${currentYear}년` } },
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
  const uploadItems = await buildUploadItems(files, metadata, today);
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
  metadata: ExtractedMetadata | null,
  today: string
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
          ? buildStandardName(metadata.현장명, category, today)
          : file.name,
        buffer: file.buffer,
      });
    } else {
      // 통합 PDF: pages 기반 분할
      for (const info of matchedInfos) {
        let buffer: Buffer;
        if (info.pages && info.pages.length > 0) {
          buffer = await splitPdf(file.buffer, info.pages);
        } else {
          buffer = file.buffer; // pages 없으면 전체 PDF
        }

        items.push({
          originalName: file.name,
          category: info.category,
          standardName: metadata?.현장명
            ? buildStandardName(metadata.현장명, info.category, today)
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
    const zipName = buildBundleZipName(siteName, today);

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

function buildBundleZipName(siteName: string, date: string): string {
  const safe = siteName.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
  return `${safe}_전체_${date}.zip`;
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

/**
 * 단일 파일을 Notion에 업로드 + 페이지에 블록 첨부.
 */
export async function uploadAndAttach(
  pageId: string,
  buffer: Buffer,
  standardName: string,
  contentType: string = 'application/pdf'
): Promise<void> {
  // Step 1: 업로드 세션 생성
  const createRes = await fetch('https://api.notion.com/v1/file_uploads', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filename: standardName,
      content_type: contentType,
    }),
  });
  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`file_uploads.create failed: ${createRes.status} ${text}`);
  }
  const fileUpload = await createRes.json() as { id: string };

  // Step 2: 바이너리 전송
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
    const text = await sendRes.text();
    throw new Error(`file_uploads.send failed: ${sendRes.status} ${text}`);
  }

  // Step 3: 페이지 블록으로 첨부
  await notion.blocks.children.append({
    block_id: pageId,
    children: [createFileBlock(standardName, fileUpload.id) as any],
  });
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
