/**
 * 자료실 공통 상수 · 포맷터.
 *
 * 서버(Blob 조회)와 클라이언트(관리자 업로드 화면) 양쪽에서 쓰므로
 * node 전용 모듈을 import하지 않습니다.
 */

/** Blob 저장소에서 자료실이 쓰는 경로 접두사 — materials/<운영사>/<분류>/<파일명> */
export const MATERIALS_PREFIX = 'materials/';

/**
 * 밀려나거나 지워지는 자료를 옮겨 두는 자리 (2026-08-29).
 *
 * ★자료실 목록 밖이다.★ 목록은 `materials/` 로 시작하는 것만 훑으므로(getMaterials)
 * `materials-archive/` 는 협력사 화면에 안 뜬다 — 같은 자료가 두 줄로 보이면 어느 것이
 * 최신인지 알 수 없다. 보이지 않게 두되 사라지지는 않게 하는 자리다.
 *
 * ★왜 필요한가★ Vercel Blob 에는 버전도 휴지통도 없고 삭제·덮어쓰기가 영구다. 자료실은
 * 같은 이름으로 다시 올리면 교체되도록 열려 있어서(allowOverwrite), 사업자등록증을
 * 갱신본으로 올리는 순간 옛 본이 영영 사라졌다.
 */
export const MATERIALS_ARCHIVE_PREFIX = 'materials-archive/';

/**
 * 옛 자료가 옮겨 갈 경로 — 원래 경로 아래에 시각을 붙인다.
 *
 *   materials/sk/sales/제안서 v1.9.pdf
 *   → materials-archive/materials/sk/sales/제안서 v1.9.pdf/20260829-130455.pdf
 *
 * 원래 경로를 그대로 품는 이유: 한 자료의 옛 본들이 한자리에 모이고, 되돌릴 때 어디로
 * 돌려놓을지가 경로에 그대로 적혀 있다.
 */
export function archivePathOf(pathname: string, stamp: string): string {
  const dot = pathname.lastIndexOf('.');
  const ext = dot > 0 ? pathname.slice(dot) : '';
  return `${MATERIALS_ARCHIVE_PREFIX}${pathname}/${stamp}${ext}`;
}

/** 보관 이름에 쓰는 시각 — 서울 기준 YYYYMMDD-HHmmss */
export function archiveStamp(now: Date = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${kst.getUTCFullYear()}${p(kst.getUTCMonth() + 1)}${p(kst.getUTCDate())}`
    + `-${p(kst.getUTCHours())}${p(kst.getUTCMinutes())}${p(kst.getUTCSeconds())}`;
}

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

/**
 * 분류 폴더명 → 표시 이름.
 *
 * ★여섯으로 갈랐다 (한백 2026-08-28).★ 「영업자료 · 시방서 · 기타」 셋이었는데, 실제로
 * 올라오는 것이 그 셋에 안 맞았다 — 사업자등록증·보험증권·착공전서류·준공서류가 전부
 * 「영업자료」나 「시방서」에 뭉쳐 있었다. 일의 순서대로 나눈다:
 * 팔고(영업자료) → 회사를 확인하고(법인관련·업체·보험) → 공사를 시작하고(착공·안전) →
 * 허가를 받고(인허가·전기) → 세우고 끝낸다(설치·준공).
 *
 * ★옛 분류는 이름을 지우지 않는다.★ 이미 올라간 파일이 그 폴더에 있어서, 이름을 빼면
 * 화면에 폴더명(spec)이 그대로 뜬다. 새로 올릴 수는 없고(UPLOAD_CATEGORY_KEYS) 읽고
 * 옮기고 지울 수는 있다 — 옮기고 나면 저절로 사라진다.
 */
export const CATEGORY_LABELS: Record<string, string> = {
  sales: '영업자료',
  corp: '법인관련',
  vendor: '업체·보험',
  safety: '착공·안전',
  permit: '인허가·전기',
  install: '설치·준공',
  // ↓ 옛 분류 — 읽기·옮기기·지우기만 된다
  spec: '시방서',
  etc: '기타',
};

/** 새로 올릴 수 있는 분류 — 화면의 고르는 자리가 이것만 내놓는다 */
export const UPLOAD_CATEGORY_KEYS = [
  'sales', 'corp', 'vendor', 'safety', 'permit', 'install',
];

/** 옛 분류 — 새로 올리지는 못하고, 이미 있는 파일만 읽고 옮기고 지운다 */
export const LEGACY_CATEGORY_KEYS = ['spec', 'etc'];

/** 표시 순서 — 옛 분류는 뒤에 선다 */
export const CATEGORY_ORDER = [...UPLOAD_CATEGORY_KEYS, ...LEGACY_CATEGORY_KEYS];

/**
 * 분류 폴더 없이 운영사 바로 아래 올린 파일이 담기는 분류.
 * 옛 분류지만 자리는 지킨다 — 그런 파일이 사라지는 것보다 「기타」에 서 있는 편이 낫다.
 */
export const LOOSE_CATEGORY = 'etc';

export const GROUP_KEYS = GROUP_ORDER;
/** 경로 검사가 받아들이는 분류 — 옛 것도 있어야 이미 올라간 파일을 옮기고 지운다 */
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
