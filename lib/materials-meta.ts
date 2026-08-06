/**
 * 자료실 공통 상수 · 포맷터.
 *
 * 서버(Blob 조회)와 클라이언트(관리자 업로드 화면) 양쪽에서 쓰므로
 * node 전용 모듈을 import하지 않습니다.
 */

/** Blob 저장소에서 자료실이 쓰는 경로 접두사 — materials/<운영사>/<분류>/<파일명> */
export const MATERIALS_PREFIX = 'materials/';

export interface MaterialFile {
  /** 화면에 보여줄 자료명 — 파일명에서 번호 · 날짜 · 언더스코어를 정리한 것 */
  title: string;
  fileName: string;
  /** 「1. 」 같은 선행 번호 (정렬용) */
  order: number | null;
  /** 파일명 앞에 붙은 문서 일자 */
  docDate: string | null;
  /** Blob 경로 (materials/hec/sales/파일.pdf) */
  pathname: string;
  /** 브라우저에서 바로 열리는 URL */
  url: string;
  /** 클릭 시 내려받기로 동작하는 URL */
  downloadUrl: string;
  ext: string;
  size: string;
  uploaded: string;
  uploadedAt: number;
}

export interface MaterialCategory {
  key: string;
  label: string;
  files: MaterialFile[];
}

export interface MaterialGroup {
  key: string;
  label: string;
  categories: MaterialCategory[];
  fileCount: number;
}

/** 운영사 폴더명 → 표시 이름 */
export const GROUP_LABELS: Record<string, string> = {
  common: '공통',
  pluglink: '플러그링크',
  hec: '현대엔지니어링',
  nice: '나이스인프라',
  sk: 'SK일렉링크',
};

/** 표시 순서 — 여기에 없는 키는 뒤에 이름순으로 붙습니다 */
export const GROUP_ORDER = ['common', 'pluglink', 'hec', 'nice', 'sk'];

/** 분류 폴더명 → 표시 이름 */
export const CATEGORY_LABELS: Record<string, string> = {
  sales: '영업자료',
  spec: '시방서',
  etc: '기타',
};

export const CATEGORY_ORDER = ['sales', 'spec', 'etc'];

/** 분류 폴더 없이 운영사 바로 아래 올린 파일이 담기는 분류 */
export const LOOSE_CATEGORY = 'etc';

export const GROUP_KEYS = GROUP_ORDER;
export const CATEGORY_KEYS = CATEGORY_ORDER;

export function groupLabel(key: string): string {
  return GROUP_LABELS[key] ?? key;
}

export function categoryLabel(key: string): string {
  return CATEGORY_LABELS[key] ?? key;
}

export function orderIndex(order: string[], key: string): number {
  const i = order.indexOf(key);
  return i === -1 ? order.length : i;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}

export function formatDate(value: Date | number | string): string {
  const d = new Date(value);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}. ${mm}. ${dd}.`;
}

export interface ParsedTitle {
  /** 화면에 보여줄 자료명 */
  title: string;
  /** 「1. 」 같은 선행 번호 — 목록 정렬에 씁니다 */
  order: number | null;
  /** 「260317_」 같은 선행 날짜 — 문서 일자로 따로 보여줍니다 */
  docDate: string | null;
}

/** 260317 · 20260325 형태의 숫자를 날짜로 해석 (아니면 null) */
function parseCompactDate(value: string): string | null {
  const [y, m, d] =
    value.length === 6
      ? [2000 + Number(value.slice(0, 2)), Number(value.slice(2, 4)), Number(value.slice(4, 6))]
      : [Number(value.slice(0, 4)), Number(value.slice(4, 6)), Number(value.slice(6, 8))];

  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  if (y < 2000 || y > 2100) return null;

  return `${y}. ${String(m).padStart(2, '0')}. ${String(d).padStart(2, '0')}.`;
}

/**
 * 자료명 앞에 붙는 운영사 이름 — 이미 운영사 카드 안에 있으므로 제목에서 뺍니다.
 * 제조사·제품명(현대케피코 · 나이스차저 등)은 정보이므로 넣지 않습니다.
 */
const GROUP_TITLE_ALIASES: Record<string, string[]> = {
  pluglink: ['플러그링크'],
  hec: ['현대엔지니어링', '현대ENG'],
  nice: ['NICE인프라(주)', 'NICE인프라', '나이스인프라(주)', '나이스인프라'],
  sk: ['SK일렉링크', 'SKEL', 'SK일렉링크(주)'],
};

/** 제목 앞뒤에 남은 구분자를 정리 */
function trimSeparators(value: string): string {
  return value.replace(/^[\s_\-·,]+/, '').replace(/[\s_\-·,]+$/, '').trim();
}

/**
 * 파일명을 화면용 자료명으로 다듬습니다. 실제 파일명(다운로드되는 이름)은 그대로입니다.
 *
 *   1. 현대케피코_카탈로그.pdf                  → 현대케피코 카탈로그          (번호 1)
 *   20260325_현대엔지니어링_완속사업제안서.pdf   → 완속사업제안서               (문서일 2026. 03. 25.)
 *   [플러그링크] 브로슈어_에바3.pdf              → 브로슈어 에바3
 *   NICE인프라(주)_제안서_공동주택_260801.pdf    → 제안서 공동주택              (문서일 2026. 08. 01.)
 *
 * 자동 규칙으로 부족하면 관리자 화면에서 이름을 직접 바꿀 수 있습니다.
 */
export function parseDisplayTitle(fileName: string, groupKey?: string): ParsedTitle {
  // 맥에서 올린 파일명은 자모가 분리된 NFD로 저장됩니다.
  // 정규화하지 않으면 「플러그링크」 같은 비교가 전부 어긋납니다.
  const normalized = fileName.normalize('NFC');
  const dot = normalized.lastIndexOf('.');
  const original = dot > 0 ? normalized.slice(0, dot) : normalized;
  let stem = original;

  // 1) 선행 정렬번호 — 「1. 」 「2.」(공백 없음) 「1.1. 」 「3) 」
  let order: number | null = null;
  const numbered = stem.match(/^(\d{1,2})(?:\.\d{1,2})*[.)]\s*/);
  if (numbered) {
    order = Number(numbered[1]);
    stem = stem.slice(numbered[0].length);
  }

  // 2) 선행 날짜 — 「260317_」 「20260325_」
  let docDate: string | null = null;
  const leadingDate = stem.match(/^(\d{8}|\d{6})[_\-. ]/);
  if (leadingDate) {
    const parsed = parseCompactDate(leadingDate[1]);
    if (parsed) {
      docDate = parsed;
      stem = stem.slice(leadingDate[0].length);
    }
  }

  stem = stem.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

  // 2-1) 내려받을 때 붙는 중복 표시 — 「 (1)」 「 - 복사본」 「 사본」
  stem = stem
    .replace(/\s*\(\d{1,2}\)$/, '')
    .replace(/\s*[-–]\s*복사본$/, '')
    .replace(/\s*복사본$/, '')
    .trim();

  // 3) 끝에 붙은 날짜 — 「… 260801」 「…(260804)」 「… 26.01.01」
  if (!docDate) {
    const trailingCompact = stem.match(/[\s(-]+(\d{8}|\d{6})\)?$/);
    const trailingDotted = stem.match(/[\s(-]+(\d{2})\.(\d{2})\.(\d{2})\)?$/);
    if (trailingCompact) {
      const parsed = parseCompactDate(trailingCompact[1]);
      if (parsed) {
        docDate = parsed;
        stem = stem.slice(0, trailingCompact.index);
      }
    } else if (trailingDotted) {
      const parsed = parseCompactDate(
        `${trailingDotted[1]}${trailingDotted[2]}${trailingDotted[3]}`
      );
      if (parsed) {
        docDate = parsed;
        stem = stem.slice(0, trailingDotted.index);
      }
    }
  }

  // 4) 운영사 이름이 반복되면 제거 — 이미 운영사 카드 안에 있으므로 중복입니다.
  //    「[플러그링크]」 「(SKEL)」처럼 묶인 형태는 어디에 있든 지우고,
  //    괄호 없는 이름은 맨 앞에 있을 때만 지웁니다(문장 중간의 상호를 건드리지 않도록).
  for (const alias of (groupKey && GROUP_TITLE_ALIASES[groupKey]) || []) {
    const withoutWrapped = stem
      .split(`[${alias}]`)
      .join(' ')
      .split(`(${alias})`)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (withoutWrapped && withoutWrapped !== stem) {
      stem = withoutWrapped;
      break;
    }
    if (stem.startsWith(alias)) {
      const trimmed = trimSeparators(stem.slice(alias.length));
      // 이름만 남는 파일(예: 플러그링크.pdf)은 그대로 둡니다
      if (trimmed) {
        stem = trimmed;
        break;
      }
    }
  }

  // 5) 문서일을 따로 뽑았으면 앞의 「26년」 표기는 중복이므로 제거
  if (docDate) stem = stem.replace(/^\d{2}년\s+/, '');

  const title = trimSeparators(stem).replace(/\s+/g, ' ');

  return { title: title || original, order, docDate };
}

/**
 * 업로드 파일명 정리 — 경로 구분자 · 제어문자를 지웁니다.
 * (한글 · 공백 · 대괄호는 그대로 둡니다. Blob URL은 SDK가 인코딩합니다.)
 */
export function sanitizeFileName(name: string): string {
  return name
    // 맥에서 고른 파일은 자모가 분리된 NFD로 넘어오므로 저장 전에 완성형으로 통일
    .normalize('NFC')
    .replace(/[/\\]/g, '_')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/^\.+/, '')
    .trim();
}

/** materials/<운영사>/<분류>/<파일명> 경로를 만듭니다 */
export function buildMaterialPath(
  group: string,
  category: string,
  fileName: string
): string {
  return `${MATERIALS_PREFIX}${group}/${category}/${sanitizeFileName(fileName)}`;
}

/**
 * 업로드 경로가 자료실 규칙에 맞는지 검사합니다.
 * (관리자 API에서 임의 경로 업로드를 막는 용도)
 */
export function isValidMaterialPath(pathname: string): boolean {
  if (!pathname.startsWith(MATERIALS_PREFIX)) return false;
  if (pathname.includes('..')) return false;

  const rest = pathname.slice(MATERIALS_PREFIX.length);
  const segments = rest.split('/');
  if (segments.length !== 3) return false;

  const [group, category, fileName] = segments;
  if (!/^[a-z0-9-]{1,32}$/.test(group)) return false;
  if (!CATEGORY_KEYS.includes(category)) return false;
  if (!fileName || fileName.length > 200) return false;
  // 이미 올라간 NFD 파일도 통과해야 하므로 양쪽 다 정규화해서 비교합니다
  if (fileName.normalize('NFC') !== sanitizeFileName(fileName)) return false;

  return true;
}
