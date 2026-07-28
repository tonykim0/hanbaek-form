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
import { extractAndHashFromZipBuffer, isZipBuffer, isPdfFile } from '@/lib/files';
import { classifyAndExtract } from '@/lib/claude';
import {
  createNotionEntry,
  attachUploadItemsToPage,
  buildUploadItems,
  buildMissingDocsNote,
  formatToday,
} from '@/lib/notion';
import type { IntakeSuccessResponse } from '@/types/intake';

// Vercel Pro: 대용량 ZIP·다파일 접수의 중간 종료(부분 저장) 방지를 위해 여유 확보
export const maxDuration = 180;
const ALLOWED_BLOB_HOST_RE = /(^|\.)blob\.vercel-storage\.com$/;

export async function POST(request: NextRequest) {
  // ── 1. JSON 파싱 + 유효성 검사 ────────────────────────────────
  let body: {
    salesRepName?: string;
    salesRepCompany?: string;
    blobUrl?: string;
    note?: string;
  };
  try {
    body = await request.json();
  } catch {
    return errorResponse('요청 파싱에 실패했습니다', 'PARSE_ERROR');
  }

  const salesRepName = body.salesRepName?.trim() ?? '';
  const salesRepCompany = body.salesRepCompany?.trim() ?? '';
  const blobUrl = body.blobUrl?.trim() ?? '';
  const note = body.note?.trim() ?? '';

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

      // CDN/프록시 idle 타임아웃 방지: 8초마다 SSE 코멘트 전송
      const keepalive = setInterval(() => {
        try { controller.enqueue(encoder.encode(': keepalive\n\n')); } catch { /* 무시 */ }
      }, 8000);

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
          throw new IntakeRouteError('접수할 파일을 찾을 수 없습니다.', 'NO_FILES');
        }

        // AI 분류 대상은 PDF만 (xlsx/pptx 등은 원본 그대로 첨부만)
        const pdfFiles = normalizedFiles.filter(isPdfFile);

        send({
          phase: 'extracting',
          message: `파일 ${normalizedFiles.length}개 추출 완료`,
          fileCount: normalizedFiles.length,
        });

        // ── AI 분류 ─────────────────────────────────────────────
        let metadata = null;
        if (pdfFiles.length > 0) {
          send({
            phase: 'classifying',
            message: `AI 분류 중... (PDF ${pdfFiles.length}개)`,
          });
          try {
            metadata = await classifyAndExtract(pdfFiles);
          } catch (err) {
            console.error('[intake] Claude 추출 실패:', err);
            warnings.push('AI 분류에 실패했습니다. 담당자가 수동으로 검수합니다.');
          }
        } else {
          warnings.push('PDF가 없어 AI 분류를 건너뜁니다. 첨부 파일만 접수됩니다.');
        }

        // 서류 누락 점검 → 접수 화면에도 즉시 경고 노출 (노션 '누락서류' 속성에도 기록됨)
        if (metadata) {
          const missingNote = buildMissingDocsNote(metadata);
          if (missingNote.startsWith('⚠')) warnings.push(missingNote);
        }

        // ── PDF 분할 + 업로드 항목 준비 ─────────────────────────
        send({ phase: 'splitting', message: '파일 준비 중...' });

        const today = formatToday();
        const uploadItems = await buildUploadItems(normalizedFiles, metadata);

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
            metadata,
            note
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
        clearInterval(keepalive);
        controller.close();
        await deleteBlobQuietly(blobUrl);
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
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
