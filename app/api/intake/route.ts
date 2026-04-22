/**
 * POST /api/intake
 *
 * SSE(Server-Sent Events) 스트리밍 응답.
 * 각 처리 단계를 실시간으로 클라이언트에 전달합니다.
 *
 * 이벤트 형식: data: { phase, message, ...payload }\n\n
 * 최종 이벤트: { phase: 'done', data: IntakeSuccessResponse }
 *            또는 { phase: 'error', error, code }
 */
import { NextRequest } from 'next/server';
import { del } from '@vercel/blob';
import { extractAndHashFromZipBuffer, isZipBuffer } from '@/lib/files';
import { classifyAndExtract } from '@/lib/claude';
import {
  createNotionEntry,
  attachUploadItemsToPage,
  buildUploadItems,
  formatToday,
} from '@/lib/notion';
import type { IntakeSuccessResponse } from '@/types/intake';

export const maxDuration = 60;
const ALLOWED_BLOB_HOST_RE = /(^|\.)blob\.vercel-storage\.com$/;

export async function POST(request: NextRequest) {
  // ── 1. JSON 파싱 + 유효성 검사 ────────────────────────────────
  let body: {
    salesRepName?: string;
    salesRepCompany?: string;
    password?: string;
    blobUrl?: string;
  };
  try {
    body = await request.json();
  } catch {
    return errorResponse('요청 파싱에 실패했습니다', 'PARSE_ERROR');
  }

  const salesRepName = body.salesRepName?.trim() ?? '';
  const salesRepCompany = body.salesRepCompany?.trim() ?? '';
  const password = body.password ?? '';
  const blobUrl = body.blobUrl?.trim() ?? '';

  if (password !== process.env.INTAKE_PASSWORD) {
    return errorResponse('비밀번호가 올바르지 않습니다', 'AUTH_FAILED');
  }
  if (!salesRepName || !salesRepCompany) {
    return errorResponse('영업자 이름과 소속은 필수입니다', 'VALIDATION_ERROR');
  }
  if (!blobUrl) {
    return errorResponse('파일이 업로드되지 않았습니다', 'NO_FILES');
  }
  if (!isAllowedBlobUrl(blobUrl)) {
    return errorResponse('업로드 URL이 올바르지 않습니다', 'INVALID_BLOB_URL');
  }

  // ── 2. SSE 스트리밍 처리 ──────────────────────────────────────
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
        );
      };

      const warnings: string[] = [];

      try {
        // ── ZIP 다운로드 + PDF 추출 ─────────────────────────────
        send({ phase: 'extracting', message: 'ZIP에서 PDF 추출 중...' });
        const zipBuffer = await downloadZipBuffer(blobUrl);
        if (!isZipBuffer(zipBuffer)) {
          throw new IntakeRouteError('ZIP 파일만 접수할 수 있습니다.', 'INVALID_ZIP');
        }
        const normalizedFiles = await extractAndHashFromZipBuffer(zipBuffer);

        if (normalizedFiles.length === 0) {
          throw new IntakeRouteError('PDF 파일을 찾을 수 없습니다.', 'NO_PDF');
        }

        send({
          phase: 'extracting',
          message: `PDF ${normalizedFiles.length}개 추출 완료`,
          fileCount: normalizedFiles.length,
        });

        // ── AI 분류 ─────────────────────────────────────────────
        send({
          phase: 'classifying',
          message: `AI 분류 중... (${normalizedFiles.length}개 파일)`,
        });

        let metadata = null;
        try {
          metadata = await classifyAndExtract(normalizedFiles);
        } catch (err) {
          console.error('[intake] Claude 추출 실패:', err);
          warnings.push('AI 분류에 실패했습니다. 담당자가 수동으로 검수합니다.');
        }

        // ── PDF 분할 + 업로드 항목 준비 ─────────────────────────
        send({ phase: 'splitting', message: '파일 준비 중...' });

        const today = formatToday();
        const uploadItems = await buildUploadItems(
          normalizedFiles,
          metadata,
          today
        );

        const isSplit = normalizedFiles.length === 1 && uploadItems.length > 1;
        send({
          phase: 'splitting',
          message: isSplit
            ? `통합 PDF → ${uploadItems.length}개 파일로 분할 완료`
            : `${uploadItems.length}개 파일 준비 완료`,
          totalFiles: uploadItems.length,
        });

        // ── 노션 entry 생성 ─────────────────────────────────────
        send({ phase: 'notion', message: '노션 DB 저장 중...' });

        try {
          const page = await createNotionEntry(
            { name: salesRepName, company: salesRepCompany },
            metadata
          );
          const { classifiedFiles, warnings: attachWarnings } =
            await attachUploadItemsToPage(page.id, uploadItems, today, {
              siteName: metadata?.현장명,
              onProgress: ({ current, total, standardName }) => {
                send({
                  phase: 'attaching',
                  current,
                  total,
                  message: `노션 첨부 중... ${current}/${total}`,
                  fileName: standardName,
                });
              },
            });
          warnings.push(...attachWarnings);

          // ── 완료 ────────────────────────────────────────────────
          const response: IntakeSuccessResponse = {
            success: true,
            intakeId: generateIntakeId(),
            notionUrl: page.url,
            classifiedFiles,
            warnings,
          };

          send({ phase: 'done', data: response });
        } catch (err) {
          console.error('[intake] 노션 저장/첨부 실패:', err);
          throw new IntakeRouteError(
            '노션 DB 저장에 실패했습니다. 잠시 후 다시 시도해주세요.',
            'NOTION_ERROR'
          );
        }
      } catch (err) {
        console.error('[intake] 처리 실패:', err);
        const intakeError = toIntakeRouteError(err);
        send({
          phase: 'error',
          error: intakeError.message,
          code: intakeError.code,
        });
      } finally {
        await deleteBlobQuietly(blobUrl);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

// ── 헬퍼 ───────────────────────────────────────────────────────────

function errorResponse(error: string, code: string): Response {
  const encoder = new TextEncoder();
  const body = encoder.encode(
    `data: ${JSON.stringify({ phase: 'error', error, code })}\n\n`
  );
  return new Response(body, {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function generateIntakeId(): string {
  const ts = Date.now().toString(36).toUpperCase().slice(-4);
  return `HBPI-${ts}`;
}

function isAllowedBlobUrl(blobUrl: string): boolean {
  try {
    const url = new URL(blobUrl);
    return url.protocol === 'https:' && ALLOWED_BLOB_HOST_RE.test(url.hostname);
  } catch {
    return false;
  }
}

async function downloadZipBuffer(blobUrl: string): Promise<Buffer> {
  const zipRes = await fetch(blobUrl);
  if (!zipRes.ok) {
    throw new IntakeRouteError(
      `업로드 파일을 불러오지 못했습니다 (${zipRes.status})`,
      'BLOB_DOWNLOAD_ERROR'
    );
  }

  return Buffer.from(await zipRes.arrayBuffer());
}

async function deleteBlobQuietly(blobUrl: string): Promise<void> {
  try {
    await del(blobUrl);
  } catch {
    // Blob 정리 실패는 사용자 응답을 깨뜨리지 않도록 무시한다.
  }
}

class IntakeRouteError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'IntakeRouteError';
  }
}

function toIntakeRouteError(error: unknown): IntakeRouteError {
  if (error instanceof IntakeRouteError) {
    return error;
  }

  return new IntakeRouteError(
    error instanceof Error ? error.message : '처리 중 오류가 발생했습니다',
    'INTERNAL_ERROR'
  );
}
