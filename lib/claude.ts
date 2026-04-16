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

/**
 * PDF 파일 목록을 Claude에 전달하고 분류 + 메타데이터를 추출합니다.
 * 모든 PDF를 단일 API 호출로 처리 (multi-document vision).
 */
export async function classifyAndExtract(
  pdfs: NormalizedFile[]
): Promise<ExtractedMetadata> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          // PDF 파일들 (base64 인코딩)
          ...pdfs.map((pdf) => ({
            type: 'document' as const,
            source: {
              type: 'base64' as const,
              media_type: 'application/pdf' as const,
              data: pdf.buffer.toString('base64'),
            },
          })),
          // 추출 지시 프롬프트
          {
            type: 'text' as const,
            text: buildExtractionPrompt(pdfs.map((p) => p.name)),
          },
        ],
      },
    ],
  });

  const responseText =
    message.content[0].type === 'text' ? message.content[0].text : '';

  // JSON 블록 추출 (```json ... ``` 마크다운이 포함되더라도 처리)
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(
      `Claude 응답에서 JSON을 파싱할 수 없습니다. 응답 앞부분: ${responseText.slice(0, 200)}`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error(`JSON 파싱 실패: ${jsonMatch[0].slice(0, 200)}`);
  }

  return parsed as ExtractedMetadata;
}
