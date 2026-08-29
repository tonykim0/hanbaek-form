/**
 * PDF 분류·분할 — 한 덩어리로 스캔된 서류 묶음을 종류별로 가른다.
 *
 * 계약서류는 스캐너에서 통째로 한 PDF 로 나온다(30~60장). 그것을 계약서·회의록·
 * 건축물대장… 으로 갈라 각각의 파일로 만드는 일을 사람이 손으로 하고 있었다.
 *
 * ★새로 만든 판독이 아니다.★ 접수 ZIP 이 하는 일과 같은 길을 쓴다 —
 * 방향 보정(pdf-orient) → 분류·페이지 판독(claude) → 페이지대로 자르기(notion
 * buildUploadItems → pdf-split). 다른 것은 끝에서 하는 일뿐이다: 접수는 현장에 붙이고,
 * 여기서는 사람에게 돌려준다.
 *
 * 서버 전용.
 */
import { put } from '@vercel/blob';
import { PDFDocument } from 'pdf-lib';
import type { FileCategory } from '@/types/intake';
import { classifyAndExtract } from './claude';
import { uprightPdf } from './pdf-orient';
import { buildUploadItems } from './notion';
import { createHash } from 'crypto';

/** 갈라 놓은 서류 한 장 — 화면이 이 목록을 그대로 그린다 */
export interface SortedDoc {
  category: FileCategory;
  /** 받을 때 쓰는 이름 — 판독이 현장명을 읽었으면 「현장명_종류.pdf」 */
  filename: string;
  pages: number;
  bytes: number;
  blobUrl: string;
}

export interface SortResult {
  siteName: string | null;
  /** 원본이 몇 장이었나 — 가른 것의 합과 견줘 빠진 장이 있는지 사람이 본다 */
  sourcePages: number;
  docs: SortedDoc[];
  warnings: string[];
}

export type SortProgress = (step: {
  phase: string; message: string; done?: number; total?: number;
}) => void;

/** 판독 한 번에 넣는 최대 장수 — 그보다 긴 묶음은 앞부분만 본다(비용·시간) */
const MAX_PAGES = 80;

export async function sortPdf(
  source: Buffer,
  sourceName: string,
  /** 가른 파일을 올릴 자리 — 사흘 뒤 청소가 걷어간다(lib/intake-stage) */
  prefix: string,
  onProgress: SortProgress = () => {}
): Promise<SortResult> {
  const warnings: string[] = [];

  onProgress({ phase: 'read', message: 'PDF 를 여는 중' });
  const doc = await PDFDocument.load(source, { ignoreEncryption: true }).catch(() => null);
  if (!doc) throw new Error('PDF 를 열지 못했습니다 — 암호가 걸렸거나 깨진 파일입니다.');
  const sourcePages = doc.getPageCount();
  if (sourcePages === 0) throw new Error('페이지가 없는 PDF 입니다.');
  if (sourcePages > MAX_PAGES) {
    warnings.push(`${sourcePages}장 중 앞 ${MAX_PAGES}장만 읽었습니다 — 나머지는 따로 올려주세요.`);
  }

  /*
   * 뒤집힌 스캔본은 판독이 실패하는 게 아니라 ★없는 값을 지어낸다★(lib/pdf-orient).
   * 그래서 읽기 전에 세운다 — 접수 ZIP 과 같은 순서다.
   */
  onProgress({ phase: 'orient', message: '기울어진 장을 바로 세우는 중' });
  const upright = await uprightPdf(source, 'pdf-sort');

  onProgress({ phase: 'classify', message: `${Math.min(sourcePages, MAX_PAGES)}장을 읽는 중` });
  const file = { name: sourceName, buffer: upright, hash: createHash('sha256').update(upright).digest('hex'), mimeType: 'application/pdf' };
  const metadata = await classifyAndExtract([file]).catch((err) => {
    console.error('[pdf-sort] 판독 실패:', err);
    return null;
  });
  if (!metadata) throw new Error('서류를 읽지 못했습니다 — 잠시 뒤 다시 시도해 주세요.');

  const matched = metadata.files?.filter((f) => f.originalName.normalize('NFC') === sourceName.normalize('NFC')) ?? [];
  if (matched.length === 0) {
    warnings.push('종류를 가르지 못해 한 파일로 둡니다 — 스캔이 흐리면 종종 그렇습니다.');
  }

  /*
   * 자르는 규칙은 접수와 같은 곳에 있다(buildUploadItems) — 페이지를 나누면 안 되는
   * 종류(한전 청구서·건축물대장 등)를 합치는 것까지 그쪽이 안다. 여기서 다시 적으면
   * 두 벌이 되어 접수와 다른 결과가 나온다.
   */
  onProgress({ phase: 'split', message: '종류대로 가르는 중' });
  const items = await buildUploadItems([file], metadata);

  const docs: SortedDoc[] = [];
  for (const [i, item] of items.entries()) {
    onProgress({ phase: 'upload', message: item.standardName, done: i, total: items.length });
    const pages = await PDFDocument.load(item.buffer, { ignoreEncryption: true })
      .then((d) => d.getPageCount())
      .catch(() => 0);
    const blob = await put(`${prefix}/${item.standardName}`, item.buffer, {
      access: 'public',
      contentType: item.contentType ?? 'application/pdf',
      addRandomSuffix: true,
    });
    docs.push({
      category: item.category,
      filename: item.standardName,
      pages,
      bytes: item.buffer.length,
      blobUrl: blob.url,
    });
  }

  /* 가른 장수의 합이 원본과 다르면 사람이 알아야 한다 — 빠진 장은 눈으로 찾을 수밖에 없다 */
  const split = docs.reduce((n, d) => n + d.pages, 0);
  if (split !== Math.min(sourcePages, MAX_PAGES) && docs.length > 1) {
    warnings.push(`원본 ${sourcePages}장 · 가른 합 ${split}장 — 겹치거나 빠진 장이 있는지 보세요.`);
  }

  return { siteName: metadata.현장명 || null, sourcePages, docs, warnings };
}
