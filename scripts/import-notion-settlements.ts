/**
 * 노션 「26 정산관리」 → 콘솔 지급 원장 (이관).
 *
 *   npx tsx scripts/import-notion-settlements.ts \
 *     --settlements ~/hanbaek-backups/20260827/notion-26-settlements.json \
 *     --sites       ~/hanbaek-backups/20260826/notion-26-sites.json \
 *     [--env .env.prod-db] [--write]
 *
 * 기본은 드라이런이다 — 무엇이 몇 건 들어갈지만 적고 아무것도 쓰지 않는다. --write 를
 * 붙여야 실제로 넣는다.
 *
 * ★무엇을 옮기는가★
 *   영업비 1차 지급일 + 금액 → payout_entries (영업비 · 1차)
 *   시공비 1차 지급일 + 금액 → payout_entries (시공비 · 1차)
 *   비고                    → settlements.pay_note
 *
 * 2차는 노션에 지급일이 하나도 없다(아직 안 나갔다). 기성 수금(회수 체크·회수일)도
 * 노션이 통째로 비어 있어 옮길 것이 없다 — 콘솔의 「받는 돈」은 이관 뒤에도 0 이다.
 * 그 사실을 여기 적어 둔다: 다음 사람이 「수금이 왜 안 들어왔지」를 다시 뒤지지 않도록.
 *
 * ★붙이는 열쇠★ 정산 행의 「연결DB」 → 노션 현장 페이지 id → 그 현장의 노션 번호 →
 * 콘솔 projects.mgmt_no. 26년 현장 이관이 노션 번호를 mgmt_no 에 남겨 둔 덕이다.
 *
 * ★멱등★ 원장 행 id 를 `notion-{정산번호}-{구분}-{명목}` 으로 만든다. 다시 돌려도
 * 같은 id 라 덮어쓰기(onConflictDoUpdate)만 일어나고 같은 지급이 두 번 쌓이지 않는다.
 */
import { readFileSync } from 'fs';
import { loadEnvFile } from '../lib/env-file';

const args = process.argv.slice(2);
const argOf = (name: string) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const WRITE = args.includes('--write');
/** 금액이 콘솔 계획과 어긋나는 줄은 빼고 넣는다 — 맞는 것부터 채우는 갈래 */
const ONLY_MATCHING = args.includes('--only-matching');
/*
 * 어긋나도 넣기로 정한 정산번호 (--accept ST353,ST278).
 *
 * ★이미 나간 돈은 나간 대로 적는다★ (한백 지시 2026-08-28). 계획과 다르면 그 차이는
 * 남은 지급으로 보이거나 마진으로 남는데, 그 판단은 사람이 한 번 하고 여기 번호로 남긴다 —
 * 목록에 없는 번호는 여전히 --only-matching 이 걸러 낸다.
 */
const ACCEPT = new Set(
  (argOf('--accept') ?? '').split(',').map((x) => x.trim()).filter(Boolean)
);
const ENV_FILE = argOf('--env');
const SETTLEMENTS = argOf('--settlements');
const SITES = argOf('--sites');

if (!SETTLEMENTS || !SITES) {
  throw new Error('--settlements 와 --sites 스냅샷 경로가 필요합니다');
}
/*
 * 없는 파일을 조용히 넘기면(loadEnvFile 의 기본 동작) 오타 하나로 딴 DB 를 치게 되므로
 * --env 를 준 경우에는 파일이 실제로 있는지 여기서 확인한다.
 */
if (ENV_FILE) readFileSync(ENV_FILE, 'utf8');
loadEnvFile(ENV_FILE);

/*
 * .env.prod-db 에는 DIRECT_URL 한 줄만 있다(CLAUDE.md) — 저장소 모듈은 DATABASE_URL 을
 * 본다. 여기서 옮겨 준다. 순서가 중요하다: DATABASE_URL 이 이미 있으면 건드리지 않는다
 * (셸에서 준 값이 파일보다 우선이라는 loadEnvFile 의 규칙과 같다).
 */
if (!process.env.DATABASE_URL && process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

// ── 노션 값 꺼내기 ────────────────────────────────────────────
type NotionPage = { id: string; properties: Record<string, Prop> };
type Prop = Record<string, unknown> & { type: string };

function val(p: Prop | undefined): unknown {
  if (!p) return null;
  const t = p.type;
  if (t === 'date') return (p.date as { start?: string } | null)?.start ?? null;
  if (t === 'checkbox') return p.checkbox;
  if (t === 'number') return p.number;
  if (t === 'unique_id') {
    const u = p.unique_id as { prefix: string | null; number: number };
    return `${u.prefix ?? ''}${u.number}`;
  }
  if (t === 'title' || t === 'rich_text') {
    return (p[t] as Array<{ plain_text: string }>).map((x) => x.plain_text).join('');
  }
  if (t === 'formula') {
    const f = p.formula as Record<string, unknown> & { type: string };
    return f[f.type] ?? null;
  }
  if (t === 'rollup') {
    const r = p.rollup as Record<string, unknown> & { type: string };
    if (r.type === 'number') return r.number;
    if (r.type === 'array') {
      const arr = (r.array as Prop[]).map((x) => val(x));
      return arr.length === 1 ? arr[0] : (arr.length ? arr : null);
    }
    return r[r.type] ?? null;
  }
  if (t === 'relation') return (p.relation as Array<{ id: string }>).map((x) => x.id);
  return null;
}

/** 노션의 금액 칸은 rollup 이라 문자열로 오는 일이 있다 — 숫자만 남겨 정수로 본다 */
function money(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : null;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) && v.trim() !== '' ? Math.round(n) : null;
  }
  return null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface Move {
  no: string;            // 정산번호 (ST123)
  siteNo: string;        // 노션 현장 번호
  projectId: string;     // 콘솔 현장 번호 (HB-2026-001)
  name: string;
  kind: '영업비' | '시공비';
  category: '1차';
  amount: number;
  at: string;
}

async function main() {
  const settlements = JSON.parse(readFileSync(SETTLEMENTS!, 'utf8')) as NotionPage[];
  const sites = JSON.parse(readFileSync(SITES!, 'utf8')) as NotionPage[];

  // 노션 현장 페이지 id → 그 현장의 노션 번호
  const siteNoOf = new Map<string, string>();
  for (const s of sites) {
    const key = Object.keys(s.properties).find((k) => s.properties[k].type === 'unique_id');
    if (key) siteNoOf.set(s.id, String(val(s.properties[key])));
  }

  const { getDb } = await import('../lib/db/client');
  const { projects, payoutEntries, settlements: settlementsTable } = await import('../lib/db/schema');
  const { sql } = await import('drizzle-orm');
  const db = getDb();
  // 어느 DB 인지 먼저 밝힌다 — 모르고 --write 하는 일이 없게. 비밀은 안 찍고 호스트만.
  try {
    console.log(`DB ${new URL(process.env.DATABASE_URL!).host} (${ENV_FILE ?? '.env.local'})`);
  } catch { console.log(`DB (${ENV_FILE ?? '.env.local'})`); }

  // 콘솔 현장: 노션 번호(mgmt_no) → 콘솔 id
  const rows = await db.select({ id: projects.id, mgmtNo: projects.mgmtNo, name: projects.name }).from(projects);
  const byMgmt = new Map(rows.filter((r) => r.mgmtNo).map((r) => [String(r.mgmtNo), r]));
  console.log(`콘솔 현장 ${rows.length}건 · 노션 번호가 붙은 것 ${byMgmt.size}건`);

  const moves: Move[] = [];
  const notes: Array<{ projectId: string; note: string }> = [];
  const skipped: string[] = [];
  let linked = 0;

  for (const row of settlements) {
    const p = row.properties;
    const no = String(val(p['정산번호']) ?? '?');
    const name = String(val(p['정산명']) ?? '');
    const link = val(p['연결DB']) as string[] | null;

    if (!link || link.length === 0) {
      skipped.push(`${no} ${name} — 연결된 현장이 없습니다`);
      continue;
    }
    const siteNo = siteNoOf.get(link[0]);
    if (!siteNo) {
      skipped.push(`${no} ${name} — 연결된 현장을 스냅샷에서 못 찾았습니다`);
      continue;
    }
    const project = byMgmt.get(siteNo);
    if (!project) {
      skipped.push(`${no} ${name} — 노션 번호 ${siteNo} 인 현장이 콘솔에 없습니다`);
      continue;
    }
    linked++;

    const pairs: Array<{ kind: '영업비' | '시공비'; dateKey: string; amountKey: string }> = [
      { kind: '영업비', dateKey: '영업비_1차_지급일', amountKey: '영업비_1차 (70%)' },
      { kind: '시공비', dateKey: '시공비_1차_지급일자', amountKey: '시공비_1차_총지급액' },
    ];
    for (const pair of pairs) {
      const at = val(p[pair.dateKey]);
      if (typeof at !== 'string' || !DATE_RE.test(at)) continue;
      const amount = money(val(p[pair.amountKey]));
      if (amount === null || amount === 0) {
        skipped.push(`${no} ${name} — ${pair.kind} 1차 지급일(${at})은 있는데 금액이 ${String(amount)} 입니다`);
        continue;
      }
      moves.push({
        no, siteNo, projectId: project.id, name: project.name,
        kind: pair.kind, category: '1차', amount, at,
      });
    }

    const memo = val(p['비고']);
    if (typeof memo === 'string' && memo.trim()) {
      notes.push({ projectId: project.id, note: memo.trim() });
    }
  }

  // ── 리포트 ───────────────────────────────────────────────
  const byKind = (kind: string) => moves.filter((m) => m.kind === kind);
  const sum = (list: Move[]) => list.reduce((n, m) => n + m.amount, 0);
  const months = new Map<string, number>();
  for (const m of moves) months.set(m.at.slice(0, 7), (months.get(m.at.slice(0, 7)) ?? 0) + m.amount);

  console.log(`\n정산 행 ${settlements.length}건 · 현장에 붙은 것 ${linked}건`);
  console.log(`옮길 지급 ${moves.length}건 — 영업비 ${byKind('영업비').length}건 ${sum(byKind('영업비')).toLocaleString('ko-KR')}원`
    + ` · 시공비 ${byKind('시공비').length}건 ${sum(byKind('시공비')).toLocaleString('ko-KR')}원`);
  console.log(`정산 메모 ${notes.length}건`);
  console.log('\n월별 지급액');
  for (const [month, amount] of [...months].sort()) {
    console.log(`  ${month}  ${amount.toLocaleString('ko-KR')}원`);
  }

  if (skipped.length > 0) {
    console.log(`\n건너뛴 것 ${skipped.length}건`);
    for (const line of skipped.slice(0, 15)) console.log(`  - ${line}`);
    if (skipped.length > 15) console.log(`  … 그 외 ${skipped.length - 15}건`);
  }

  /*
   * ★노션 금액과 콘솔 계획액을 대조한다.★
   *
   * 콘솔은 지급 계획을 단가 × 대수로 스스로 계산하고, 1차는 그 70% 다(lib/settlement).
   * 노션이 적어 온 1차 금액이 그 값과 다르면 이관 뒤에 잔액이 남거나 초과 지급으로 잡힌다 —
   * 넣기 전에 눈으로 봐야 하는 자리라 드라이런에 넣는다. 읽기만 한다.
   */
  const planRows = await db.execute(sql`
    select l.project_id                                             as project_id,
           sum(coalesce(r.sales_unit, 0) * l.qty)::int              as sales_plan,
           sum(coalesce(r.cons_unit, 0) * l.qty)::int               as cons_plan,
           count(*) filter (where l.pricing_rule_id is null)::int   as unpriced
      from contract_lines l
      left join pricing_rules r on r.id = l.pricing_rule_id
     group by l.project_id
  `);
  const planOf = new Map<string, { sales: number; cons: number; unpriced: number }>();
  for (const row of planRows as unknown as Array<Record<string, unknown>>) {
    planOf.set(String(row.project_id), {
      sales: Number(row.sales_plan), cons: Number(row.cons_plan), unpriced: Number(row.unpriced),
    });
  }

  /** 금액이 어긋난 줄 — 그 줄의 key 로 찾을 수 있게 둔다(--only-matching 이 이것을 뺀다) */
  const gapOf = new Map<string, string>();
  const keyOf = (m: Move) => `${m.no}|${m.kind}`;
  for (const m of moves) {
    const plan = planOf.get(m.projectId);
    if (!plan) { gapOf.set(keyOf(m), `${m.no} ${m.name} — 콘솔에 계약 라인이 없습니다`); continue; }
    if (plan.unpriced > 0) {
      gapOf.set(keyOf(m), `${m.no} ${m.name} — 단가 미지정 라인 ${plan.unpriced}개 (계획액이 비어 있습니다)`);
      continue;
    }
    const total = m.kind === '영업비' ? plan.sales : plan.cons;
    // 1차 = 총액의 70% (끝수 포함) — lib/settlement 의 회차 계산과 같은 규칙
    const expect = Math.round(total * 0.7);
    if (Math.abs(m.amount - expect) > 1) {
      gapOf.set(
        keyOf(m),
        `${m.no} ${m.name} ${m.kind} — 노션 ${m.amount.toLocaleString('ko-KR')}원`
        + ` vs 콘솔 계획 70% ${expect.toLocaleString('ko-KR')}원 (총액 ${total.toLocaleString('ko-KR')}원)`
      );
    }
  }
  console.log(`\n금액 대조 — 노션 1차 금액 vs 콘솔 계획의 70%`);
  if (gapOf.size === 0) console.log('  전부 일치');
  else {
    console.log(`  어긋남 ${gapOf.size}건`);
    for (const line of [...gapOf.values()]) console.log(`   - ${line}`);
  }

  /*
   * ★어긋난 줄을 빼고 넣는 갈래★ (--only-matching, 한백 지시 2026-08-27 「C」)
   *
   * 금액이 맞는 것부터 채우고, 어긋난 것은 왜 다른지 정한 뒤에 넣는다. 조용히 빼지 않는다 —
   * 위 목록이 그대로 「아직 안 들어간 것」의 명세다. 다시 돌리면 그때 들어간다(멱등).
   */
  const target = ONLY_MATCHING
    ? moves.filter((m) => !gapOf.has(keyOf(m)) || ACCEPT.has(m.no))
    : moves;
  if (ONLY_MATCHING) {
    const forced = target.filter((m) => gapOf.has(keyOf(m)));
    console.log(`\n--only-matching — 어긋난 ${moves.length - target.length}건을 빼고 ${target.length}건만 넣습니다.`);
    if (forced.length > 0) {
      console.log(`  그중 --accept 로 통과시킨 것 ${forced.length}건: ${forced.map((m) => `${m.no} ${m.amount.toLocaleString('ko-KR')}원`).join(' · ')}`);
    }
  }

  // 미래 날짜 — 예정으로 적어 둔 것이 실지급으로 들어가면 나간 돈이 부풀려진다
  // (서울 기준으로 센다 — UTC 로 자르면 자정 무렵에 하루가 어긋난다)
  const { today } = await import('../lib/date');
  const todayStr = today();
  const future = moves.filter((m) => m.at > todayStr);
  console.log(`\n오늘(${todayStr}) 이후 날짜인 지급: ${future.length}건`
    + (future.length ? ` — ${future.slice(0, 5).map((m) => `${m.no} ${m.at}`).join(' · ')}` : ''));

  // 이미 콘솔에 있는 원장과 겹치는지 — 다시 돌릴 때 무엇이 덮이는지 보여준다
  const existing = await db.select({ id: payoutEntries.id }).from(payoutEntries);
  const have = new Set(existing.map((e) => e.id));
  const idOf = (m: Move) => `notion-${m.no}-${m.kind}-${m.category}`;
  const already = target.filter((m) => have.has(idOf(m)));
  console.log(`\n콘솔 원장 ${existing.length}건 · 그중 이 이관으로 이미 들어간 것 ${already.length}건`);

  if (!WRITE) {
    console.log('\n드라이런입니다 — 아무것도 쓰지 않았습니다. 실제로 넣으려면 --write 를 붙이세요.');
    process.exit(0);
  }

  // ── 쓰기 ─────────────────────────────────────────────────
  const now = new Date().toISOString();
  let wrote = 0;
  for (const m of target) {
    await db.insert(payoutEntries).values({
      id: idOf(m), projectId: m.projectId, kind: m.kind, category: m.category,
      amount: m.amount, at: m.at, note: `노션 정산관리 ${m.no}`, createdAt: now,
    }).onConflictDoUpdate({
      target: payoutEntries.id,
      set: { projectId: m.projectId, kind: m.kind, category: m.category, amount: m.amount, at: m.at },
    });
    wrote++;
  }

  let noted = 0;
  for (const n of notes) {
    await db.insert(settlementsTable).values({ projectId: n.projectId, payNote: n.note })
      .onConflictDoUpdate({ target: settlementsTable.projectId, set: { payNote: n.note } });
    noted++;
  }

  console.log(`\n원장 ${wrote}건 · 메모 ${noted}건을 넣었습니다.`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
