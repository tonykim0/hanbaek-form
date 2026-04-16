// 12개 분류 카테고리 (HANDOFF.md §4)
export type FileCategory =
  | '계약서'
  | '합의서'
  | '직인사용 동의서'
  | '행위신고 업무대행 동의서'
  | '전기차충전시설 설치신청서'
  | '개인정보 동의서'
  | '사전현장컨설팅 결과서'
  | '입주자대표회의 회의록'
  | '한전 전기요금 청구서'
  | '건축물대장'
  | '실사보고서'
  | '기타';

// 노션 select 옵션 (HANDOFF.md §6)
export type CPOName =
  | '플러그링크'
  | '대영채비'
  | '신세계아이앤씨'
  | '에버온'
  | '파킹클라우드'
  | '한화솔루션'
  | 'LG U+'
  | '현대엔지니어링'
  | '한솔엠에스'
  | 'SK일렉링크'
  | '나이스인프라';

export type SojaejiName =
  | '서울' | '경기' | '강원' | '인천' | '경북' | '대구' | '경남'
  | '울산' | '부산' | '광주' | '전남' | '전북' | '대전' | '세종'
  | '충남' | '충북' | '제주';

export type BuildingType = '공동주택' | '상업시설';

export type PowerInlet =
  | '모자분리 + 한전수전'
  | '한전수전'
  | '모자분리';

// Claude가 반환하는 각 파일의 분류 결과
export interface ClassifiedFileInfo {
  originalName: string;
  category: FileCategory;
  date: string; // YYYYMMDD
}

// Claude가 반환하는 전체 추출 결과
export interface ExtractedMetadata {
  현장명: string;
  주소: string | null;
  우편번호: string | null;
  CPO: CPOName[];
  계약대수: number | null;
  총주차면수: number | null;
  건축물유형: BuildingType | null;
  전력인입: PowerInlet | null;
  소재지: SojaejiName | null;
  현장담당자: string | null;
  현장연락처: string | null;
  설치위치: string | null;
  비고: string | null;
  files: ClassifiedFileInfo[];
  confidence: Record<string, number>;
}

// 표준 네이밍이 적용된 최종 파일 정보
export interface ClassifiedFile {
  originalName: string;
  category: FileCategory;
  date: string;
  standardName: string; // {현장명}_{카테고리}_{날짜}.pdf
  hash: string;         // SHA256 hex
}

// POST /api/intake 성공 응답
export interface IntakeSuccessResponse {
  success: true;
  intakeId: string;           // HBPI-XXXX
  notionUrl: string;
  classifiedFiles: ClassifiedFile[];
  warnings: string[];
}

// POST /api/intake 실패 응답
export interface IntakeErrorResponse {
  success: false;
  error: string;
  code: string;
}

export type IntakeResponse = IntakeSuccessResponse | IntakeErrorResponse;
