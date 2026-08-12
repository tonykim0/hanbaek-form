/**
 * 협력사 스캔본(PDF) → 입력폼 값 역추출 프롬프트.
 *
 * lib/prompts.ts(접수용 분류 프롬프트)와 목적이 다릅니다.
 *   · prompts.ts       — 서류를 종류별로 분류해 노션에 정리
 *   · prompts-import.ts — 서류에 적힌 값을 입력폼 필드로 되돌림
 *
 * 스캔본은 손글씨·도장·체크표시가 섞여 있고, 협력사가 잘못 채운 칸도 많습니다.
 * 그래서 "읽은 값"과 "사람이 확인해야 하는 지점(issues)"을 함께 받습니다.
 */

/** 폼 필드 → 스캔본에서 찾을 위치. 프롬프트 본문에 표로 들어갑니다. */
const FIELD_GUIDE: Array<[field: string, where: string]> = [
  ['custName', '계약서 「부지제공자/서비스이용자」 상호 · 별지5호 「신청자」 · 별지7호 1번 「성명」. 사업자등록증상 법인명(예: OO아파트 입주자대표회의)'],
  ['custBizId', '계약서·별지5호의 사업자등록번호 또는 공동주택 고유번호. 숫자 10자리'],
  ['custAddr', '계약서 부지제공자 「주소」 또는 별지7호 1번 신청자 정보 「주소」 = 사업자등록증 주소. 지번주소·상세주소여도 적힌 그대로'],
  ['custTel', '계약서 전화번호 · 별지5호 「연락처」 (관리사무소 전화번호)'],
  ['custEmail', '계약서 부지제공자 이메일. 영업자·CPO 이메일이 아니라 고객(현장) 이메일'],
  ['custRepresentative', '사업자등록증상 대표자 · 직인사용 동의서 「대표자」 (예: 관리소장 이름)'],
  ['siteManager', '현장 담당자 직함/이름 (예: 관리소장). 없으면 ""'],
  ['installAddr', '별지5호 「도로명 주소」 · 별지7호 4번 「주소」 = 건축물대장 주소. 계약서 「설치장소」와 같은 값'],
  ['installQty', '설치 충전기 수량. 별지5호 「희망수량 7kW 이상~11kW 미만 (  )기」 = 별지7호 2번 같은 칸. 숫자만'],
  ['installQty11to30', '별지5호·별지7호 「11kW 이상~30kW 미만 (  )기」 수량. 숫자만. 비어 있으면 ""'],
  ['contractTerm', '계약서 계약기간. 7년 → "7", 10년 → "10". 84개월 → "7", 120개월 → "10"'],
  ['contractYear/Month/Day', '계약일(= 조사일). 계약서 체결일 또는 별지5호 신청일 또는 별지7호 7번 조사일. 각각 숫자 문자열 (월·일은 앞의 0 없이)'],
  ['installDetailLocation', 'NICE 계약서 제1조 설치위치의 「상세위치 : …」 부분 (예: 지하 1층 주차장). 없으면 ""'],
  ['salesCompany/Name/Tel', '별지5호 「모집대행사」 표의 회사명 · 담당자명 · 연락처'],
  ['surveyorCompany/Name/Tel', '별지7호 7번 「조사자」 표의 상호 · 성명 · 연락처'],
  ['parkingLotCount', '별지5호 「보유 주차면수」 = 별지7호 3번 「주차면 수」. 숫자만'],
  ['siteCategory', '별지5호 「설치 희망지」와 별지7호 4번 「장소」의 체크. 공동주택→"apartment", 사업장→"business", 소상공인→"small_business", 기타→"etc". 건물형태와 혼동하지 마세요'],
  ['evCount', '전기차 수량 공문 등의 전기차 등록대수. 없으면 ""'],
  ['siteTotalSlow/siteTotalFast', '별지2 사전 체크리스트 헤더 「충전시설 설치대수」의 완속/급속 기수. 없으면 ""'],
];

/** 별지7호 체크박스 → 폼 필드. 체크 판독 규칙과 함께 넣습니다. */
const CHECKBOX_GUIDE: Array<[label: string, mapping: string]> = [
  ['건물형태', '단독주택→"danok" / 아파트→"apartment" / 연립주택→"yeonlip" / 상가→"sangga" / 기타→"etc_custom"'],
  ['설치위치', '실내,지하→installLocIndoor / 실외, 노상→installLocOutdoor (둘 다 체크 가능)'],
  ['소유여부', '소유→"own" / 임대→"rent"'],
  ['소유주와의 관계', '본인→"self" / 가족→"family" / 지인→"friend" / 직원→"employee" / 무관→"none"'],
  ['전력인입', '모자분할→powerMoja / 한전불입→powerHanjeon (둘 다 체크 가능)'],
  ['설치타입', '벽부형→installTypeWall / 스탠드→installTypeStand (둘 다 체크 가능)'],
  ['6번 중복설치', '급속충전기→dupFast+dupFastQty / 완속충전기→dupSlow+dupSlowQty / 전력분배형→dupDist+dupDistQty / 과금형콘센트→dupOutlet+dupOutletQty / 키오스크→dupKiosk. 「해당사항 없음」이 체크면 전부 false'],
];

export function buildFormImportPrompt(options: {
  fileName: string;
  pageCount: number;
  /** 사용자가 어느 CPO 화면에서 올렸는지 — 판독 힌트로만 씁니다 */
  cpoHint?: string;
}): string {
  const { fileName, pageCount, cpoHint } = options;

  return `당신은 한백 EV 충전 인프라 사업의 계약서류 판독 전문가입니다.
첨부된 PDF는 협력사가 계약서류 양식을 채워 출력·스캔해 보낸 것입니다.
이 서류에 적힌 값을 읽어, 우리 입력폼을 다시 채울 수 있는 JSON으로 되돌려주세요.

## 입력
파일: ${fileName} (${pageCount}페이지)${cpoHint ? `\n운영사(CPO): ${cpoHint} — 판독 힌트로만 쓰고, 서류 내용과 다르면 서류를 따르세요.` : ''}

## 서류 구성 (스캔본에 일부만 있을 수 있음)
- 계약서 / 합의서 — 상호·사업자등록번호·주소·연락처·이메일·설치장소·수량·계약기간·계약일
- 【별지 제5호 서식】전기자동차 완속충전시설 설치 신청서 — 주차면수·도로명주소·모집대행사·희망수량
- 개인정보 수집·이용 동의서, 직인사용 동의서 — 상호·주소·대표자
- 【별지 제7호 서식】사전 현장 컨설팅 결과서 — 설치환경 체크박스·조사자·조사일  ★가장 중요
- [별지 1] 사진대지 / [별지 2] 사전 체크리스트

## 판독 원칙 (가장 중요)
1. **적혀 있는 것만 읽으세요.** 비어 있거나 「OO」·「(   )」 같은 미기입 자리표시자, 판독 불가는
   반드시 빈 문자열 ""로 두세요 (체크박스류는 false).
   비슷한 값으로 추측해서 채우지 마세요 — 틀린 값이 들어가면 빈칸보다 위험합니다.
2. **체크박스는 칠해진 것만 체크로 봅니다.** ■ ▣ ☑ ✔ ● 또는 손으로 칠하거나 O·V 표시한 칸 → true.
   ☐ □ 빈 사각형 → false. 인쇄 얼룩·접힘·스캔 노이즈는 체크가 아닙니다.
   애매하면 그 필드의 confidence를 0.5 이하로 낮추고 issues에 적으세요.
3. **손글씨를 우선합니다.** 인쇄된 기본값 위에 손으로 고쳐 적었으면 손글씨 값이 맞습니다.
4. **같은 값이 여러 서류에 나오면 대조하세요.** 예: 설치수량은 별지5호와 별지7호에 각각 있습니다.
   서로 다르면 더 신뢰할 수 있는 쪽(원본 계약서 > 별지5호 > 별지7호)을 쓰고, 반드시 issues에 남기세요.

## 필드별 판독 위치
${FIELD_GUIDE.map(([f, w]) => `- **${f}** — ${w}`).join('\n')}

## 별지7호 설치환경 체크박스 매핑
${CHECKBOX_GUIDE.map(([l, m]) => `- **${l}** — ${m}`).join('\n')}

## 값 정규화 규칙
- 전화번호: 하이픈 포함 (예: "062-954-1122", "010-1234-5678"). 지역번호가 없으면 적힌 그대로.
- 사업자등록번호: 숫자 10자리만 (하이픈 없이, 예: "4108132391"). 10자리가 아니면 "" + issues.
- 수량·주차면수·연월일: 숫자만 담은 문자열 (예: "7", "545", "2026", "4", "9"). 「7기」→"7", 「545면」→"545".
- 월·일은 앞에 0을 붙이지 마세요 ("04" ❌ → "4" ⭕).
- 주소: 서류에 적힌 그대로. 임의로 도로명주소로 바꾸거나 상세주소를 떼지 마세요.
- siteCategory(장소)와 buildingType(건물형태)은 별개의 체크 항목이므로 서로 추정하지 말고 각각 판독하세요.
- businessType: 별지5호 설치신청서가 서류에 있으면 "subsidy", 보조금 언급이 없는 순수 임대·운영 계약이면 "invest". 판단 불가면 "".
- buildingType이 "etc_*" 계열이면 buildingTypeEtc에 실제 시설명을 넣으세요 (예: "오피스텔", "지식산업센터", "관공서", "대학교").
  오피스텔→"etc_officetel", 지식산업센터→"etc_knowledge", 관공서→"etc_government", 그 외→"etc_custom".

## issues 에 반드시 적을 것 (협력사 오기입 잡아내는 것이 이 작업의 목적입니다)
- 서류 간 값 불일치 (설치수량·주차면수·주소·상호·날짜 등)
- 핵심 칸이 비어 있음 (법인명·사업자등록번호·주소·연락처·설치장소·설치수량·주차면수)
- 사업자등록번호가 10자리가 아님
- 라디오성 항목(건물형태·소유여부·소유주와의 관계)에 체크가 없거나 2개 이상 체크됨
- 「해당사항 없음」과 개별 중복설치 항목이 같이 체크됨
- 설치장소가 도로명주소로 보이지 않음
- 체크 판독이 애매한 칸
각 항목은 "무엇이 / 어디서 / 어떻게" 가 보이도록 한 문장으로 쓰세요.
예: "설치수량 불일치 — 별지5호는 7기, 별지7호는 5기로 적혀 있습니다 (별지5호 값을 사용)."
문제가 없으면 빈 배열 []을 주세요.

## 출력 형식
JSON 하나만 출력하세요. 마크다운 코드블록·설명문 없이 순수 JSON만.
아래 모든 키를 빠짐없이 포함하고, 읽지 못한 값은 빈 문자열 ""(체크박스류는 false)로 두세요.

{
  "detectedCpo": "현대엔지니어링 | 나이스인프라 | SK일렉링크 | 플러그링크 | \"\"(판단 불가)",
  "detectedDocs": [
    { "name": "계약서", "pages": [1, 2, 3] },
    { "name": "별지5호 설치신청서", "pages": [8] },
    { "name": "별지7호 사전현장컨설팅 결과서", "pages": [10] }
  ],
  "fields": {
    "businessType": "subsidy",
    "custName": "운암포레스힐2 입주자대표회의",
    "custBizId": "4108132391",
    "custAddr": "광주광역시 북구 대자실로 22",
    "custTel": "062-954-1122",
    "custEmail": "manager@example.com",
    "custRepresentative": "이명주",
    "siteManager": "관리소장",
    "installAddr": "광주광역시 북구 대자실로 22",
    "installQty": "7",
    "installQty11to30": "",
    "contractTerm": "7",
    "contractYear": "2026",
    "contractMonth": "4",
    "contractDay": "9",
    "installDetailLocation": "",
    "salesCompany": "한비",
    "salesName": "김종혁",
    "salesTel": "010-3627-7047",
    "surveyorCompany": "한백",
    "surveyorName": "김종혁",
    "surveyorTel": "010-3627-7047",
    "parkingLotCount": "545",
    "siteCategory": "apartment",
    "buildingType": "apartment",
    "buildingTypeEtc": "",
    "installLocIndoor": true,
    "installLocOutdoor": false,
    "ownership": "own",
    "ownerRelation": "none",
    "powerMoja": true,
    "powerHanjeon": false,
    "installTypeWall": true,
    "installTypeStand": false,
    "dupFast": false,
    "dupFastQty": "",
    "dupSlow": false,
    "dupSlowQty": "",
    "dupDist": false,
    "dupDistQty": "",
    "dupOutlet": false,
    "dupOutletQty": "",
    "dupKiosk": false,
    "evCount": "",
    "siteTotalSlow": "",
    "siteTotalFast": ""
  },
  "confidence": [
    { "field": "custName", "score": 0.97 },
    { "field": "installQty", "score": 0.6 },
    { "field": "parkingLotCount", "score": 0.95 },
    { "field": "buildingType", "score": 0.9 }
  ],
  "issues": [
    "설치수량 불일치 — 별지5호는 7기, 별지7호는 5기로 적혀 있습니다 (별지5호 값을 사용).",
    "별지7호 소유주와의 관계에 체크가 없습니다."
  ]
}

confidence는 판독한 필드마다 { "field": 필드명, "score": 0~1 } 형태로 넣으세요.
스캔이 흐리거나 손글씨가 불분명하면 score를 낮게 주세요. 값이 ""인 필드는 넣지 않아도 됩니다.`;
}
