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
import { createHash } from 'crypto';
import { extractAndHashFromZipBuffer } from '@/lib/files';
import { classifyAndExtract } from '@/lib/claude';
import {
  createNotionEntry,
  buildUploadItems,
  uploadAndAttach,
  sleep,
  formatToday,
} from '@/lib/notion';
import { buildStandardName } from '@/lib/files';
import type { IntakeSuccessResponse, ClassifiedFile } from '@/types/intake';

export const maxDuration = 60;

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

  // ── 2. SSE 스트리밍 처리 ──────────────────────────────────────
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: Record<string, unknown>) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
        );
      }

      const warnings: string[] = [];

      try {
        // ── ZIP 다운로드 + PDF 추출 ─────────────────────────────
        send({ phase: 'extracting', message: 'ZIP에서 PDF 추출 중...' });

        const zipRes = await fetch(blobUrl, {
          headers: {
            Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
          },
        });
        if (!zipRes.ok) throw new Error(`Blob 다운로드 실패: ${zipRes.status}`);
        const zipBuffer = Buffer.from(await zipRes.arrayBuffer());
        const normalizedFiles = await extractAndHashFromZipBuffer(zipBuffer);

        if (normalizedFiles.length === 0) {
          send({ phase: 'error', error: 'PDF 파일을 찾을 수 없습니다.', code: 'NO_PDF' });
          controller.close();
          return;
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

        let page: { id: string; url: string };
        try {
          page = await createNotionEntry(
            { name: salesRepName, company: salesRepCompany },
            metadata
          );
        } catch (err) {
          console.error('[intake] 노션 entry 생성 실패:', err);
          send({
            phase: 'error',
            error: '노션 DB 저장에 실패했습니다. 잠시 후 다시 시도해주세요.',
            code: 'NOTION_ERROR',
          });
          controller.close();
          return;
        }

        // ── 파일 첨부 (개별 진행) ───────────────────────────────
        const classifiedFiles: ClassifiedFile[] = [];
        const nameCount = new Map<string, number>();
        const total = uploadItems.length;

        for (let i = 0; i < uploadItems.length; i++) {
          const item = uploadItems[i];
          let standardName = item.standardName;

          const count = (nameCount.get(standardName) ?? 0) + 1;
          nameCount.set(standardName, count);
          if (count > 1) {
            standardName = standardName.replace('.pdf', `_${count}.pdf`);
          }

          send({
            phase: 'attaching',
            current: i + 1,
            total,
            message: `노션 첨부 중... ${i + 1}/${total}`,
            fileName: standardName,
          });

          try {
            await uploadAndAttach(page.id, item.buffer, standardName);
            classifiedFiles.push({
              originalName: item.originalName,
              category: item.category,
              date: today,
              standardName,
              hash: createHash('sha256').update(item.buffer).digest('hex'),
            });
          } catch (err) {
            console.error(`[notion] 파일 첨부 실패 (${standardName}):`, err);
            warnings.push(`${standardName} 첨부 실패`);
          }

          await sleep(400);
        }

        // ── Blob 정리 ───────────────────────────────────────────
        del(blobUrl).catch(() => {});

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
        console.error('[intake] 처리 실패:', err);
        send({
          phase: 'error',
          error: err instanceof Error ? err.message : '처리 중 오류가 발생했습니다',
          code: 'INTERNAL_ERROR',
        });
      }

      controller.close();
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
