/**
 * POST /api/import-form
 *
 * 협력사가 보내온 계약서류 스캔 PDF를 읽어 입력폼 값으로 되돌립니다.
 *
 * 업로드 경로가 두 개입니다.
 *   · multipart/form-data (file=PDF)  — 작은 파일. 서버리스 본문 한도(4.5MB) 안에서 동작.
 *   · application/json ({ blobUrl })  — 큰 스캔본. /api/upload 토큰으로 Blob에 먼저 올린 뒤 URL만 전달.
 * 클라이언트(lib/import-client.ts)가 파일 크기를 보고 알아서 고릅니다.
 */
import { NextRequest, NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { extractFormFromPdf, FormImportError } from '@/lib/claude-import';

// 스캔본 판독은 페이지 수에 비례해 오래 걸립니다 (60페이지 상한 기준 여유 확보)
export const maxDuration = 300;

/** multipart 경로 상한 — 서버리스 요청 본문 한도(4.5MB)보다 낮게 잡습니다 */
const MAX_INLINE_BYTES = 4 * 1024 * 1024;
const ALLOWED_BLOB_HOST_RE = /(^|\.)blob\.vercel-storage\.com$/;

export async function POST(request: NextRequest) {
  let blobUrl: string | null = null;

  try {
    const contentType = request.headers.get('content-type') ?? '';
    let pdf: Buffer;
    let fileName: string;
    let cpoHint: string | undefined;

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      const file = form.get('file');
      if (!(file instanceof File)) {
        return errorResponse('PDF 파일이 없습니다.', 'NO_FILE', 400);
      }
      if (file.size > MAX_INLINE_BYTES) {
        return errorResponse(
          '파일이 커서 직접 전송할 수 없습니다. 업로드 URL 방식으로 다시 시도해주세요.',
          'FILE_TOO_LARGE_FOR_INLINE',
          413
        );
      }
      pdf = Buffer.from(await file.arrayBuffer());
      fileName = file.name || 'upload.pdf';
      cpoHint = asString(form.get('cpo'));
    } else {
      const body = (await request.json()) as {
        blobUrl?: string;
        fileName?: string;
        cpo?: string;
      };
      const url = body.blobUrl?.trim() ?? '';
      if (!url) {
        return errorResponse('업로드된 파일을 찾을 수 없습니다.', 'NO_FILE', 400);
      }
      if (!isAllowedBlobUrl(url)) {
        return errorResponse('업로드 URL이 올바르지 않습니다.', 'INVALID_BLOB_URL', 400);
      }
      blobUrl = url;
      pdf = await downloadBlob(url);
      fileName = body.fileName?.trim() || 'upload.pdf';
      cpoHint = body.cpo?.trim() || undefined;
    }

    if (!isPdfBuffer(pdf)) {
      return errorResponse(
        'PDF 파일만 판독할 수 있습니다. 스캔본을 PDF로 저장해 올려주세요.',
        'NOT_PDF',
        400
      );
    }

    const result = await extractFormFromPdf({ pdf, fileName, cpoHint });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof FormImportError) {
      console.error('[import-form] 판독 실패:', err);
      return errorResponse(err.message, err.code, 422);
    }
    console.error('[import-form] 처리 실패:', err);
    return errorResponse(
      err instanceof Error ? err.message : '처리 중 오류가 발생했습니다.',
      'INTERNAL_ERROR',
      500
    );
  } finally {
    if (blobUrl) await deleteBlobQuietly(blobUrl);
  }
}

// ── 헬퍼 ───────────────────────────────────────────────────────────

function errorResponse(error: string, code: string, status: number) {
  return NextResponse.json({ error, code }, { status });
}

function asString(value: FormDataEntryValue | null): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isPdfBuffer(buffer: Buffer): boolean {
  return buffer.length > 4 && buffer.subarray(0, 4).toString('latin1') === '%PDF';
}

function isAllowedBlobUrl(blobUrl: string): boolean {
  try {
    const url = new URL(blobUrl);
    return url.protocol === 'https:' && ALLOWED_BLOB_HOST_RE.test(url.hostname);
  } catch {
    return false;
  }
}

async function downloadBlob(blobUrl: string): Promise<Buffer> {
  const res = await fetch(blobUrl);
  if (!res.ok) {
    throw new FormImportError(
      `업로드 파일을 불러오지 못했습니다 (${res.status})`,
      'BLOB_DOWNLOAD_ERROR'
    );
  }
  return Buffer.from(await res.arrayBuffer());
}

async function deleteBlobQuietly(blobUrl: string): Promise<void> {
  try {
    await del(blobUrl);
  } catch {
    // Blob 정리 실패는 응답을 깨뜨리지 않는다.
  }
}
