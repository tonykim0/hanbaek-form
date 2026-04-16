/**
 * POST /api/intake
 *
 * JSON body 수신:
 *   - salesRepName: string
 *   - salesRepCompany: string
 *   - password: string   (스팸 차단용 단순 비밀번호)
 *   - blobUrl: string    (Vercel Blob에 업로드된 ZIP URL)
 *
 * 처리 순서 (HANDOFF.md §9):
 *   1. 인증 + 유효성 검사
 *   2. Blob에서 ZIP 다운로드 → PDF 추출 + 해시
 *   3. Claude Sonnet 4.6 분류 + 메타데이터 추출
 *   4. 노션 entry 생성
 *   5. 노션 파일 첨부
 *   6. Blob 정리 + 응답 반환
 *
 * 에러 처리 3단계 fallback (HANDOFF.md §10):
 *   1차: Claude 실패 → 메타데이터 없이 entry만 생성
 *   2차: 첨부 실패 → entry는 생성, warnings에 포함
 *   3차: 전체 실패 → 500 + 에러 코드 반환
 */
import { NextRequest, NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { extractAndHashFromZipBuffer } from '@/lib/files';
import { classifyAndExtract } from '@/lib/claude';
import { createNotionEntry, attachFilesToPage } from '@/lib/notion';
import type { IntakeSuccessResponse, IntakeErrorResponse } from '@/types/intake';

// Vercel Pro: 최대 60초 허용
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  // ── 1. JSON 파싱 ──────────────────────────────────────────────
  let body: {
    salesRepName?: string;
    salesRepCompany?: string;
    password?: string;
    blobUrl?: string;
  };
  try {
    body = await request.json();
  } catch {
    return error('요청 파싱에 실패했습니다', 'PARSE_ERROR', 400);
  }

  const salesRepName = body.salesRepName?.trim() ?? '';
  const salesRepCompany = body.salesRepCompany?.trim() ?? '';
  const password = body.password ?? '';
  const blobUrl = body.blobUrl?.trim() ?? '';

  // ── 2. 유효성 검사 ─────────────────────────────────────────────
  if (password !== process.env.INTAKE_PASSWORD) {
    return error('비밀번호가 올바르지 않습니다', 'AUTH_FAILED', 401);
  }
  if (!salesRepName || !salesRepCompany) {
    return error('영업자 이름과 소속은 필수입니다', 'VALIDATION_ERROR', 400);
  }
  if (!blobUrl) {
    return error('파일이 업로드되지 않았습니다', 'NO_FILES', 400);
  }

  // ── 3. Blob에서 ZIP 다운로드 + PDF 추출 ────────────────────────
  let normalizedFiles;
  try {
    const zipRes = await fetch(blobUrl);
    if (!zipRes.ok) {
      throw new Error(`Blob 다운로드 실패: ${zipRes.status}`);
    }
    const zipBuffer = Buffer.from(await zipRes.arrayBuffer());
    normalizedFiles = await extractAndHashFromZipBuffer(zipBuffer);
  } catch (err) {
    console.error('[intake] 파일 정규화 실패:', err);
    return error('파일 처리에 실패했습니다', 'FILE_ERROR', 500);
  }

  if (normalizedFiles.length === 0) {
    return error(
      'PDF 파일을 찾을 수 없습니다. PDF가 포함된 ZIP을 업로드해주세요.',
      'NO_PDF',
      400
    );
  }

  const warnings: string[] = [];

  // ── 4. AI 분류 + 메타데이터 추출 (1차 fallback) ────────────────
  let metadata = null;
  try {
    metadata = await classifyAndExtract(normalizedFiles);
  } catch (err) {
    console.error('[intake] Claude 추출 실패:', err);
    warnings.push(
      'AI 분류에 실패했습니다. 담당자가 수동으로 검수합니다.'
    );
  }

  // ── 5. 노션 entry 생성 ─────────────────────────────────────────
  let page: { id: string; url: string };
  try {
    page = await createNotionEntry(
      { name: salesRepName, company: salesRepCompany },
      metadata
    );
  } catch (err) {
    console.error('[intake] 노션 entry 생성 실패:', err);
    return error(
      '노션 DB 저장에 실패했습니다. 잠시 후 다시 시도해주세요.',
      'NOTION_ERROR',
      500
    );
  }

  // ── 6. 파일 첨부 (2차 fallback) ────────────────────────────────
  let classifiedFiles: Awaited<ReturnType<typeof attachFilesToPage>>;
  try {
    classifiedFiles = await attachFilesToPage(page.id, normalizedFiles, metadata);
  } catch (err) {
    console.error('[intake] 파일 첨부 실패:', err);
    warnings.push(
      '파일 첨부에 실패했습니다. 담당자가 확인 후 수동으로 첨부합니다.'
    );
    classifiedFiles = [];
  }

  // ── 7. Blob 정리 (비동기, 실패해도 무시) ──────────────────────
  del(blobUrl).catch((err) => {
    console.warn('[intake] Blob 삭제 실패 (무시):', err);
  });

  // ── 8. 응답 ────────────────────────────────────────────────────
  const response: IntakeSuccessResponse = {
    success: true,
    intakeId: generateIntakeId(),
    notionUrl: page.url,
    classifiedFiles,
    warnings,
  };

  return NextResponse.json(response);
}

// ── 헬퍼 ───────────────────────────────────────────────────────────

function error(
  message: string,
  code: string,
  status: number
): NextResponse<IntakeErrorResponse> {
  return NextResponse.json({ success: false, error: message, code }, { status });
}

/**
 * 접수번호 생성: HBPI-XXXX (타임스탬프 기반)
 */
function generateIntakeId(): string {
  const ts = Date.now().toString(36).toUpperCase().slice(-4);
  return `HBPI-${ts}`;
}
