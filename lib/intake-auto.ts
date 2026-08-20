/**
 * 접수 ZIP 자동 처리 — 콘솔용.
 *
 * ZIP 하나를 받아서 두 가지를 한다:
 *   1) 안의 파일을 서류 종류(kind)별로 갈라 Blob 에 올린다
 *   2) 계약서에서 읽은 값으로 현장 정보를 채운다
 *
 * 서류를 한 장씩 검수하는 일은 여기서 하지 않는다 — 아래 review 자리의 설명을 보라.
 *
 * ★포털의 /api/intake 를 부르지 않는다.★ 그쪽은 노션에 페이지를 만드는 것이 필수 경로라
 * (createNotionEntry 실패 = 접수 실패) 콘솔이 부르면 현장 하나에 노션 페이지가 같이 생긴다.
 * 콘솔의 정본은 Postgres 다. 그래서 노션과 무관한 순수 부분만 골라 다시 조립했다 —
 * ZIP 해제(lib/files) · 분류(lib/claude) · 분할·병합(lib/notion buildUploadItems).
 *
 * 파일을 어디에 두는가: 현장이 아직 없어서 projects/{id}/… 에 못 넣는다. 임시 자리에
 * 올려두고, 접수가 끝나 현장 번호가 생기면 그 주소만 현장에 붙인다(파일을 다시 올리지 않는다).
 *
 * 서버 전용.
 */
import { put } from '@vercel/blob';
import type { FileCategory } from '@/types/intake';
import type { AutoDoc, AutoFields, AutoIntakeResult } from '@/types/intake-auto';
import type { BizType, BuildingType, ContractParty, CpoName, PowerType } from '@/types/project';
import { extractAndHashFromZipBuffer, isZipBuffer } from './files';
import { classifyAndExtract } from './claude';
import { buildUploadItems } from './notion';
import { kindOfCategory, partyFromCategories, preInstallFromCategories } from './doc-category-map';
import { withRegionPrefix } from './region';

export type { AutoDoc, AutoFields, AutoIntakeResult };

const CPOS: CpoName[] = ['플러그링크', '나이스인프라', '현대엔지니어링', 'SK일렉링크', '에버온'];

/** 판독 전력인입 표기 → 도메인 수전방식 */
function toPowerType(v: string | null): PowerType | null {
  if (!v) return null;
  if (v === '한전수전') return '한전불입';
  if (v === '모자분리') return '모자분리';
  if (v === '모자분리 + 한전수전') return '한전불입+모자분리';
  return null;
}

/** 「7년」·「10」 같은 표기에서 연수만 꺼낸다. 5·7·10 이 아니면 버린다. */
function toTerm(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v.replace(/[^0-9]/g, ''));
  return [5, 7, 10].includes(n) ? n : null;
}

/** 어디까지 왔는지 알리는 자리. 30초 넘게 도는 일이라 화면이 멈춘 것처럼 보이면 안 된다. */
export type IntakeProgress = (step: { phase: string; message: string; done?: number; total?: number }) => void;

export async function autoIntakeFromZip(
  zip: Buffer,
  /** 임시 파일을 올릴 자리 — 접수자별로 갈라 남의 것과 섞이지 않게 한다 */
  stagePrefix: string,
  onProgress: IntakeProgress = () => {}
): Promise<AutoIntakeResult> {
  if (!isZipBuffer(zip)) throw new Error('ZIP 파일이 아닙니다.');

  onProgress({ phase: 'unzip', message: 'ZIP 을 푸는 중' });
  const files = await extractAndHashFromZipBuffer(zip);
  if (files.length === 0) throw new Error('ZIP 안에 파일이 없습니다.');
  onProgress({ phase: 'unzip', message: `파일 ${files.length}개를 꺼냈습니다` });

  const warnings: string[] = [];

  // ── 분류 ──────────────────────────────────────────────────
  const pdfs = files.filter((f) => f.mimeType === 'application/pdf');

  /*
   * PDF 를 전부 한 번의 Claude 호출에 담는다(멀티 문서 vision). 요청 한도가 32MB 인데
   * base64 로 실으면 1.33배가 되므로 원본 기준으로 여기서 막는다.
   *
   * 일부만 분류하지 않는다 — 분류 안 된 서류는 종류를 모르니 전부 「기타」 한 칸으로 몰리고,
   * 그 칸은 하나뿐이라 서로 덮어쓴다. 조용히 잃는 것보다 나눠 올려달라고 하는 편이 낫다.
   */
  const pdfBytes = pdfs.reduce((n, f) => n + f.buffer.length, 0);
  const PDF_BUDGET = 20 * 1024 * 1024;
  if (pdfBytes > PDF_BUDGET) {
    throw new Error(
      `PDF 총량이 ${Math.round(pdfBytes / 1024 / 1024)}MB 로 판독 한도(${PDF_BUDGET / 1024 / 1024}MB)를 넘습니다. `
      + 'ZIP 을 나눠 올리거나 스캔 해상도를 낮춰주세요.'
    );
  }
  let metadata = null as Awaited<ReturnType<typeof classifyAndExtract>> | null;
  if (pdfs.length > 0) {
    // 여기가 제일 오래 걸린다(20~30초)
    onProgress({ phase: 'read', message: '계약서 읽는 중' });
    try {
      metadata = await classifyAndExtract(pdfs);
    } catch (err) {
      // 분류가 실패해도 파일은 올려준다 — 사람이 칸을 고르면 된다
      console.warn('[intake-auto] 분류 실패:', err);
      warnings.push('자동 분류에 실패했습니다. 서류 칸을 직접 골라주세요.');
    }
  }

  // ── 분할·병합 (노션 호출 없는 순수 함수) ─────────────────────
  onProgress({ phase: 'split', message: '서류 종류별로 나누는 중' });
  const items = await buildUploadItems(files, metadata);

  /*
   * 한 칸에 파일이 하나다(documents PK = project_id + kind).
   * 회의록 2종·사업자등록증/고유번호증·건축물대장/K-apt 는 두 카테고리가 한 칸으로 모이므로
   * 겹치면 뒤엣것이 앞엣것을 덮는다. 조용히 덮지 않고 알린다.
   */
  const byKind = new Map<string, { item: (typeof items)[number]; index: number }>();
  items.forEach((item, index) => {
    const kind = kindOfCategory(item.category);
    if (!kind) return;
    const seen = byKind.get(kind);
    if (seen) {
      warnings.push(
        `${item.category} 와 ${seen.item.category} 가 같은 칸(${kind})입니다 — ${item.standardName} 만 남습니다.`
      );
    }
    byKind.set(kind, { item, index });
  });

  // ── 임시 자리에 올린다 ────────────────────────────────────
  const docs: AutoDoc[] = [];
  for (const [kind, { item, index }] of byKind) {
    onProgress({
      phase: 'upload',
      message: `서류를 올리는 중 — ${item.standardName}`,
      done: docs.length,
      total: byKind.size,
    });
    const ext = (item.standardName.split('.').pop() ?? 'pdf').toLowerCase();
    /*
     * 같은 밀리초에 두 파일을 올려도 부딪히지 않게 순번을 붙인다.
     * allowOverwrite 기본값이 false 라 같은 이름이면 그냥 실패한다.
     */
    const pathname = `${stagePrefix}/${kind}-${index}.${ext}`;
    const blob = await put(pathname, item.buffer, {
      access: 'public',
      contentType: item.contentType ?? 'application/pdf',
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    docs.push({ kind, category: item.category, filename: item.standardName, blobUrl: blob.url });
  }

  /*
   * ★접수 단계에서 서류를 한 장씩 AI 로 검수하지 않는다★ (lib/intake-review.ts 는 남겨둔다)
   *
   * 서류 수만큼 판독을 더 돌아서 접수가 1~2분씩 걸리는데, 얻는 것이 그만큼이 아니었다.
   * 시험에서 「계약일 2026-05-19 인데 합의서에는 05-13」처럼 사실이 아닌 지적을 내놨다.
   * 틀린 지적은 없는 것보다 나쁘다 — 접수하는 사람이 서류를 다시 뒤지게 만든다.
   *
   * 검수는 접수가 아니라 한백이 현장 상세에서 볼 일이다. 그때는 시간이 급하지 않다.
   */
  const review = null;

  // ── 현장 정보 ─────────────────────────────────────────────
  const categories = (metadata?.files ?? []).map((f) => f.category);
  const cpo = metadata?.CPO?.find((c) => (CPOS as string[]).includes(c)) as CpoName | undefined;

  const addr = metadata?.주소?.trim() ?? null;
  const rawName = metadata?.현장명?.trim() || null;

  const fields: AutoFields = {
    cpo: cpo ?? null,
    /*
     * 이름 앞에 지역을 붙인다 — 계약서의 현장명은 「태평아파트」처럼 지역이 없어서
     * 138건이 되면 어느 전주인지 구분되지 않는다(lib/region).
     */
    name: rawName ? withRegionPrefix(rawName, addr) : null,
    addr,
    bldgType: metadata?.건축물유형 ?? null,
    contractParty: partyFromCategories(categories),
    powerType: toPowerType(metadata?.전력인입 ?? null),
    bizType: metadata?.사업구분 ?? null,
    parkTotal: metadata?.총주차면수 ?? null,
    mgr: metadata?.현장담당자?.trim() || null,
    tel: metadata?.현장연락처?.trim() || null,
    mail: metadata?.현장이메일?.trim() || null,
    preInstall: categories.length > 0 ? preInstallFromCategories(categories) : null,
    termYears: toTerm(metadata?.계약기간 ?? null),
    qty: metadata?.계약대수 ?? null,
  };

  if (!fields.contractParty) {
    warnings.push('회의록이 없어 계약주체를 알 수 없습니다 — 직접 골라주세요.');
  }
  if (!fields.termYears || !fields.qty) {
    warnings.push('계약기간·대수를 읽지 못했습니다 — 직접 확인해주세요.');
  } else if (fields.powerType === '한전불입+모자분리') {
    // 총 대수만 읽힌다. 몇 기씩인지는 사람이 쪼개야 하므로 그 사실을 알린다.
    warnings.push(
      `한전불입과 모자분리가 섞인 현장입니다 (총 ${fields.qty}기) — 몇 기씩인지 직접 나눠 적어주세요.`
    );
  }
  return { fields, confidence: metadata?.confidence ?? {}, docs, review, warnings };
}
