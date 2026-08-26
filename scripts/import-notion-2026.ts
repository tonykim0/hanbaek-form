/**
 * 노션 「26 전기차 계약/현장관리」 → 콘솔 DB 이관. (2026-08-23, 한백 확정 사항 반영)
 *
 *   npx tsx scripts/import-notion-2026.ts --snapshot <notion-26-sites.json>        드라이런(기본)
 *   npx tsx scripts/import-notion-2026.ts --snapshot <파일> --env .env.prod-db --wipe --write
 *
 * ★스냅샷 파일에서 읽는다 — 노션을 직접 부르지 않는다.★ 백업해 둔 것이 곧 이관본이라
 * 「백업과 이관이 다른 것을 봤다」가 원천적으로 안 생기고, 재실행도 같은 입력으로 돈다.
 *
 * 한백 확정 사항 (2026-08-23):
 *   - 관리번호는 새로 지정 (HB-2026-001부터, 노션 생성일 순). 노션 번호는 mgmtNo 에 남긴다.
 *   - 사업구분은 환경부·자체투자 둘뿐 (실데이터도 그 둘뿐임을 확인).
 *   - 신설·교체 매핑은 이관 뒤 한백이 검증한다 — 판정 불가는 비워 두고 리포트에 적는다.
 *   - 영업사·시공사 계정을 만든다. 초기 비밀번호 0000.
 *   - 정산관리(198건)는 이번에 옮기지 않는다.
 *
 * 멱등: mgmtNo(노션 번호)가 이미 있는 현장은 건너뛴다. 계정은 소속이 이미 있으면 건너뛴다.
 * --wipe: 시험 현장을 지운다 — projects(자식은 cascade) + tax_invoices·batch_finals
 *   (project FK 가 없어 cascade 가 못 지운다 — 남으면 이관된 실배치가 같은 키에 걸려
 *   「확정」으로 잠겨 보인다) + audit_log 의 현장 기록. 계정·단가·정산 규칙은 남긴다.
 *
 * 단가 지정: 화면과 같은 정본(lib/pricing-match.matchingRules)으로 후보를 좁히고,
 * 채널(양쪽 소속이 있으면 턴키)과 적용 시작(계약서수령일 이전 중 가장 늦은 반기)까지
 * 걸러 딱 하나 남을 때만 붙인다. 둘 이상이거나 없으면 비워 두고 리포트에 적는다 —
 * 케이스는 참조되면 불변이라, 자동 지정은 확실할 때만 한다.
 */
import { existsSync, readFileSync } from 'fs';
import { loadEnvFile } from '../lib/env-file';

const envAt = process.argv.indexOf('--env');
const ENV_FILE = envAt >= 0 ? process.argv[envAt + 1] : '.env.local';
if (!ENV_FILE || ENV_FILE.startsWith('--')) throw new Error('--env 뒤에 파일 이름이 없습니다.');
if (!existsSync(ENV_FILE)) throw new Error(`${ENV_FILE} 이 없습니다.`);
loadEnvFile(ENV_FILE);
// .env.prod-db 에는 DIRECT_URL 만 있다 — 스크립트는 세션 풀러(5432)로 붙어도 된다
if (!process.env.DATABASE_URL && process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

import { eq, isNotNull, sql } from 'drizzle-orm';
import { getDb } from '../lib/db/client';
import {
  auditLog, batchFinals, contractLines, pricingRules, projectNotes, projects, taxInvoices, users,
} from '../lib/db/schema';
import { hashPassword } from '../lib/auth/crypto';
import { normalizeOrg } from '../lib/roles';
import { matchingRules, startKey } from '../lib/pricing-match';
import type { BuildingType, CpoName, PowerType, PricingRule, ReplType } from '../types/project';
import { normalizeRepl } from '../types/project';

const WRITE = process.argv.includes('--write');
const WIPE = process.argv.includes('--wipe');
const snapAt = process.argv.indexOf('--snapshot');
const SNAPSHOT = snapAt >= 0 ? process.argv[snapAt + 1] : null;
if (!SNAPSHOT || !existsSync(SNAPSHOT)) throw new Error('--snapshot <notion-26-sites.json> 이 필요합니다.');

/* ── 노션 속성 읽기 ── */
type NotionPage = {
  id: string;
  created_time: string;
  last_edited_time: string;
  properties: Record<string, any>;
};
const sel = (p: any, k: string): string | null => p[k]?.select?.name ?? p[k]?.status?.name ?? null;
const num = (p: any, k: string): number | null => p[k]?.number ?? null;
const chk = (p: any, k: string): boolean => p[k]?.checkbox === true;
const date = (p: any, k: string): string | null => p[k]?.date?.start?.slice(0, 10) ?? null;
const txt = (p: any, k: string): string | null => {
  const v = p[k]; const arr = v?.[v?.type];
  const s = Array.isArray(arr) ? arr.map((x: any) => x.plain_text).join('') : '';
  return s.trim() || null;
};

/** 별칭 괄호를 뗀다 — 「제일전기통신(주원전설)」과 「제일전기통신」은 같은 회사다 */
const orgOf = (v: string | null): string | null => normalizeOrg(v?.replace(/\s*\([^)]*\)\s*$/, '') ?? null);

/* ── 계정 — 소속별 로그인 ID. 새 회사가 나오면 여기 한 줄을 늘린다 ── */
const ORG_LOGIN: Record<string, string> = {
  '에코일렉': 'ecoelec',
  '대상전력': 'daesang',
  '이에프이노베이션': 'efinno',
  '제일전기통신': 'jeil',
  '대광이브이': 'daekwang',
  '차저스랩': 'chargerslab',
  '네이비인프라': 'navy',
  '푸름': 'pureum',
  '채움에스앤시': 'chaeum',
  '유니온솔루션': 'union',
  '아현테크': 'ahyun',
};
const INITIAL_PASSWORD = '0000'; // 한백 지시 (2026-08-23) — 첫 로그인 뒤 각자 바꾼다

/**
 * 지금 만들 계정 — 이 4곳만 우선(한백 지시 2026-08-23). 나머지 소속은 현장에는
 * 그대로 들어가되(한백은 다 본다) 계정은 나중에 /admin/accounts 에서 만든다.
 */
const CREATE_NOW = new Set(['에코일렉', '대상전력', '이에프이노베이션', '제일전기통신']);

interface Row {
  notionNo: string;
  name: string;
  cpo: CpoName;
  salesOrg: string | null;
  gcOrg: string | null;
  addr: string | null;
  bldgType: BuildingType | null;
  parkTotal: number | null;
  mgr: string | null;
  tel: string | null;
  mail: string | null;
  powerType: PowerType | null;
  replType: ReplType | null;
  bizType: '환경부' | '자체투자';
  envQueueNo: string | null;
  preInstall: '없음' | '있음';
  preChecked: boolean;
  preNote: string | null;
  note: string | null;
  /** 노트를 마지막으로 만진 때(페이지 최종 수정) — 진행 메모의 시각으로 쓴다 */
  noteAt: Date;
  contractConfirmedAt: string | null;
  createdAt: Date;
  lastProgressAt: string;
  termYears: number;
  qty: number;
  issues: string[];
}

function transform(page: NotionPage): Row | { skip: string } {
  const p = page.properties;
  const issues: string[] = [];

  const name = txt(p, '현장명');
  const uid = p['한백_현장관리번호']?.unique_id?.number;
  if (!name || uid == null) return { skip: `현장명 또는 관리번호 없음 (${name ?? page.id})` };

  const cpo = sel(p, '운영사') as CpoName | null;
  if (!cpo) return { skip: `${name}: 운영사 없음` };

  const biz = sel(p, '사업구분');
  if (biz !== '환경부' && biz !== '자체투자') return { skip: `${name}: 사업구분 「${biz}」 — 환경부·자체투자만 이관` };

  // 신설·교체 — 사업구분과 조합해 콘솔 교체유형으로. 판정 불가는 비워 두고 한백이 검증한다.
  const repl = sel(p, '신설·교체 구분');
  let replType: ReplType | null = null;
  if (biz === '환경부' && (repl === '신규' || repl === null)) replType = '환경부 신규';
  else if (biz === '자체투자' && repl === '제자리교체') replType = '자체투자 (제자리교체)';
  // 안 가르는 운영사는 눕는다 — 노션의 「위치변경교체」가 그대로 들어와 갈린 라인이 됐었다
  else if (biz === '자체투자' && (repl === '신규' || repl === '위치변경교체')) replType = normalizeRepl(cpo, '자체투자 (신규위치)');
  else issues.push(`교체유형 판정 불가 (사업구분 ${biz} × ${repl ?? '없음'})`);

  const term = Number(sel(p, '계약기간'));
  const qty = num(p, '계약대수');
  if (!Number.isInteger(term) || term < 1) return { skip: `${name}: 계약기간 없음` };
  if (!qty || qty < 1) return { skip: `${name}: 계약대수 없음` };

  const contractAt = date(p, '계약서수령일');
  if (!contractAt) issues.push('계약서수령일 없음 — 계약 확인 전으로 둔다');
  // 접수일은 계약서수령일이다(한백 지시 2026-08-24) — 노션 페이지 생성일은 DB 를 꾸린
  // 날일 뿐이라 대시보드 월별 수주가 그 달로 뭉친다. 수령일이 없을 때만 생성일로.
  const created = contractAt
    ? new Date(`${contractAt}T00:00:00+09:00`)
    : new Date(page.created_time);
  // 정체일의 기준 — 노션 페이지를 마지막으로 만진 날이 실제 진척의 가장 가까운 근사치다
  // (생성일은 못 쓴다 — 페이지 대부분이 DB 를 꾸린 날 일괄 생성이라 전부 같은 날이 된다)
  const lastTouched = page.last_edited_time.slice(0, 10);

  const preNote = txt(p, '기설치 현황 조사');
  /*
   * 조사 노트가 「기설치 (이력) 없음」 단정이면 결과가 없음이다 — 텍스트 유무로만
   * 가르면 「없음」 조사 36건이 있음으로 뒤집힌다(2026-08-24 실사고, UPDATE 로 정정).
   * 장비는 있는데 보조금 이력만 없는 노트(…이력 없음 → 증빙 필요)는 있음이 맞다 —
   * 그런 노트는 단정 문장 하나가 아니라서 이 패턴에 안 걸린다.
   */
  const noneSurvey = preNote !== null
    && /^기설치\s*(이력\s*)?없음\.?$/.test(preNote.replace(/\s+/g, ' ').trim());
  const queueNo = num(p, '대기번호');

  return {
    notionNo: String(uid),
    name,
    cpo,
    salesOrg: orgOf(sel(p, '영업사')),
    gcOrg: orgOf(sel(p, '*시공사')),
    addr: txt(p, '현장주소'),
    bldgType: sel(p, '건축물 유형') as BuildingType | null,
    parkTotal: num(p, '총 주차면수'),
    mgr: txt(p, '현장담당자'),
    tel: p['현장연락처']?.phone_number ?? null,
    mail: p['현장이메일']?.email ?? null,
    powerType: sel(p, '수전방식') as PowerType | null,
    replType,
    bizType: biz,
    // 대기번호는 환경부 사업에만 뜻이 있다 — 콘솔이 자체투자의 값을 거부한다
    envQueueNo: biz === '환경부' && queueNo != null ? String(queueNo) : null,
    preInstall: preNote && !noneSurvey ? '있음' : '없음',
    preChecked: chk(p, '기설치 확인여부'),
    preNote,
    // 「현재상황」은 진행상황 메모다(한백 확인 2026-08-24) — 접수 메모(projects.note)가 아니다
    note: txt(p, '현재상황'),
    noteAt: new Date(page.last_edited_time),
    contractConfirmedAt: contractAt,
    createdAt: created,
    lastProgressAt: [contractAt, lastTouched].filter(Boolean).sort().pop() as string,
    termYears: term,
    qty,
    issues,
  };
}

/** 후보를 채널·적용 시작까지 걸러 딱 하나면 그 케이스 — 아니면 null */
function pickRule(row: Row, all: PricingRule[]): { rule: PricingRule | null; why: string } {
  const channel = row.salesOrg && row.gcOrg ? '턴키' : row.salesOrg ? '영업' : row.gcOrg ? '시공' : '턴키';
  const { exact } = matchingRules(
    { cpo: row.cpo, bizType: row.bizType, replType: row.replType, bldgType: row.bldgType },
    // 혼용(한전불입+모자분리)은 라인 축에 못 넣는다 — 라인은 한 수전이고, null 이면 그 축을 건너뛴다
    { termYears: row.termYears, powerType: row.powerType === '한전불입+모자분리' ? null : row.powerType, replType: row.replType },
    all
  );
  const byChannel = exact.filter((r) => r.channel === channel);
  if (byChannel.length === 0) return { rule: null, why: '맞는 케이스 없음' };
  if (byChannel.length === 1) return { rule: byChannel[0], why: '단일 후보' };
  // 개정이 겹치면 계약 시기의 단가 — 계약서수령일(없으면 접수일) 이전 중 가장 늦은 적용 시작
  const asOf = row.contractConfirmedAt ?? row.lastProgressAt;
  const applicable = byChannel
    .filter((r) => startKey(r) <= asOf)
    .sort((a, b) => startKey(a).localeCompare(startKey(b)));
  if (applicable.length > 0) return { rule: applicable[applicable.length - 1], why: '계약 시기 반기' };
  return { rule: null, why: `후보 ${byChannel.length}개 — 계약일보다 전부 늦음` };
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error(`DATABASE_URL/DIRECT_URL 이 없습니다 — ${ENV_FILE} 확인.`);
  console.log(`DB: ${new URL(url).host}  (${WRITE ? '★쓰기★' : '드라이런'}${WIPE ? ' + 시험 데이터 삭제' : ''})\n`);

  const pages = (JSON.parse(readFileSync(SNAPSHOT!, 'utf8')) as NotionPage[])
    .sort((a, b) => a.created_time.localeCompare(b.created_time));

  const db = getDb();
  const ruleRows = await db.select().from(pricingRules);
  const rules = ruleRows.map((r) => ({
    ...r,
    termYears: r.termYears as number[],
    bldgTypes: r.bldgTypes as BuildingType[],
  })) as unknown as PricingRule[];
  const defaultSettle = new Map(ruleRows.map((r) => [r.id, r.defaultSettlementRuleId]));
  const existing = await db.select({ mgmtNo: projects.mgmtNo, id: projects.id }).from(projects);
  const haveNo = new Set(existing.map((e) => e.mgmtNo).filter(Boolean));
  const userRows = await db.select({ id: users.id, org: users.org }).from(users);
  const haveOrg = new Set(userRows.map((u) => normalizeOrg(u.org)).filter(Boolean));
  const haveUserId = new Set(userRows.map((u) => u.id));

  /* ── 변환 ── */
  const rows: Row[] = [];
  const skipped: string[] = [];
  for (const page of pages) {
    const r = transform(page);
    if ('skip' in r) skipped.push(r.skip);
    else rows.push(r);
  }

  /* ── 계정 계획 ── */
  const salesOrgs = new Set(rows.map((r) => r.salesOrg).filter(Boolean) as string[]);
  const gcOrgs = new Set(rows.map((r) => r.gcOrg).filter(Boolean) as string[]);
  const accounts = [...new Set([...salesOrgs, ...gcOrgs])]
    .filter((org) => org !== '한백')
    .map((org) => ({
      org,
      id: ORG_LOGIN[org] ?? null,
      role: salesOrgs.has(org) && gcOrgs.has(org) ? 'salesCons' : salesOrgs.has(org) ? 'sales' : 'cons',
      exists: haveOrg.has(org),
      /** 이번에 안 만드는 소속 — 현장에는 들어가고 계정만 나중이다 */
      deferred: !CREATE_NOW.has(org),
    }));

  /* ── 단가 매칭 ── */
  const priced = rows.map((r) => ({ row: r, pick: pickRule(r, rules) }));

  /* ── 리포트 ── */
  console.log(`노션 ${pages.length}건 → 이관 대상 ${rows.length}건 · 건너뜀 ${skipped.length}건`);
  for (const s of skipped) console.log(`  [건너뜀] ${s}`);
  const dup = rows.filter((r) => haveNo.has(r.notionNo));
  if (dup.length) console.log(`  이미 있음(멱등 건너뜀): ${dup.length}건`);

  const byCpo = new Map<string, number>();
  rows.forEach((r) => byCpo.set(r.cpo, (byCpo.get(r.cpo) ?? 0) + 1));
  console.log('운영사별:', [...byCpo.entries()].map(([k, v]) => `${k} ${v}`).join(' · '));

  const matched = priced.filter((x) => x.pick.rule).length;
  console.log(`단가 자동 지정: ${matched}/${rows.length}건`);
  for (const { row, pick } of priced.filter((x) => !x.pick.rule)) {
    console.log(`  [단가 미지정] ${row.name} (${row.cpo} ${row.bizType} ${row.termYears}년 ${row.powerType ?? '수전?'}) — ${pick.why}`);
  }
  for (const r of rows.filter((x) => x.issues.length)) {
    for (const i of r.issues) console.log(`  [확인 필요] ${r.name}: ${i}`);
  }

  console.log('\n계정:');
  for (const a of accounts) {
    const mark = a.exists ? '있음  ' : a.deferred ? '나중에' : a.id ? '만든다' : '★ID 없음';
    console.log(`  ${mark} ${a.org} → ${a.id ?? '?'} (${a.role})`);
  }
  const noId = accounts.filter((a) => !a.exists && !a.deferred && !a.id);
  if (noId.length) throw new Error(`로그인 ID 미정 소속: ${noId.map((a) => a.org).join(', ')} — ORG_LOGIN 에 추가하세요.`);

  if (!WRITE) {
    console.log('\n드라이런 끝 — 반영하려면 --write.');
    return;
  }

  /* ── 쓰기 ── */
  if (WIPE) {
    const [pc] = await db.select({ n: sql<number>`count(*)::int` }).from(projects);
    const [tc] = await db.select({ n: sql<number>`count(*)::int` }).from(taxInvoices);
    const [bc] = await db.select({ n: sql<number>`count(*)::int` }).from(batchFinals);
    console.log(`\n시험 데이터 삭제: 현장 ${pc.n} · 세금계산서 ${tc.n} · 배치확정 ${bc.n}`);
    await db.delete(projects);            // 자식 7개 표는 cascade
    await db.delete(taxInvoices);         // project FK 없음 — 직접
    await db.delete(batchFinals);         // project FK 없음 — 직접
    await db.delete(auditLog).where(isNotNull(auditLog.projectId)); // 단가·규칙 이력은 남긴다
    haveNo.clear();
  }

  // 계정 — 초기 비밀번호는 전부 같아 해시를 한 번만 만든다
  const hash = await hashPassword(INITIAL_PASSWORD);
  let madeUsers = 0;
  for (const a of accounts) {
    if (a.exists || a.deferred || !a.id) continue;
    if (haveUserId.has(a.id)) { console.log(`  [계정 건너뜀] ${a.id} — 같은 ID 가 있으나 소속이 다름 (${a.org})`); continue; }
    await db.insert(users).values({ id: a.id, name: a.org, role: a.role, org: a.org, passwordHash: hash });
    madeUsers += 1;
  }

  // 현장 번호 — 남아 있는 것 다음부터 (wipe 뒤에는 001부터)
  const [mx] = await db.select({
    n: sql<number>`coalesce(max(nullif(split_part(id, '-', 3), '')::int), 0)::int`,
  }).from(projects).where(sql`id like 'HB-2026-%'`);
  let seq = mx.n;
  const today = new Date().toISOString().slice(0, 10);

  let made = 0;
  for (const { row, pick } of priced) {
    if (haveNo.has(row.notionNo)) continue;
    seq += 1;
    const id = `HB-2026-${String(seq).padStart(3, '0')}`;
    await db.transaction(async (tx) => {
      await tx.insert(projects).values({
        id,
        mgmtNo: row.notionNo,               // 노션 번호 — 재실행 멱등의 열쇠이자 추적용
        cpo: row.cpo,
        salesOrg: row.salesOrg,
        gcOrg: row.gcOrg,
        name: row.name,
        addr: row.addr,
        bldgType: row.bldgType,
        contractParty: null,                 // 노션에 없던 필드 — 콘솔에서 채운다
        parkTotal: row.parkTotal,
        mgr: row.mgr,
        tel: row.tel,
        mail: row.mail,
        preInstall: row.preInstall,
        preChecked: row.preChecked,
        preNote: row.preNote,
        powerType: row.powerType,
        replType: row.replType,
        bizType: row.bizType,
        envQueueNo: row.envQueueNo,
        bizYear: 2026,
        note: null, // 「현재상황」은 아래 진행 메모로 — 접수 메모 칸이 아니다

        contractConfirmedAt: row.contractConfirmedAt,
        settlementRuleId: pick.rule ? defaultSettle.get(pick.rule.id) ?? null : null,
        settlementAppliedAt: pick.rule && defaultSettle.get(pick.rule.id) ? today : null,
        court: '한백',
        lastProgressAt: row.lastProgressAt,
        createdAt: row.createdAt,
      });
      await tx.insert(contractLines).values({
        id: crypto.randomUUID(),
        projectId: id,
        termYears: row.termYears,
        qty: row.qty,
        powerType: row.powerType,
        replType: row.replType,
        memo: null,
        pricingRuleId: pick.rule?.id ?? null,
        pricedAt: pick.rule ? today : null,
      });
      if (row.note) {
        await tx.insert(projectNotes).values({
          id: crypto.randomUUID(), projectId: id, author: '한백', body: row.note, at: row.noteAt,
        });
      }
    });
    made += 1;
  }

  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    projectId: null,
    actor: '노션 이관 스크립트',
    action: '노션 26년 계약/현장관리 이관',
    newValue: `현장 ${made}건 · 계정 ${madeUsers}건 · 단가 지정 ${matched}건${WIPE ? ' · 시험 데이터 삭제' : ''}`,
  });

  /* ── 검증 ── */
  const [after] = await db.select({ n: sql<number>`count(*)::int` }).from(projects);
  const [lines] = await db.select({ n: sql<number>`count(*)::int` }).from(contractLines);
  const [pricedN] = await db.select({ n: sql<number>`count(*)::int` })
    .from(contractLines).where(isNotNull(contractLines.pricingRuleId));
  console.log(`\n완료: 현장 ${made}건 넣음 (DB 현장 ${after.n} · 라인 ${lines.n} · 단가 지정 ${pricedN.n}) · 계정 ${madeUsers}개`);
  if (after.n !== rows.length && WIPE) console.log(`★불일치★ 이관 대상 ${rows.length} ≠ DB ${after.n} — 위 건너뜀 목록과 대조하세요.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
