/**
 * Notion API 클라이언트.
 * - 노션 DB entry 생성 (전기차 실사관리)
 * - 파일 업로드 + 페이지 첨부 (Notion File Upload API)
 *
 * 서버 사이드 전용.
 */
import { Client, APIResponseError } from '@notionhq/client';
import type { ExtractedMetadata, ClassifiedFile } from '@/types/intake';
import type { NormalizedFile } from './files';
import { buildStandardName } from './files';

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
 * 플로우 (단일 파일 기준):
 *   1. notion.fileUploads.create()  → file_upload_id 발급
 *   2. notion.fileUploads.send()    → binary 전송
 *   3. notion.blocks.children.append() → 페이지에 블록 추가
 *
 * rate limit: 3 req/sec → 파일 간 400ms sleep
 */
export async function attachFilesToPage(
  pageId: string,
  files: NormalizedFile[],
  metadata: ExtractedMetadata | null
): Promise<ClassifiedFile[]> {
  const classifiedFiles: ClassifiedFile[] = [];
  // 동일 standardName 중복 방지용 카운터
  const nameCount = new Map<string, number>();

  for (const file of files) {
    const normalName = file.name.normalize('NFC');
    const fileInfo = metadata?.files.find(
      (f) => f.originalName.normalize('NFC') === normalName
    );
    const category = fileInfo?.category ?? '기타';
    // 날짜는 항상 업로드(접수) 일자 사용
    const today = formatToday();
    let standardName = metadata?.현장명
      ? buildStandardName(metadata.현장명, category, today)
      : file.name;

    // 중복 네이밍 방지: 같은 이름이 이미 있으면 _2, _3 ... 붙임
    const count = (nameCount.get(standardName) ?? 0) + 1;
    nameCount.set(standardName, count);
    if (count > 1) {
      standardName = standardName.replace('.pdf', `_${count}.pdf`);
    }

    try {
      // Step 1: 업로드 세션 생성 (Notion File Upload API — fetch 직접 사용)
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

      // Step 2: 바이너리 전송 (단일 파트 — multipart/form-data)
      const formData = new FormData();
      const ab = file.buffer.buffer.slice(
        file.buffer.byteOffset,
        file.buffer.byteOffset + file.buffer.byteLength
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

      classifiedFiles.push({
        originalName: file.name,
        category,
        date: today,
        standardName,
        hash: file.hash,
      });
    } catch (err) {
      const code = err instanceof APIResponseError ? err.code : 'unknown';
      console.error(`[notion] 파일 첨부 실패 (${file.name}) code=${code}:`, err);
      // 개별 파일 실패는 무시하고 계속 진행 (2차 fallback)
    }

    // Rate limit 준수
    await sleep(400);
  }

  return classifiedFiles;
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
