/**
 * Anthropic API 클라이언트.
 * Claude Sonnet 4.6 PDF vision으로 계약서 분류 + 메타데이터 추출.
 *
 * 서버 사이드 전용.
 */
import Anthropic from '@anthropic-ai/sdk';
import { buildExtractionPrompt } from './prompts';
import type { ExtractedMetadata } from '@/types/intake';
import type { NormalizedFile } from './files';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = 'claude-sonnet-4-6';
/** 개별 Claude 호출 타임아웃 (전체 라우트 60s 예산 안에서 재시도 여지 확보) */
const CALL_TIMEOUT_MS = 45_000;
/** 2번째 시도는 경과시간이 이 값 미만일 때만 (라우트 타임아웃 방지) */
const RETRY_ELAPSED_BUDGET_MS = 28_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * PDF 파일 목록을 Claude에 전달하고 분류 + 메타데이터를 추출합니다.
 * 모든 PDF를 단일 API 호출로 처리 (multi-document vision).
 *
 * 일시적 실패(응답 지연·과부하·JSON 파싱 실패)에 대비해 시간 예산 내에서 1회 재시도한다.
 * 재시도까지 실패하면 throw → 호출부에서 metadata=null 로 폴백.
 */
export async function classifyAndExtract(
  pdfs: NormalizedFile[]
): Promise<ExtractedMetadata> {
  const content = [
    ...pdfs.map((pdf) => ({
      type: 'document' as const,
      source: {
        type: 'base64' as const,
        media_type: 'application/pdf' as const,
        data: pdf.buffer.toString('base64'),
      },
    })),
    {
      type: 'text' as const,
      text: buildExtractionPrompt(pdfs.map((p) => p.name)),
    },
  ];

  const startedAt = Date.now();
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const message = await anthropic.messages.create(
        {
          model: MODEL,
          // 파일이 많은 통합 PDF는 files 배열이 커서 4096으로는 JSON이 잘릴 수 있음
          max_tokens: 8192,
          messages: [{ role: 'user', content }],
        },
        { timeout: CALL_TIMEOUT_MS }
      );
      return parseMetadata(message);
    } catch (err) {
      lastError = err;
      console.warn(`[claude] 추출 시도 ${attempt} 실패:`, err);
      // 남은 시간이 부족하면 재시도하지 않는다 (라우트 60s 타임아웃 보호)
      if (attempt >= 2 || Date.now() - startedAt > RETRY_ELAPSED_BUDGET_MS) break;
      await sleep(800);
    }
  }
  throw lastError;
}

/** Claude 응답에서 JSON 메타데이터를 견고하게 추출한다. */
function parseMetadata(message: Anthropic.Message): ExtractedMetadata {
  // 여러 블록/사고블록이 섞여도 text 블록만 모아서 사용 (content[0] 가정 제거)
  const responseText = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  // 코드펜스 제거 후 첫 '{' ~ 마지막 '}' 범위 파싱
  const cleaned = responseText.replace(/```(?:json)?/gi, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error(
      `Claude 응답에서 JSON을 찾을 수 없습니다. 앞부분: ${responseText.slice(0, 200)}`
    );
  }
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as ExtractedMetadata;
  } catch {
    throw new Error(`JSON 파싱 실패: ${cleaned.slice(start, start + 200)}`);
  }
}
