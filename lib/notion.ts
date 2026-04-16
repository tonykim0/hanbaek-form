/**
 * Notion API 클라이언트.
 * - 노션 DB entry 생성 (전기차 실사관리)
 * - 파일 업로드 + 페이지 첨부 (Notion File Upload API)
 *
 * 서버 사이드 전용.
 */
import { Client, APIResponseError } from '@notionhq/client';
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties: Record<string, any> = {
    // 필수 title 필드
    '현장명': {
      title: [{ text: { content: metadata?.현장명 ?? '(미확인)' } }],
    },
    // 고정값
    '*진행상태': { select: { name: '신규생성' } },
    '*사업연도': { select: { name: `${currentYear}년` } },
    // 웹폼 입력값
    '*영업자': { rich_text: [{ text: { content: salesRep.name } }] },
    '*영업자(소속)': { rich_text: [{ text: { content: salesRep.company } }] },
  };

  if (metadata) {
    if (metadata.주소) {
      properties['*주소'] = { rich_text: [{ text: { content: metadata.주소 } }] };
    }
    if (metadata.우편번호) {
      properties['*우편번호'] = { rich_text: [{ text: { content: metadata.우편번호 } }] };
    }
    if (metadata.소재지) {
      properties['*소재지'] = { select: { name: metadata.소재지 } };
    }
    if (metadata.건축물유형) {
      properties['*건축물 유형'] = { select: { name: metadata.건축물유형 } };
    }
    if (metadata.CPO && metadata.CPO.length > 0) {
      properties['*CPO'] = {
        multi_select: metadata.CPO.map((cpo) => ({ name: cpo })),
      };
    }
    if (metadata.계약대수 != null) {
      properties['*계약대수'] = { number: metadata.계약대수 };
    }
    if (metadata.총주차면수 != null) {
      properties['*총 주차면 수'] = { number: metadata.총주차면수 };
    }
    if (metadata.전력인입) {
      properties['*전력인입'] = { select: { name: metadata.전력인입 } };
    }
    if (metadata.현장담당자) {
      properties['*현장 담당자'] = {
        rich_text: [{ text: { content: metadata.현장담당자 } }],
      };
    }
    if (metadata.현장연락처) {
      properties['*현장 연락처(유선)'] = {
        rich_text: [{ text: { content: metadata.현장연락처 } }],
      };
    }
    if (metadata.설치위치) {
      properties['*설치위치'] = {
        rich_text: [{ text: { content: metadata.설치위치 } }],
      };
    }
    if (metadata.비고) {
      properties['비고(특이사항)'] = {
        rich_text: [{ text: { content: metadata.비고 } }],
      };
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
  const classifiedFiles: ClassifiedFile[] = [];
  const nameCount = new Map<string, number>();
  const today = formatToday();

  // 첨부할 항목 목록 생성 (통합 PDF → 분할 항목으로 확장)
  const uploadItems = await buildUploadItems(files, metadata, today);

  for (const item of uploadItems) {
    let standardName = item.standardName;

    // 중복 네이밍 방지
    const count = (nameCount.get(standardName) ?? 0) + 1;
    nameCount.set(standardName, count);
    if (count > 1) {
      standardName = standardName.replace('.pdf', `_${count}.pdf`);
    }

    try {
      await uploadAndAttach(pageId, item.buffer, standardName);

      classifiedFiles.push({
        originalName: item.originalName,
        category: item.category,
        date: today,
        standardName,
        hash: createHash('sha256').update(item.buffer).digest('hex'),
      });
    } catch (err) {
      const code = err instanceof APIResponseError ? err.code : 'unknown';
      console.error(`[notion] 파일 첨부 실패 (${standardName}) code=${code}:`, err);
    }

    await sleep(400);
  }

  return classifiedFiles;
}

interface UploadItem {
  originalName: string;
  category: FileCategory;
  standardName: string;
  buffer: Buffer;
}

/**
 * 통합 PDF 분할을 포함한 업로드 항목 목록 생성.
 */
async function buildUploadItems(
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

/**
 * 단일 파일을 Notion에 업로드 + 페이지에 블록 첨부.
 */
async function uploadAndAttach(
  pageId: string,
  buffer: Buffer,
  standardName: string
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
      content_type: 'application/pdf',
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
  formData.append('file', new Blob([ab], { type: 'application/pdf' }), standardName);

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatToday(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}${mm}${dd}`;
}
