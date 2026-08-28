/**
 * 자료실 파일 정리 — 이름 규칙을 적용하고 새 분류로 옮긴다.
 *
 *   npx tsx scripts/tidy-materials.ts            무엇이 어떻게 바뀌는지만 본다
 *   npx tsx scripts/tidy-materials.ts --write    실제로 옮긴다
 *
 * ★이름 규칙★ (2026-08-28)
 *   [NN.] 자료명[_YYMMDD].확장자
 *
 *   1. 운영사 이름을 넣지 않는다 — 폴더가 이미 운영사다(materials/<운영사>/<분류>/).
 *      제조사·제품명(현대케피코 · CEC-2333HR1)은 정보이므로 남긴다.
 *   2. 분류도 넣지 않는다 — 폴더가 말한다.
 *   3. 단어는 공백으로 가른다. 「_」는 날짜 앞에만 쓴다.
 *   4. 문서 일자를 아는 것은 맨 뒤에 `_YYMMDD` — 개정이 쌓이는 자료(시방서·제안서·
 *      보험증권)는 날짜가 곧 판이다. 연도만 아는 것은 「2026년」으로 적는다.
 *   5. 번호는 순서가 뜻을 갖는 묶음에만 「01. 」「02. 」 — 분류 안에서 다시 매긴다.
 *      원본 번호는 중복이 있었다(SK 인증서에 「3.」이 둘).
 *   6. 괄호·대괄호를 쓰지 않는다 — 「[SKEL]」「(대외)」「(1)」. 필요한 한정어는 그냥 붙인다.
 *   7. 내려받다 붙은 중복 표시(「 (1)」「 복사본」)와 이중 공백을 지운다.
 *
 * 화면에 보이는 자료명은 이 파일명에서 유도된다(lib/materials-meta parseDisplayTitle) —
 * 번호와 날짜는 파서가 떼어 따로 보여주므로, 이름에 남는 것은 「무엇인가」뿐이다.
 */
import { copy, del, list } from '@vercel/blob';
import { loadEnvFile } from '../lib/env-file';

loadEnvFile('.env.prod-db');
const token = process.env.BLOB_TOKEN_FOR_IMPORT;
if (!token) throw new Error('BLOB_TOKEN_FOR_IMPORT 이 없습니다 — .env.prod-db 확인.');

const WRITE = process.argv.includes('--write');

/** 옮길 자리 — [지금 경로] → [새 분류, 새 파일명] */
const PLAN: Record<string, [category: string, fileName: string]> = {
  // ── 플러그링크 ────────────────────────────────────────────────
  'materials/pluglink/sales/[플러그링크] 브로슈어_에바3.pdf':
    ['sales', '브로슈어 에바3.pdf'],
  'materials/pluglink/sales/[플러그링크] 영업브로셔_260330.pdf':
    ['sales', '영업 브로슈어_260330.pdf'],
  'materials/pluglink/sales/플러그링크_CGL_가입증명서_2025.pdf':
    ['vendor', 'CGL 가입증명서 2025년.pdf'],

  // ── 현대엔지니어링 ────────────────────────────────────────────
  'materials/hec/sales/1. 현대케피코_카탈로그.pdf':
    ['sales', '현대케피코 카탈로그.pdf'],
  'materials/hec/sales/260317_현대엔지니어링 브로슈어 [아파트영업용]_최종.pdf':
    ['sales', '브로슈어 아파트영업용_260317.pdf'],
  'materials/hec/sales/20260325_현대엔지니어링_완속사업제안서.pdf':
    ['sales', '완속사업 제안서_260325.pdf'],
  'materials/hec/sales/2. 현대케피코_완속충전기 사양서_BAS1007.D1.1.pdf':
    ['permit', '01. 현대케피코 완속충전기 사양서 BAS1007.D1.1.pdf'],
  'materials/hec/sales/3. 현대케피코_KC인증서_BAS1007.D1.1.pdf':
    ['permit', '02. 현대케피코 KC인증서 BAS1007.D1.1.pdf'],
  'materials/hec/sales/4. 현대케피코_형식승인서_BAS1007.D1.1.pdf':
    ['permit', '03. 현대케피코 형식승인서 BAS1007.D1.1.pdf'],
  'materials/hec/sales/사업자등록증_현대엔지니어링(1018166755).pdf':
    ['corp', '사업자등록증.pdf'],
  'materials/hec/sales/현대엔지니어링_사고배상책임보험(송부용).pdf':
    ['vendor', '사고배상책임보험 증권.pdf'],

  // ── 나이스인프라 ──────────────────────────────────────────────
  'materials/nice/sales/NICE인프라(주)_나이스차저 완속충전기 제안서_공동주택_260801.pdf':
    ['sales', '나이스차저 완속충전기 제안서 공동주택_260801.pdf'],
  'materials/nice/sales/NICE인프라(주) 26년도 전기차충전기 사고배상책임보험 증권(대외).pdf':
    ['vendor', '사고배상책임보험 증권 2026년.pdf'],
  'materials/nice/sales/나이스인프라_사업자등록증.pdf':
    ['corp', '사업자등록증.pdf'],
  'materials/nice/spec/26년 나이스차저 공사 업무 메뉴얼_260804.pdf':
    ['install', '나이스차저 공사 업무 매뉴얼_260804.pdf'],

  // ── SK일렉링크 ────────────────────────────────────────────────
  'materials/sk/sales/완속충전기 설치 및 운영 표준 제안서_SK일렉링크_v1.9.pdf':
    ['sales', '완속충전기 설치 및 운영 표준 제안서 v1.9.pdf'],
  'materials/sk/sales/완속충전기 설치 및 운영 표준 제안서_SK일렉링크_v1.9.pptx':
    ['sales', '완속충전기 설치 및 운영 표준 제안서 v1.9.pptx'],
  'materials/sk/sales/SK일렉링크_사업자등록증.pdf':
    ['corp', '사업자등록증.pdf'],
  'materials/sk/sales/SK일렉링크 영업배상 가입증명서.pdf':
    ['vendor', '영업배상 가입증명서.pdf'],
  'materials/sk/sales/SK일렉링크 전기차충전시설  책임배상 가입증명서.pdf':
    ['vendor', '전기차충전시설 책임배상 가입증명서.pdf'],
  'materials/sk/sales/1.1. 충전기 사양서_현대케피코 스마트제어 완속충전기(7kW) (BAS1007.D1.1) - LCD RFID (1).pdf':
    ['permit', '01. 충전기 사양서 현대케피코 스마트제어 완속충전기 7kW BAS1007.D1.1 LCD RFID.pdf'],
  'materials/sk/sales/CEC-2333HR1 사양서.pdf':
    ['permit', '02. 충전기 사양서 CEC-2333HR1.pdf'],
  'materials/sk/sales/2.전기안전인증서_CEC-2333HR1.pdf':
    ['permit', '03. 전기안전인증서 CEC-2333HR1.pdf'],
  'materials/sk/sales/3. KC인증서(XH070820-25003B)_현대케피코 스마트제어 완속충전기(7kW) (BAS1007.D1.1) - LCD RFID (1).pdf':
    ['permit', '04. KC인증서 XH070820-25003B 현대케피코 스마트제어 완속충전기 7kW.pdf'],
  'materials/sk/sales/3. 시험성적서_CEC-2333HR1(스마트제어).pdf':
    ['permit', '05. 시험성적서 CEC-2333HR1 스마트제어.pdf'],
  'materials/sk/sales/9. 시험성적서_스마트제어_GT2025-12920_7K-1A-KR_BAS1007.D1.1 (1).pdf':
    ['permit', '06. 시험성적서 스마트제어 GT2025-12920 7K-1A-KR BAS1007.D1.1.pdf'],
  'materials/sk/spec/붙임2. 착공전서류(시공관리책임자, TBM, 상시체크리스트).zip':
    ['safety', '착공전서류 시공관리책임자 TBM 상시체크리스트.zip'],
  'materials/sk/spec/붙임3. 착공후 준공서류.zip':
    ['install', '착공후 준공서류.zip'],
  'materials/sk/spec/[SKEL] 완속충전기 설치 시방서_rev.11_26.01.01.pdf':
    ['install', '완속충전기 설치 시방서 rev.11_260101.pdf'],
};

async function main() {
  const { blobs } = await list({ prefix: 'materials/', limit: 1000, token });
  const current = blobs.map((b) => ({ pathname: b.pathname.normalize('NFC'), url: b.url }));
  console.log(`프로덕션 자료 ${current.length}건\n`);

  const planned = new Set(Object.keys(PLAN));
  const seen = new Set<string>();
  const moves: Array<{ from: string; to: string; url: string }> = [];

  for (const b of current) {
    seen.add(b.pathname);
    const hit = PLAN[b.pathname];
    if (!hit) {
      console.log(`  [그대로] ${b.pathname}`);
      continue;
    }
    const [group] = b.pathname.slice('materials/'.length).split('/');
    const to = `materials/${group}/${hit[0]}/${hit[1]}`;
    if (to === b.pathname) {
      console.log(`  [그대로] ${b.pathname}`);
      continue;
    }
    moves.push({ from: b.pathname, to, url: b.url });
  }

  const missing = [...planned].filter((p) => !seen.has(p));
  if (missing.length > 0) {
    console.log('\n★계획에 있는데 프로덕션에 없는 파일★ — 이름이 다르다는 뜻이다:');
    for (const m of missing) console.log(`  ${m}`);
  }

  console.log(`\n옮길 것 ${moves.length}건${WRITE ? ' ★쓰기★' : ' (드라이런)'}\n`);
  for (const m of moves) {
    console.log(`  ${m.from}\n→ ${m.to}\n`);
  }

  if (!WRITE) {
    console.log('실제로 옮기려면 --write 를 붙인다.');
    return;
  }

  // 같은 이름이 이미 있으면 덮어쓰지 않는다 — 사업자등록증처럼 이름이 겹칠 자리가 있다
  const targets = new Set(current.map((b) => b.pathname));
  for (const m of moves) {
    if (targets.has(m.to)) {
      console.log(`  [건너뜀] 같은 자리에 이미 있다 — ${m.to}`);
      continue;
    }
    await copy(m.url, m.to, { access: 'public', addRandomSuffix: false, token });
    await del(m.url, { token });
    targets.add(m.to);
    targets.delete(m.from);
    console.log(`  [옮김] ${m.to}`);
  }
  console.log('\n끝.');
}

main();
