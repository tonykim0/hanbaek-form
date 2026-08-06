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
 * 파일명을 화면용 자료명으로 다듬습니다. 실제 파일명(다운로드되는 이름)은 그대로입니다.
 *
 *   1. 현대케피코_카탈로그.pdf            → 현대케피코 카탈로그          (번호 1)
 *   20260325_현대엔지니어링_제안서.pdf     → 현대엔지니어링 제안서        (문서일 2026. 03. 25.)
 *   260317_브로슈어 [아파트영업용]_최종.pdf → 브로슈어 [아파트영업용] 최종 (문서일 2026. 03. 17.)
 *
 * 자동 규칙으로 부족하면 관리자 화면에서 이름을 직접 바꿀 수 있습니다.
 */
export function parseDisplayTitle(fileName: string): ParsedTitle {
  const dot = fileName.lastIndexOf('.');
  let stem = dot > 0 ? fileName.slice(0, dot) : fileName;

  // 선행 정렬번호 — 「1. 」 「2) 」
  let order: number | null = null;
  const numbered = stem.match(/^(\d{1,2})[.)]\s+/);
  if (numbered) {
    order = Number(numbered[1]);
    stem = stem.slice(numbered[0].length);
  }

  // 선행 날짜 — 「260317_」 「20260325_」
  let docDate: string | null = null;
  const dated = stem.match(/^(\d{8}|\d{6})[_\-. ]/);
  if (dated) {
    const parsed = parseCompactDate(dated[1]);
    if (parsed) {
      docDate = parsed;
      stem = stem.slice(dated[0].length);
    }
  }

  const title = stem.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

  return { title: title || (dot > 0 ? fileName.slice(0, dot) : fileName), order, docDate };
}

/**
 * 업로드 파일명 정리 — 경로 구분자 · 제어문자를 지웁니다.
 * (한글 · 공백 · 대괄호는 그대로 둡니다. Blob URL은 SDK가 인코딩합니다.)
 */
export function sanitizeFileName(name: string): string {
  return name
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
  if (fileName !== sanitizeFileName(fileName)) return false;

  return true;
}
