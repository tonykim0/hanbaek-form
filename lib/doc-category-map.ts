/**
 * AI 분류 카테고리(사람이 읽는 이름) → 서류 칸(kind) 매핑.
 *
 * 두 목록이 1:1 이 아니다. 여러 카테고리가 한 칸으로 모이는 경우가 있다:
 *   - 입주자대표회의 회의록 · 관리단 회의록 → minutes  (계약주체에 따라 종류가 갈릴 뿐 같은 칸)
 *   - 사업자등록증 · 고유번호증           → bizreg    (비사업자 단체는 고유번호증을 낸다)
 *   - 건축물대장 · K-apt 스크린샷          → bldgreg   (K-apt 는 주차면수 보완자료로 함께 보관)
 *
 * Record<FileCategory, …> 로 선언했으므로 카테고리를 추가하면 여기서 컴파일이 깨진다.
 * 매핑을 빠뜨린 채 배포되어 서류가 조용히 사라지는 것을 막는 장치다.
 */
import type { ContractParty, PreInstall } from '@/types/project';
import type { ClassifiedFileInfo, FileCategory } from '@/types/intake';

/** null = 서류 칸이 없는 카테고리. 지금은 전부 칸이 있다(기타 칸을 만들었다). */
export const CATEGORY_TO_KIND: Record<FileCategory, string | null> = {
  '계약서': 'contract',
  '합의서': 'agreement',
  '직인사용 동의서': 'sealuse',
  '개인정보 동의서': 'privacy',
  '전기차충전시설 설치신청서': 'apply',
  '사전현장컨설팅 결과서': 'consult',
  '사진대지': 'survey',
  '입주자대표회의 회의록': 'minutes',
  '관리단 회의록': 'minutes',
  '한전 전기요금 청구서': 'kepcobill',
  '건축물대장': 'bldgreg',
  'K-apt 스크린샷': 'bldgreg',
  '사업자등록증': 'bizreg',
  '고유번호증': 'bizreg',
  '실사보고서': 'survey',
  '기설치 충전기 설치이력': 'legacylog',
  '기설치 증빙자료': 'legacyev',
  '별지2 사전체크리스트': 'checklist2',
  '설치승인서': 'approval',
  '기타': 'etc',
};

export function kindOfCategory(category: FileCategory): string | null {
  return CATEGORY_TO_KIND[category] ?? null;
}

/**
 * 회의록 종류로 계약주체를 알아낸다.
 *
 * AI 는 계약주체를 따로 추출하지 않지만 회의록을 두 카테고리로 갈라 분류한다.
 * 그 구분이 곧 계약주체다 — 건축물유형으로 추정하는 것(resolveParty)보다 정확하다.
 * 건설사 계약은 회의록이 없어서 이 방법으로 알 수 없고, 그때는 null 이다.
 */
export function partyFromCategories(categories: FileCategory[]): ContractParty | null {
  if (categories.includes('입주자대표회의 회의록')) return '입주자대표회의';
  if (categories.includes('관리단 회의록')) return '관리단';
  return null;
}

/**
 * 기설치 여부를 서류로 추정한다.
 *
 * 「기설치 증빙자료」가 올라왔으면 기존 충전기가 있는 현장이다.
 * 설치이력만 있으면 그 안에 '없음'이 적혀 있을 수도 있어 단정할 수 없다 —
 * 파일 내용을 읽지 않는 한 알 수 없으므로 null 을 준다(모르겠음).
 * 현장에서 조사해 정하는 값이고, 그 자리는 기설치 조사 구역이다.
 */
export function preInstallFromCategories(categories: FileCategory[]): PreInstall | null {
  return categories.includes('기설치 증빙자료') ? '있음' : null;
}

/**
 * 엑셀 두 종을 파일명으로 가른다.
 *
 * 파이프라인은 PDF 만 AI 에 넘긴다(비용·토큰). 엑셀은 확장자만 보고 카테고리를 정해 왔는데,
 * .xlsx 필수 서류가 둘이라(실사보고서 · 기설치 충전기 설치이력) 둘을 같이 올리면
 * 하나가 사라졌다. 파일명으로 가른다 — 둘 다 한백이 배포한 서식이라 이름이 예측 가능하다.
 *
 * 애매하면 실사보고서로 둔다(종전 동작). 잘못 들어가도 한백이 검수에서 반려하면 되지만,
 * 칸이 비면 필수 미충족으로 접수가 영구히 막힌다 — 덜 나쁜 쪽으로 기울인다.
 */
export function excelCategory(fileName: string): FileCategory {
  const n = fileName.normalize('NFC').toLowerCase();
  if (/설치이력|기설치|이력서?\b|history/.test(n)) return '기설치 충전기 설치이력';
  return '실사보고서';
}

/** 자동분류가 절대 채울 수 없는 칸 — 화면에서 안내가 필요하다 */
export function unmatchedKinds(infos: ClassifiedFileInfo[]): string[] {
  const filled = new Set(
    infos.map((i) => kindOfCategory(i.category)).filter((k): k is string => k !== null)
  );
  return Object.values(CATEGORY_TO_KIND)
    .filter((k): k is string => k !== null)
    .filter((k, i, arr) => arr.indexOf(k) === i)
    .filter((k) => !filled.has(k));
}
