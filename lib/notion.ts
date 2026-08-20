/**
 * Notion API 클라이언트.
 * - 노션 DB entry 생성 (전기차 실사관리)
 * - 파일 업로드 + 페이지 첨부 (Notion File Upload API)
 *
 * 서버 사이드 전용.
 */
import { Client, APIResponseError } from '@notionhq/client';
import JSZip from 'jszip';
import type {
  ClassifiedFile, ClassifiedFileInfo, ExtractedMetadata, FileCategory, PowerInlet,
} from '@/types/intake';
import type { CpoName, PowerType } from '@/types/project';
import type { NormalizedFile } from './files';
import { buildStandardName, isPdfFile } from './files';
import { excelCategory, kindOfCategory } from './doc-category-map';
import { buildDocContext, evaluateDocs, type DocContext } from './doc-rules';
import { splitPdf, mergePdfs } from './pdf-split';
import { createHash } from 'crypto';

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
  metadata: ExtractedMetadata | null,
  note: string = ''
): Promise<{ id: string; url: string }> {
  const currentYear = new Date().getFullYear();

  const properties: Record<string, any> = {
    '현장명': {
      title: [{ text: { content: metadata?.현장명 ?? '(미확인)' } }],
    },
    '영업현황': { select: { name: '계약완료' } },
    '*사업연도': { select: { name: `${currentYear}년` } },
    '접수자': { rich_text: [{ text: { content: salesRep.name } }] },
    '접수자 소속': { rich_text: [{ text: { content: salesRep.company } }] },
  };

  if (metadata) {
    if (metadata.주소) {
      properties['현장주소'] = richText(metadata.주소);
    }
    if (metadata.건축물유형) {
      properties['건축물 유형'] = { select: { name: metadata.건축물유형 } };
    }
    if (metadata.CPO && metadata.CPO.length > 0) {
      properties['운영사'] = { select: { name: metadata.CPO[0] } };
    }
    // 숫자 필드: Claude가 "7" 같은 문자열로 줄 수 있어 강제 숫자 변환 (아니면 Notion 400)
    const 계약대수 = toFiniteNumber(metadata.계약대수);
    if (계약대수 != null) {
      properties['계약대수'] = { number: 계약대수 };
    }
    if (metadata.계약기간) {
      properties['계약기간'] = { select: { name: metadata.계약기간 } };
    }
    const 총주차면수 = toFiniteNumber(metadata.총주차면수);
    if (총주차면수 != null) {
      properties['총 주차면수'] = { number: 총주차면수 };
    }
    if (metadata.전력인입) {
      const mapped = mapPowerInletToSujeon(metadata.전력인입);
      if (mapped) properties['수전방식'] = { select: { name: mapped } };
    }
    if (metadata.현장담당자) {
      properties['현장담당자'] = richText(metadata.현장담당자);
    }
    if (metadata.현장연락처) {
      properties['현장연락처'] = { phone_number: metadata.현장연락처 };
    }
    // 이메일은 형식이 유효할 때만 (Notion email 속성은 잘못된 형식이면 create 전체가 400)
    if (metadata.현장이메일 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(metadata.현장이메일)) {
      properties['현장이메일'] = { email: metadata.현장이메일 };
    }
    // 사업구분: 추출값 우선, 없으면 설치신청서 유무로 환경부 추정
    const has설치신청서 = (metadata.files ?? []).some(
      (f) => f.category === '전기차충전시설 설치신청서'
    );
    const 사업구분 = metadata.사업구분 ?? (has설치신청서 ? '환경부' : null);
    if (사업구분) {
      properties['사업구분'] = { select: { name: 사업구분 } };
    }
  }

  // 서류특이사항 (AI): 접수자 입력 메모 우선 + AI 추출 비고 (metadata 없어도 메모는 기록)
  const 서류특이사항Parts: string[] = [];
  if (note) 서류특이사항Parts.push(`[접수자] ${note}`);
  if (metadata?.비고) 서류특이사항Parts.push(`[AI] ${metadata.비고}`);
  if (서류특이사항Parts.length > 0) {
    properties['서류특이사항 (AI)'] = richText(서류특이사항Parts.join('\n'));
  }

  // 누락 서류 점검 (핵심 세트 + 조건부) → '누락서류 (AI)' 속성에 기록
  properties['누락서류 (AI)'] = richText(buildMissingDocsNote(metadata));

  const page = await createPageDroppingMissingProps(properties);

  return {
    id: page.id,
    url: (page as { url: string }).url,
  };
}

/**
 * 페이지를 생성하되, 노션이 "존재하지 않는 속성"이라고 거부하면 그 속성만 빼고 재시도한다.
 * 노션에서 속성이 삭제/이름변경되어(스키마 드리프트) 존재하지 않는 속성 하나 때문에
 * create 전체가 400으로 실패(→ 접수 실패)하는 것을 방지한다.
 *
 * databases.retrieve는 최신 스키마를 즉시 반영하지 못할 수 있어(캐시/지연) 신뢰하지 않고,
 * create 응답의 실제 오류 메시지를 근거로 정확히 문제 속성만 제거한다.
 */
async function createPageDroppingMissingProps(
  properties: Record<string, any>
): Promise<{ id: string; url: string }> {
  const props = { ...properties };
  const dropped: string[] = [];

  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const page = await notion.pages.create({
        parent: { database_id: DB_ID },
        properties: props,
      });
      if (dropped.length > 0) {
        console.warn(
          `[notion] 존재하지 않는 속성 제외하고 접수 저장 (스키마 변경?): ${dropped.join(', ')}`
        );
      }
      return { id: page.id, url: (page as { url: string }).url };
    } catch (err) {
      const missing = parseMissingPropertyNames(err).filter((n) => n in props);
      if (missing.length === 0) throw err; // 다른 종류의 오류는 그대로 전파
      for (const name of missing) {
        delete props[name];
        dropped.push(name);
      }
    }
  }

  // 재시도 소진 후 마지막 1회 (여기서 실패하면 상위에서 처리)
  const page = await notion.pages.create({
    parent: { database_id: DB_ID },
    properties: props,
  });
  return { id: page.id, url: (page as { url: string }).url };
}

/** 노션 validation 오류 메시지에서 "X is not a property that exists." 속성명들을 추출. */
function parseMissingPropertyNames(err: unknown): string[] {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  const names: string[] = [];
  const re = /(.+?) is not a property that exists\./g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(msg)) !== null) {
    const name = m[1].trim();
    if (name) names.push(name);
  }
  return names;
}

/**
 * PDF 파일들을 Notion File Upload API로 페이지에 첨부합니다.
 *
 * 통합 PDF(1개 파일에 여러 서류)인 경우:
 *   Claude가 pages 필드로 서류별 페이지 범위를 지정하면
 *   pdf-lib로 분할하여 각각 개별 파일로 첨부합니다.
 *
 * rate limit: 3 req/sec → 파일 간 400ms sleep
 */
export async function attachFilesToPage(
  pageId: string,
  files: NormalizedFile[],
  metadata: ExtractedMetadata | null
): Promise<ClassifiedFile[]> {
  const today = formatToday();
  const uploadItems = await buildUploadItems(files, metadata);
  const { classifiedFiles } = await attachUploadItemsToPage(pageId, uploadItems, today);
  return classifiedFiles;
}

export interface UploadItem {
  originalName: string;
  category: FileCategory;
  standardName: string;
  buffer: Buffer;
  /** 첨부 시 content-type (미지정 시 application/pdf) */
  contentType?: string;
}

export interface AttachmentProgress {
  current: number;
  total: number;
  standardName: string;
  item: UploadItem;
}

export interface AttachUploadItemsOptions {
  onProgress?: (progress: AttachmentProgress) => void;
  /** 지정 시, 모든 분할 파일을 한 번에 압축한 ZIP을 페이지 상단에 추가로 첨부 */
  siteName?: string;
}

export interface AttachUploadItemsResult {
  classifiedFiles: ClassifiedFile[];
  warnings: string[];
}

/**
 * 통합 PDF 분할을 포함한 업로드 항목 목록 생성.
 */
export async function buildUploadItems(
  files: NormalizedFile[],
  metadata: ExtractedMetadata | null
): Promise<UploadItem[]> {
  const items: UploadItem[] = [];

  for (const file of files) {
    const normalName = file.name.normalize('NFC');

    // 통과 파일(xlsx/pptx 등): AI 분류·분할 없이 원본 그대로, 확장자 유지해 첨부
    if (!isPdfFile(file)) {
      const ext = (normalName.split('.').pop() ?? 'bin').toLowerCase();
      const category = passthroughCategory(normalName);
      items.push({
        originalName: file.name,
        category,
        standardName: metadata?.현장명
          ? buildStandardName(metadata.현장명, category, ext)
          : file.name,
        buffer: file.buffer,
        contentType: file.mimeType,
      });
      continue;
    }

    // 이 파일에 매칭되는 metadata entries (통합 PDF면 여러 개)
    const matchedInfos: ClassifiedFileInfo[] = metadata?.files?.filter(
      (f) => f.originalName.normalize('NFC') === normalName
    ) ?? [];

    if (matchedInfos.length <= 1) {
      // 일반 케이스: 1파일 = 1서류 (또는 metadata 없음)
      const category = matchedInfos[0]?.category ?? '기타';
      items.push({
        originalName: file.name,
        category,
        standardName: metadata?.현장명
          ? buildStandardName(metadata.현장명, category)
          : file.name,
        buffer: file.buffer,
      });
    } else {
      // 통합 PDF: pages 기반 분할
      // 페이지 분리 금지 카테고리는 같은 파일 내 항목들을 하나로 합침
      const merged = mergeNoSplitCategories(matchedInfos);

      for (const info of merged) {
        let buffer: Buffer;
        if (info.pages && info.pages.length > 0) {
          buffer = await splitPdf(file.buffer, info.pages);
        } else {
          buffer = file.buffer;
        }

        items.push({
          originalName: file.name,
          category: info.category,
          standardName: metadata?.현장명
            ? buildStandardName(metadata.현장명, info.category)
            : file.name,
          buffer,
        });
      }
    }
  }

  return mergeKaptWithBuildingLedger(items, metadata?.현장명);
}

/**
 * K-apt 스크린샷을 건축물대장과 하나의 PDF로 병합한다.
 * (건축물대장에 주차면수가 없을 때 K-apt 화면을 보완 자료로 함께 제출)
 * 병합 파일명: {현장명}_건축물대장+kapt스크린샷.pdf
 * 건축물대장이 없으면 K-apt는 단독 파일로 유지한다.
 */
async function mergeKaptWithBuildingLedger(
  items: UploadItem[],
  현장명: string | undefined
): Promise<UploadItem[]> {
  const kaptItems = items.filter((i) => i.category === 'K-apt 스크린샷');
  const bldgItems = items.filter((i) => i.category === '건축물대장');
  if (kaptItems.length === 0 || bldgItems.length === 0) return items;

  const mergedBuffer = await mergePdfs([
    ...bldgItems.map((b) => b.buffer),
    ...kaptItems.map((k) => k.buffer),
  ]);
  // 병합 실패 시엔 건축물대장·K-apt를 각각 개별 파일로 그대로 첨부 (누락 방지)
  if (!mergedBuffer) {
    console.warn('[notion] 건축물대장+K-apt 병합 실패 → 개별 첨부로 유지');
    return items;
  }
  const safeName = 현장명?.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
  const mergedItem: UploadItem = {
    originalName: bldgItems[0].originalName,
    category: '건축물대장',
    standardName: safeName
      ? `${safeName}_건축물대장+kapt스크린샷.pdf`
      : bldgItems[0].standardName,
    buffer: mergedBuffer,
  };

  // 원래 건축물대장 위치에 병합본을 넣고, 개별 건축물대장·K-apt 항목은 제거
  const result: UploadItem[] = [];
  let inserted = false;
  for (const it of items) {
    if (it.category === 'K-apt 스크린샷') continue;
    if (it.category === '건축물대장') {
      if (!inserted) {
        result.push(mergedItem);
        inserted = true;
      }
      continue;
    }
    result.push(it);
  }
  return result;
}

/**
 * 통과 파일(xlsx/pptx 등)의 카테고리를 정한다. AI 분류를 타지 않는 파일들이다.
 *
 * .xlsx 는 확장자만으로 가릴 수 없다 — 필수 서류가 둘이다(실사보고서 · 기설치 충전기 설치이력).
 * 예전에는 전부 실사보고서로 넣어서 둘을 같이 올리면 설치이력이 사라졌다. 파일명으로 가른다.
 */
function passthroughCategory(name: string): FileCategory {
  const lower = name.toLowerCase();
  if (/\.xlsx?$/.test(lower)) return excelCategory(name);
  if (/\.pptx?$/.test(lower)) return '설치승인서'; // 현대 설치승인서
  return '기타';
}

export async function attachUploadItemsToPage(
  pageId: string,
  uploadItems: UploadItem[],
  today: string,
  options: AttachUploadItemsOptions = {}
): Promise<AttachUploadItemsResult> {
  const classifiedFiles: ClassifiedFile[] = [];
  const warnings: string[] = [];
  const nameCount = new Map<string, number>();

  // 개별 파일 이름(중복 시 _2, _3 ...)을 사전 확정 → ZIP 내부/페이지 블록 동일
  const resolvedItems = uploadItems.map((item) => ({
    item,
    uniqueName: createUniqueFileName(item.standardName, nameCount),
  }));

  const siteName = options.siteName?.trim() ?? '';
  const shouldBundle = siteName.length > 0 && resolvedItems.length > 1;
  const totalSteps = resolvedItems.length + (shouldBundle ? 1 : 0);
  let currentStep = 0;

  // ── 번들 ZIP 먼저 첨부 (페이지 상단 위치) ────────────────────
  if (shouldBundle) {
    currentStep++;
    const zipName = buildBundleZipName(siteName);

    options.onProgress?.({
      current: currentStep,
      total: totalSteps,
      standardName: zipName,
      item: {
        originalName: zipName,
        category: '기타',
        standardName: zipName,
        buffer: Buffer.alloc(0),
      },
    });

    try {
      const zipBuffer = await buildBundleZip(resolvedItems);
      await uploadAndAttach(pageId, zipBuffer, zipName, 'application/zip');
      await sleep(400);
    } catch (err) {
      console.error('[notion] 번들 ZIP 첨부 실패:', err);
      warnings.push(`${zipName} 첨부 실패`);
    }
  }

  // ── 개별 파일 첨부 ──────────────────────────────────────────
  for (const { item, uniqueName } of resolvedItems) {
    currentStep++;

    options.onProgress?.({
      current: currentStep,
      total: totalSteps,
      standardName: uniqueName,
      item,
    });

    try {
      await uploadAndAttach(
        pageId,
        item.buffer,
        uniqueName,
        item.contentType ?? 'application/pdf'
      );
      classifiedFiles.push({
        originalName: item.originalName,
        category: item.category,
        date: today,
        standardName: uniqueName,
        hash: createHash('sha256').update(item.buffer).digest('hex'),
      });
    } catch (err) {
      const code = err instanceof APIResponseError ? err.code : 'unknown';
      console.error(`[notion] 파일 첨부 실패 (${uniqueName}) code=${code}:`, err);
      warnings.push(`${uniqueName} 첨부 실패`);
    }

    await sleep(400);
  }

  return { classifiedFiles, warnings };
}

/**
 * 접수 서류 누락 점검 결과 문구를 만든다. ('누락서류' 속성용)
 *
 * ★판정을 여기서 하지 않는다★
 * 예전에는 이 파일이 필수 서류 목록을 따로 갖고 있었다 — COMMON_REQUIRED_DOCS,
 * ENV_ONLY_REQUIRED_DOCS, 합의서면제, 사진대지면제, needsKepcoBill. 주석에는
 * 「판정 기준은 lib/doc-rules.ts 가 정본이고 이것을 그 규칙에 맞춘 것」이라고 적어뒀지만,
 * 손으로 맞춘 사본이라 이미 갈려 있었다(2026-08-20 대조):
 *
 *   합의서       여기: SK일렉링크·현대엔지니어링·에버온만 면제(나머지 필수)
 *                정본: 플러그링크·나이스인프라만 필수 — 정반대였다
 *   개인정보·설치신청서   여기: 환경부만 / 정본: 항상 필수
 *   별지2·기설치 설치이력  여기: 아예 검사하지 않았다
 *
 * 그래서 목록을 지우고 정본을 부른다. 협력사가 포털에서 받는 「누락」 통보와 한백이
 * 콘솔에서 보는 「필수」가 같은 규칙에서 나온다 — 갈리면 포털에서는 다 냈다는데
 * 콘솔에서 계약이 안 넘어간다.
 */
export function buildMissingDocsNote(metadata: ExtractedMetadata | null): string {
  if (!metadata) return 'AI 분류 실패 — 서류 누락 여부 수동 확인 필요';

  /* 여러 카테고리가 한 칸으로 모인다(사업자등록증·고유번호증 → bizreg) — 칸으로 세야 한다 */
  const present = new Set(
    (metadata.files ?? [])
      .map((f) => kindOfCategory(f.category))
      .filter((kind): kind is string => Boolean(kind))
  );

  const missing = evaluateDocs(docContextOf(metadata))
    .filter((d) => d.req === 'm' && !present.has(d.key))
    .map((d) => d.label);

  if (missing.length === 0) return '이상 없음';
  return `⚠ 누락 ${missing.length}건: ${missing.join(', ')}`;
}

/**
 * 판독 결과를 서류 규칙이 쓰는 꼴로 옮긴다.
 *
 * ★같은 것을 두 낱말로 부른다★
 * 포털은 수전방식을 「한전수전」이라 하고 콘솔은 「한전불입」이라 한다. 값이 다른 것이
 * 아니라 이름만 다르다. 여기서 한 번 옮기고, 어느 쪽 낱말이 어느 쪽 것인지 적어둔다.
 *
 * 없는 값은 없다고 넘긴다 — 계약주체는 노션 접수에 없어서 건축물유형에서 유도되고
 * (doc-rules resolveParty), 기설치 여부는 접수 시점에 모른다. 모르는 것을 있다고
 * 넘기면 낼 수 없는 서류를 누락으로 통보하게 된다.
 */
function docContextOf(m: ExtractedMetadata): DocContext {
  const POWER: Record<PowerInlet, PowerType> = {
    '한전수전': '한전불입',
    '모자분리': '모자분리',
    '모자분리 + 한전수전': '한전불입+모자분리',
  };

  return buildDocContext({
    // 판독은 운영사를 여럿 읽을 수 있다. 서류 규칙은 한 곳을 본다 — 첫 곳을 쓴다.
    cpo: asCpoName(m.CPO?.[0]),
    contractParty: null,
    bldgType: m.건축물유형,
    projectPowerType: m.전력인입 ? POWER[m.전력인입] : null,
    linePowerTypes: [],
    preInstall: '없음',
    bizType: m.사업구분,
  });
}

/** 콘솔이 아는 운영사인가. 모르는 이름이면 null — 그 운영사 전용 서류를 요구하지 않는다. */
const KNOWN_CPOS: CpoName[] = ['플러그링크', '나이스인프라', '현대엔지니어링', 'SK일렉링크', '에버온'];
const asCpoName = (name: string | undefined): CpoName | null =>
  KNOWN_CPOS.find((c) => c === name) ?? null;

// Notion rich_text 한 조각의 최대 길이(2000자). 초과 시 create 전체가 400.
const NOTION_TEXT_MAX = 2000;

/** rich_text 속성값 생성 (2000자 초과 시 안전하게 잘라냄). */
function richText(content: string): { rich_text: Array<{ text: { content: string } }> } {
  const safe =
    content.length > NOTION_TEXT_MAX
      ? `${content.slice(0, NOTION_TEXT_MAX - 1)}…`
      : content;
  return { rich_text: [{ text: { content: safe } }] };
}

/** number 속성용: 숫자/숫자문자열만 유효 숫자로, 그 외(null/NaN/문자)는 null. */
function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function mapPowerInletToSujeon(value: string): string | null {
  const map: Record<string, string> = {
    '모자분리': '모자분리',
    '한전수전': '한전불입',
    '모자분리 + 한전수전': '한전불입+모자분리',
  };
  return map[value] ?? null;
}

function buildBundleZipName(siteName: string): string {
  const safe = siteName.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
  return `${safe}_전체.zip`;
}

async function buildBundleZip(
  resolvedItems: Array<{ item: UploadItem; uniqueName: string }>
): Promise<Buffer> {
  const zip = new JSZip();
  for (const { item, uniqueName } of resolvedItems) {
    zip.file(uniqueName, item.buffer);
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/** 일시적 오류(네트워크·429·5xx)에 한해 지수 백오프로 재시도한다. */
async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  attempts = 3
): Promise<T> {
  let lastError: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i >= attempts || !isRetryableError(err)) break;
      console.warn(`[notion] ${label} 재시도 ${i}/${attempts - 1}:`, err);
      await sleep(500 * i);
    }
  }
  throw lastError;
}

function isRetryableError(err: unknown): boolean {
  if (err instanceof APIResponseError) {
    return err.status === 429 || err.status >= 500;
  }
  // fetch 헬퍼가 던지는 "... failed: <status> ..." 메시지에서 상태코드 판별
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.match(/failed:\s*(\d{3})/);
  if (m) {
    const s = Number(m[1]);
    return s === 429 || s >= 500;
  }
  return true; // 네트워크/알 수 없는 오류 → 재시도
}

/**
 * 단일 파일을 Notion에 업로드 + 페이지에 블록 첨부.
 * 각 단계(업로드 세션/전송, 블록 첨부)를 일시 오류 시 재시도해 누락을 줄인다.
 */
export async function uploadAndAttach(
  pageId: string,
  buffer: Buffer,
  standardName: string,
  contentType: string = 'application/pdf'
): Promise<void> {
  // Step 1+2: 업로드 세션 생성 + 바이너리 전송 (재시도 시 새 세션 발급 → 중복 없음)
  const fileUploadId = await withRetry(async () => {
    const createRes = await fetch('https://api.notion.com/v1/file_uploads', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ filename: standardName, content_type: contentType }),
    });
    if (!createRes.ok) {
      throw new Error(`file_uploads.create failed: ${createRes.status} ${await createRes.text()}`);
    }
    const fileUpload = (await createRes.json()) as { id: string };

    const formData = new FormData();
    const ab = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    ) as ArrayBuffer;
    formData.append('file', new Blob([ab], { type: contentType }), standardName);

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
      throw new Error(`file_uploads.send failed: ${sendRes.status} ${await sendRes.text()}`);
    }
    return fileUpload.id;
  }, `업로드(${standardName})`);

  // Step 3: 페이지 블록으로 첨부
  await withRetry(
    () =>
      notion.blocks.children.append({
        block_id: pageId,
        children: [createFileBlock(standardName, fileUploadId) as any],
      }),
    `첨부(${standardName})`
  );
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

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatToday(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}${mm}${dd}`;
}

function createUniqueFileName(
  standardName: string,
  nameCount: Map<string, number>
): string {
  const count = (nameCount.get(standardName) ?? 0) + 1;
  nameCount.set(standardName, count);
  if (count === 1) return standardName;
  // 확장자 앞에 _N 삽입 (pdf·xlsx·pptx 등 확장자 무관)
  const dot = standardName.lastIndexOf('.');
  if (dot < 0) return `${standardName}_${count}`;
  return `${standardName.slice(0, dot)}_${count}${standardName.slice(dot)}`;
}

// 여러 페이지여도 하나의 파일로 유지해야 하는 카테고리
// (계약서: SK 별첨1·현대 운영서비스계약서+약관처럼 계약 관련 페이지는 항상 1개 파일로 통합)
const NO_SPLIT_CATEGORIES = new Set<string>([
  '계약서',
  '한전 전기요금 청구서',
  '건축물대장',
]);

/**
 * NO_SPLIT_CATEGORIES에 해당하는 항목은 같은 카테고리끼리 pages를 합쳐 1개 항목으로 만든다.
 */
function mergeNoSplitCategories(infos: ClassifiedFileInfo[]): ClassifiedFileInfo[] {
  const result: ClassifiedFileInfo[] = [];
  const merged = new Map<string, ClassifiedFileInfo>();

  for (const info of infos) {
    if (!NO_SPLIT_CATEGORIES.has(info.category)) {
      result.push(info);
      continue;
    }
    const existing = merged.get(info.category);
    if (!existing) {
      merged.set(info.category, { ...info, pages: info.pages ? [...info.pages] : [] });
    } else {
      if (info.pages) existing.pages = [...(existing.pages ?? []), ...info.pages];
    }
  }

  return [...result, ...merged.values()];
}
