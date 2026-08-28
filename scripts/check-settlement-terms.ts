/**
 * 노션 「26 정산관리」 ↔ 콘솔 지급조건 대조 — ★읽기만 한다.★
 *
 *   npx tsx scripts/check-settlement-terms.ts \
 *     --settlements ~/hanbaek-backups/20260828/notion-26-settlements.json \
 *     --sites       ~/hanbaek-backups/20260826/notion-26-sites.json \
 *     --matrix      ~/hanbaek-backups/20260823/notion-26-matrix.json \
 *     [--env .env.prod-db] [--all]
 *
 * ★왜 이 스크립트가 생겼나★ (한백 지적 2026-08-29)
 * 반달마을푸르지오에 이어 경기 수원 포레나 영흥숲(위치변경 1기)도 지급조건이 다르게
 * 걸려 있었다. 두 건이 같은 모양이라 나머지도 같은 자리에서 틀어졌다고 봐야 한다 —
 * 눈으로 두 건을 고치는 것으로는 끝나지 않는다. 141행을 한 번에 대조한다.
 *
 * ★무엇이 틀어졌나 (원인)★
 * 노션 정산관리에는 그 현장에 ★실제로 적용한 단가 케이스가 이름으로★ 적혀 있다
 * (「적용 단가 규칙(매트릭스)」 relation). 그런데 현장 이관(import-notion-2026)은 그
 * 이름을 안 쓰고 라인의 축(운영사·사업구분·연수·수전방식·교체유형)으로 케이스를 다시
 * 골랐다. 축이 같은 케이스가 둘 있으면(상반기 정책 / 하반기 정책) 축만으로는 못 가른다 —
 * 계약이 어느 정책 시기의 것인지는 축이 아니라 계약일이 정하는데, 그 판단이 이관에
 * 없었다. 그래서 상반기에 계약한 현장에 하반기 단가가 붙었다.
 *
 * 이 스크립트는 그것을 ★이름으로★ 맞춰 본다. 금액(총 영업비·총 시공비)과 대수도 같이
 * 본다 — 이름이 같아도 금액이 다르면 케이스 값 자체가 노션과 다른 것이다.
 *
 * ★쓰지 않는다.★ --write 같은 갈래가 아예 없다. 무엇을 고칠지는 이 목록을 보고 사람이
 * 정하고, 고치는 것은 따로 만든다(단가 케이스를 다시 걸면 계획·회차·기성·마진이 같이
 * 움직이므로 한 건씩 확인해야 한다).
 */
import { readFileSync } from 'fs';
import { loadEnvFile } from '../lib/env-file';

const args = process.argv.slice(2);
const argOf = (name: string) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
/** 맞는 것까지 다 찍는다 — 기본은 어긋난 것만 */
const ALL = args.includes('--all');
/** 이 정산번호는 노션·콘솔 값을 나란히 다 찍는다 (--detail ST338,ST217) */
const DETAIL = new Set((argOf('--detail') ?? '').split(',').map((x) => x.trim()).filter(Boolean));
const ENV_FILE = argOf('--env');
const SETTLEMENTS = argOf('--settlements');
const SITES = argOf('--sites');
const MATRIX = argOf('--matrix');

if (!SETTLEMENTS || !SITES || !MATRIX) {
  throw new Error('--settlements · --sites · --matrix 스냅샷 경로가 필요합니다');
}
// 오타 하나로 딴 DB 를 치지 않게, 준 파일이 실제로 있는지 먼저 본다
if (ENV_FILE) readFileSync(ENV_FILE, 'utf8');
loadEnvFile(ENV_FILE);
if (!process.env.DATABASE_URL && process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

// ── 노션 값 꺼내기 (import-notion-settlements 와 같은 규칙) ─────────
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

/**
 * 노션의 금액 칸은 rollup·formula 라 「1,500,000」 같은 문자열로 오는 일이 있다.
 *
 * ★0 은 「값 없음」으로 본다.★ 아직 안 채운 정산 행의 rollup 이 0 으로 오는데, 그것을
 * 금액으로 견주면 콘솔이 틀린 것처럼 보인다 — 첫 판에 12건이 그렇게 떴다(2026-08-29).
 * 대조가 안 되는 것과 어긋난 것은 다른 말이다(화면 규칙 10번과 같은 이유).
 */
function money(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : null;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) && v.trim() !== '' ? Math.round(n) : null;
  }
  return null;
}

/** 대조할 수 있는 값만 — 0·빈 값은 노션이 아직 안 채운 것이다 */
const filled = (v: unknown): number | null => {
  const n = money(v);
  return n === null || n === 0 ? null : n;
};

const won = (n: number) => n.toLocaleString('ko-KR');
/** 케이스 이름의 곁가지를 걷어 견준다 — 공백·전각 괄호 차이로 「다르다」가 나오지 않게 */
const normName = (s: string) => s.replace(/\s+/g, ' ').replace(/[（）]/g, (c) => (c === '（' ? '(' : ')')).trim();

interface Row {
  no: string;
  /** 콘솔 현장 번호 — 화면에서 바로 찾을 수 있게 */
  id: string;
  name: string;
  lines: string[];
}

async function main() {
  const settlements = JSON.parse(readFileSync(SETTLEMENTS!, 'utf8')) as NotionPage[];
  const sites = JSON.parse(readFileSync(SITES!, 'utf8')) as NotionPage[];
  const matrix = JSON.parse(readFileSync(MATRIX!, 'utf8')) as NotionPage[];

  // 노션 현장 페이지 id → 그 현장의 노션 번호 (mgmt_no 와 맞춘다)
  const siteNoOf = new Map<string, string>();
  for (const s of sites) {
    const key = Object.keys(s.properties).find((k) => s.properties[k].type === 'unique_id');
    if (key) siteNoOf.set(s.id, String(val(s.properties[key])));
  }
  // 매트릭스 페이지 id → 케이스 이름
  const caseNameOf = new Map<string, string>();
  for (const m of matrix) {
    const key = Object.keys(m.properties).find((k) => m.properties[k].type === 'title');
    if (key) caseNameOf.set(m.id, String(val(m.properties[key]) ?? ''));
  }

  const { getDb } = await import('../lib/db/client');
  const { sql } = await import('drizzle-orm');
  const db = getDb();
  try {
    console.log(`DB ${new URL(process.env.DATABASE_URL!).host} (${ENV_FILE ?? '.env.local'}) — 읽기만 합니다`);
  } catch { console.log(`DB (${ENV_FILE ?? '.env.local'}) — 읽기만 합니다`); }

  /*
   * 콘솔 쪽 한 방에 읽는다 — 현장 하나에 라인이 여럿이므로 라인 단위로 받아 접는다.
   * 케이스가 안 붙은 라인(pricing_rule_id is null)도 나와야 한다: 그것이 곧 계획액이
   * 비어 있는 이유다.
   */
  const rows = (await db.execute(sql`
    select p.id, p.mgmt_no, p.name, p.payout_terms_confirmed_at,
           l.id as line_id, l.qty, l.term_years, l.power_type, l.repl_type,
           r.case_name, r.sales_unit, r.cons_unit, r.margin
      from projects p
      left join contract_lines l on l.project_id = p.id
      left join pricing_rules r  on r.id = l.pricing_rule_id
     order by p.mgmt_no, l.id
  `)) as unknown as Array<Record<string, unknown>>;

  interface Line {
    qty: number; termYears: number; powerType: string | null; replType: string | null;
    caseName: string | null; salesUnit: number | null; consUnit: number | null; margin: number | null;
  }
  const consoleOf = new Map<string, { id: string; name: string; confirmedAt: string | null; lines: Line[] }>();
  for (const r of rows) {
    const mgmt = r.mgmt_no === null ? null : String(r.mgmt_no);
    if (!mgmt) continue;
    const entry = consoleOf.get(mgmt) ?? {
      id: String(r.id), name: String(r.name),
      /* 지급조건이 확정돼 있으면 케이스를 다시 걸기 전에 확정을 풀어야 한다 */
      confirmedAt: r.payout_terms_confirmed_at === null ? null : String(r.payout_terms_confirmed_at),
      lines: [],
    };
    if (r.line_id) {
      entry.lines.push({
        qty: Number(r.qty), termYears: Number(r.term_years),
        powerType: r.power_type === null ? null : String(r.power_type),
        replType: r.repl_type === null ? null : String(r.repl_type),
        caseName: r.case_name === null ? null : String(r.case_name),
        salesUnit: r.sales_unit === null ? null : Number(r.sales_unit),
        consUnit: r.cons_unit === null ? null : Number(r.cons_unit),
        margin: r.margin === null ? null : Number(r.margin),
      });
    }
    consoleOf.set(mgmt, entry);
  }
  console.log(`콘솔 현장 ${consoleOf.size}건 (노션 번호가 붙은 것) · 계약 라인 ${rows.filter((r) => r.line_id).length}개`);

  // 원장 1차 실지급 — 계획을 넘었나 못 미쳤나
  const paidRows = (await db.execute(sql`
    select project_id, kind, sum(amount)::int as paid
      from payout_entries
     where category = '1차'
     group by project_id, kind
  `)) as unknown as Array<Record<string, unknown>>;
  const paidOf = new Map<string, { 영업비: number; 시공비: number }>();
  for (const r of paidRows) {
    const key = String(r.project_id);
    const cur = paidOf.get(key) ?? { 영업비: 0, 시공비: 0 };
    cur[String(r.kind) as '영업비' | '시공비'] = Number(r.paid);
    paidOf.set(key, cur);
  }

  /* 갈래 넷 — 돈이 다른 것 · 나간 돈이 계획과 다른 것 · 이름만 다른 것 · 대조 못 한 것 */
  const money_: Row[] = [];
  const paidOff: Row[] = [];
  const nameOnly: Row[] = [];
  const cannot: Row[] = [];
  const detailed: string[] = [];
  const ok: string[] = [];
  const unlinked: string[] = [];
  let checked = 0;

  for (const row of settlements) {
    const p = row.properties;
    const no = String(val(p['정산번호']) ?? '?');
    const title = String(val(p['정산명']) ?? '');
    const link = val(p['연결DB']) as string[] | null;
    const siteNo = link && link.length > 0 ? siteNoOf.get(link[0]) : undefined;
    const site = siteNo ? consoleOf.get(siteNo) : undefined;
    if (!site) {
      unlinked.push(`${no} ${title} — ${!link?.length ? '연결된 현장 없음' : !siteNo ? '스냅샷에 현장 없음' : `노션 번호 ${siteNo} 인 현장이 콘솔에 없음`}`);
      continue;
    }
    checked++;

    /* ── 노션이 정본인 값들 — 0·빈 값은 「아직 안 채움」이라 견주지 않는다 */
    const wanted = (val(p['적용 단가 규칙(매트릭스)']) as string[] | null ?? [])
      .map((id) => caseNameOf.get(id) ?? `(매트릭스에 없는 페이지 ${id.slice(0, 8)})`);
    const have = [...new Set(site.lines.map((l) => l.caseName).filter((n): n is string => Boolean(n)))];
    const unpriced = site.lines.filter((l) => !l.caseName).length;

    const qtyN = filled(val(p['계약대수']));
    const qtyC = site.lines.reduce((n, l) => n + l.qty, 0);
    const salesN = filled(val(p['총 영업비']));
    const salesC = site.lines.reduce((n, l) => n + (l.salesUnit ?? 0) * l.qty, 0);
    const consN = filled(val(p['총 시공비']));
    const consC = site.lines.reduce((n, l) => n + (l.consUnit ?? 0) * l.qty, 0);
    const turnkeyN = filled(val(p['운영사 턴키단가(매트릭스)']));
    const turnkeysC = [...new Set(site.lines
      .filter((l) => l.salesUnit !== null)
      .map((l) => (l.salesUnit ?? 0) + (l.consUnit ?? 0) + (l.margin ?? 0)))];

    /* ★돈이 다른 것이 판정이다.★ 이름 차이는 그 원인일 수도, 설계된 차이일 수도 있다 */
    const moneyGaps: string[] = [];
    if (qtyN !== null && qtyN !== qtyC) moneyGaps.push(`대수      콘솔 ${qtyC}대 ← 노션 ${qtyN}대`);
    if (unpriced === 0) {
      if (turnkeyN !== null && turnkeysC.length === 1 && turnkeysC[0] !== turnkeyN) {
        moneyGaps.push(`턴키/대   콘솔 ${won(turnkeysC[0])}원 ← 노션 ${won(turnkeyN)}원`);
      }
      if (salesN !== null && Math.abs(salesN - salesC) > 1) {
        moneyGaps.push(`영업비 총액 콘솔 ${won(salesC)}원 ← 노션 ${won(salesN)}원`);
      }
      if (consN !== null && Math.abs(consN - consC) > 1) {
        moneyGaps.push(`시공비 총액 콘솔 ${won(consC)}원 ← 노션 ${won(consN)}원`);
      }
    }

    /* 이름 — 노션이 든 케이스가 콘솔 라인에 없나 */
    const wantSet = new Set(wanted.map(normName));
    const nameOff = wanted.length > 0 && unpriced === 0
      ? have.filter((h) => !wantSet.has(normName(h)))
      : [];
    const nameGap = nameOff.length > 0
      ? `케이스    콘솔 「${nameOff.join(' · ')}」 ← 노션 「${wanted.join(' · ')}」`
      : null;

    /* 대조를 못 하는 까닭 — 어긋난 것과 다른 말이다 */
    const blocked = wanted.length === 0 ? '노션에 적용 단가 규칙이 비어 있음'
      : unpriced > 0 ? `콘솔 단가 미지정 라인 ${unpriced}개`
        : salesN === null && consN === null && turnkeyN === null ? '노션 금액이 비어 있음'
          : null;

    /* 이미 나간 1차 — 지급조건이 틀어지면 여기서 돈으로 드러난다 */
    const paidGaps: string[] = [];
    const paid = paidOf.get(site.id);
    if (paid && unpriced === 0) {
      for (const [kind, plan] of [['영업비', salesC], ['시공비', consC]] as const) {
        const done = paid[kind];
        if (done === 0) continue;
        const expect = Math.round(plan * 0.7);
        if (Math.abs(done - expect) > 1) {
          paidGaps.push(`${kind} 1차  나간 돈 ${won(done)}원 · 계획 70% ${won(expect)}원 (총액 ${won(plan)}원)`);
        }
      }
    }

    if (DETAIL.has(no)) {
      detailed.push([
        `${no} ${title}`,
        `   콘솔 현장   ${site.id} ${site.name} (노션 번호 ${siteNo})`,
        `   콘솔 라인   ${site.lines.map((l) => `${l.qty}대 ${l.termYears}년 ${l.powerType ?? '수전?'} ${l.replType ?? '-'} 「${l.caseName ?? '단가 미지정'}」`).join('\n               ')}`,
        `   노션 케이스  ${wanted.join(' · ') || '(비어 있음)'}`,
        `   대수        콘솔 ${qtyC} · 노션 ${qtyN ?? '-'}`,
        `   턴키/대     콘솔 ${turnkeysC.map(won).join('/') || '-'} · 노션 ${turnkeyN === null ? '-' : won(turnkeyN)}`,
        `   영업비 총액  콘솔 ${won(salesC)} · 노션 ${salesN === null ? '-' : won(salesN)}`,
        `   시공비 총액  콘솔 ${won(consC)} · 노션 ${consN === null ? '-' : won(consN)}`,
        `   1차 실지급   영업비 ${won(paid?.영업비 ?? 0)} · 시공비 ${won(paid?.시공비 ?? 0)}`,
        `   지급조건 확정 ${site.confirmedAt ?? '안 됨'}`,
      ].join('\n'));
    }

    const lines = [...moneyGaps, ...(nameGap ? [nameGap] : [])];
    if (moneyGaps.length > 0) money_.push({ no, name: site.name, id: site.id, lines });
    else if (nameGap) nameOnly.push({ no, name: site.name, id: site.id, lines });
    else if (blocked) cannot.push({ no, name: site.name, id: site.id, lines: [blocked, ...(have.length ? [`콘솔 케이스 「${have.join(' · ')}」`] : [])] });
    else ok.push(`${no} ${site.name}`);
    if (paidGaps.length > 0) paidOff.push({ no, name: site.name, id: site.id, lines: paidGaps });
  }

  // ── 리포트 ───────────────────────────────────────────────
  const show = (title: string, note: string | null, list: Row[]) => {
    console.log(`\n■ ${title} — ${list.length}건`);
    if (note) console.log(`   (${note})`);
    for (const r of list) {
      console.log(`   ${r.no} ${r.name}  [${r.id}]`);
      for (const line of r.lines) console.log(`      ${line}`);
    }
  };

  console.log(`\n정산 행 ${settlements.length}건 · 콘솔 현장에 붙은 것 ${checked}건`);

  show('돈이 다른 현장 — ★고칠 목록★', '노션이 정본이다. 케이스가 다르면 그것이 원인이다', money_);
  show('이미 나간 1차가 계획과 다른 현장', '계획이 틀어졌으면 위 목록에 같이 있다', paidOff);
  show('이름만 다른 현장 — 금액은 같다', 'SK 자체투자 겸용 행(위치변경/제자리교체)을 콘솔이 교체유형별로 쪼갠 자리다 (2026-08-20 한백 확인) — 어긋난 것이 아니다', nameOnly);
  show('대조 못 한 현장', '노션이 아직 안 채운 자리 · 콘솔 단가 미지정', cannot);

  if (unlinked.length > 0) {
    console.log(`\n■ 현장에 못 붙인 정산 행 ${unlinked.length}건`);
    for (const line of unlinked) console.log(`   - ${line}`);
  }

  if (detailed.length > 0) {
    console.log('\n■ 자세히 보기');
    for (const block of detailed) console.log(block);
  }

  console.log(`\n■ 맞는 현장 ${ok.length}건`);
  if (ALL) for (const line of ok) console.log(`   ${line}`);

  console.log('\n읽기만 했습니다 — 아무것도 바꾸지 않았습니다.');
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
