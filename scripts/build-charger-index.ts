/**
 * 「기관충전소」 원본 CSV → 주소별 조회 인덱스(정적 JSON) 생성기.
 *
 *   node scripts/build-charger-index.ts "~/Downloads/기관충전소_2026-08-05.csv"
 *
 * 원본은 50만 행 · 260MB급이라 그대로는 못 올립니다. 「도로명 + 건물번호」로
 * 묶어 256개 샤드로 쪼개 public/data/charger-history/ 에 씁니다. 조회 화면은
 * 필요한 샤드 한 개(수십 KB)만 내려받습니다.
 *
 * 데이터가 갱신되면 새 CSV로 다시 실행한 뒤 커밋 · 배포하면 됩니다.
 */

import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readCsvRows } from './csv-rows.ts';
import {
  isSubsidized,
  parseJibunAddress,
  parseRoadAddress,
  shardOf,
  SHARD_COUNT,
  SIDO_ALIAS,
  type HistoryRow,
  type IndexMeta,
  type JibunPointer,
  type ParsedAddress,
  type Shard,
  type SiteRecord,
  type SubsidyCode,
} from '../lib/charger-history.ts';

const OUT_DIR = path.join(process.cwd(), 'public', 'data', 'charger-history');

/* ------------------------------------------------------------- 값 정리 */

const SUBSIDY_TO_CODE: Record<string, SubsidyCode> = {
  완속보조금: 'S',
  급속보조금: 'F',
  '브랜드사업(공단-완속)': 's',
  '브랜드사업(공단-급속)': 'f',
  '브랜드사업(협회-완속)': 'a',
  '브랜드사업(협회-급속)': 'b',
  일반: 'N',
};

/** 「AC완속」은 완속, 「DC…」는 급속. 다만 「DC콤보(완속)」은 완속으로 봅니다. */
function isFastCharger(type: string): boolean {
  return type.startsWith('DC') && !type.includes('완속');
}

/** 「2025년 2727번」 → 「2025-2727」 (자리 차지를 줄이려고 축약) */
function shortApplyNo(raw: string): string {
  const m = /^(\d{4})년\s*(\d+)번?$/.exec(raw.trim());
  return m ? `${m[1]}-${m[2]}` : raw.trim();
}

/* ------------------------------------------------------------ 집계 자료구조 */

/** 이력 묶음 키를 만들 때 쓰는 구분자 — 데이터에 나올 수 없는 값 */
const HISTORY_SEP = '\u0001';

interface Draft {
  ad: string;
  names: Set<string>;
  kinds: Map<string, number>;
  slow: number;
  fast: number;
  subsidized: number;
  /** 이력 묶음 키 → 대수 */
  history: Map<string, number>;
}

function draftOf(buckets: Map<string, Draft>, regionKey: string, address: string): Draft {
  const found = buckets.get(regionKey);
  if (found) return found;
  const created: Draft = {
    ad: address,
    names: new Set(),
    kinds: new Map(),
    slow: 0,
    fast: 0,
    subsidized: 0,
    history: new Map(),
  };
  buckets.set(regionKey, created);
  return created;
}

function finalize(draft: Draft): SiteRecord {
  const kd =
    [...draft.kinds.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? '';

  const h: HistoryRow[] = [...draft.history.entries()].map(([key, qty]) => {
    const [year, month, code, applyNo, operator, fast] = key.split(HISTORY_SEP);
    return [year, month, qty, code as SubsidyCode, applyNo, operator, fast === '1' ? 1 : 0];
  });
  h.sort((a, b) => `${b[0]}${b[1] || '00'}`.localeCompare(`${a[0]}${a[1] || '00'}`));

  return {
    ad: draft.ad,
    nm: [...draft.names].sort(),
    kd,
    s: draft.slow,
    f: draft.fast,
    g: draft.subsidized,
    h,
  };
}

/* ---------------------------------------------------------------- 행 읽기 */

interface RowFields {
  address: string;
  name: string;
  kind: string;
  fast: boolean;
  code: SubsidyCode;
  /** 이력 묶음 키 — 같은 묶음끼리 대수를 더합니다 */
  historyKey: string;
}

function readFields(row: string[], col: Record<string, number>): RowFields {
  const at = (name: string) => (row[col[name]] ?? '').trim();
  const fast = isFastCharger(at('충전기타입'));
  const code = SUBSIDY_TO_CODE[at('보조금구분')] ?? 'U';
  return {
    address: at('도로명주소'),
    name: at('충전소명'),
    kind: at('충전소구분 상세'),
    fast,
    code,
    historyKey: [
      at('설치년도'),
      at('설치월').padStart(2, '0').replace(/^00$/, ''),
      code,
      shortApplyNo(at('완속충전기보조금신청번호')),
      at('운영기관 명칭'),
      fast ? '1' : '0',
    ].join(HISTORY_SEP),
  };
}

function apply(draft: Draft, f: RowFields): void {
  if (f.name) draft.names.add(f.name);
  if (f.kind) draft.kinds.set(f.kind, (draft.kinds.get(f.kind) ?? 0) + 1);
  if (f.fast) draft.fast += 1;
  else draft.slow += 1;
  if (isSubsidized(f.code)) draft.subsidized += 1;
  draft.history.set(f.historyKey, (draft.history.get(f.historyKey) ?? 0) + 1);
}

type Index = Map<string, Map<string, Draft>>;

function bucketFor(index: Index, key: string, regionKey: string, address: string): Draft {
  let buckets = index.get(key);
  if (!buckets) {
    buckets = new Map();
    index.set(key, buckets);
  }
  return draftOf(buckets, regionKey, address);
}

/* ------------------------------------------------------------------ 실행 */

async function main() {
  const src = process.argv[2];
  if (!src) {
    console.error('사용법: node scripts/build-charger-index.ts <기관충전소 CSV 경로> [기준일]');
    process.exit(1);
  }
  const fileName = path.basename(src);
  const asOf =
    process.argv[3] ??
    /(\d{4}-\d{2}-\d{2})/.exec(fileName)?.[1] ??
    new Date().toISOString().slice(0, 10);

  /** 「도로명|건물번호」 → 「시도|시군구」 → 집계 */
  const index: Index = new Map();
  /** 지번 키 + 지역 → 도로명 키 + 지역 (조회 우회로 · 지번뿐인 행 병합에 함께 씁니다) */
  const byJibun = new Map<string, JibunPointer>();
  /** 도로명이 해석되지 않아 지번으로 붙여야 하는 행 */
  const pending: Array<{ fields: RowFields; jibun: ParsedAddress }> = [];

  const stats = {
    rows: 0,
    byRoad: 0,
    byJibunMerged: 0,
    jibunOnly: 0,
    dropped: 0,
    unknownSido: new Map<string, number>(),
    sampleDropped: [] as string[],
  };

  let header: string[] | null = null;
  let col: Record<string, number> = {};

  for await (const row of readCsvRows(src)) {
    if (!header) {
      header = row;
      col = Object.fromEntries(header.map((name, i) => [name.trim(), i]));
      const required = [
        '도로명주소',
        '지번주소',
        '충전소명',
        '충전소구분 상세',
        '운영기관 명칭',
        '충전기타입',
        '보조금구분',
        '설치년도',
        '설치월',
        '완속충전기보조금신청번호',
      ];
      const missing = required.filter((name) => col[name] === undefined);
      if (missing.length) throw new Error(`원본에 없는 컬럼: ${missing.join(', ')}`);
      continue;
    }

    stats.rows += 1;
    const fields = readFields(row, col);
    const jibunRaw = (row[col['지번주소']] ?? '').trim();

    // 두 칸의 내용이 서로 바뀐 행이 섞여 있어 양쪽을 모두 봅니다.
    // 도로명은 「도로명주소」 칸 → 「지번주소」 칸, 지번은 그 반대 순서로 찾습니다.
    const roadFromOwnColumn = parseRoadAddress(fields.address);
    const road = roadFromOwnColumn ?? parseRoadAddress(jibunRaw);
    const jibun = parseJibunAddress(jibunRaw) ?? parseJibunAddress(fields.address);
    /** 화면에 보여줄 주소 — 실제로 해석된 쪽 */
    const shown = roadFromOwnColumn || !road ? fields.address : jibunRaw;

    if (road) {
      const first = shown.split(' ')[0];
      if (!SIDO_ALIAS[first]) {
        stats.unknownSido.set(first, (stats.unknownSido.get(first) ?? 0) + 1);
      }
      stats.byRoad += 1;
      apply(bucketFor(index, road.roadNumKey, road.regionKey, shown), fields);
      const alias = `${jibun?.roadNumKey}${HISTORY_SEP}${jibun?.regionKey}`;
      if (jibun && !byJibun.has(alias)) {
        byJibun.set(alias, [road.roadNumKey, road.regionKey]);
      }
    } else if (jibun) {
      pending.push({ fields, jibun });
    } else {
      stats.dropped += 1;
      if (stats.sampleDropped.length < 10 && fields.address) {
        stats.sampleDropped.push(fields.address);
      }
    }
  }

  // 도로명으로 못 붙인 행 처리 — 같은 지번의 도로명 기록이 있으면 그쪽으로 합치고,
  // 없으면 지번 키 자체를 조회 키로 씁니다.
  for (const { fields, jibun } of pending) {
    const target = byJibun.get(`${jibun.roadNumKey}${HISTORY_SEP}${jibun.regionKey}`);
    if (target) {
      stats.byJibunMerged += 1;
      apply(bucketFor(index, target[0], target[1], fields.address), fields);
    } else {
      stats.jibunOnly += 1;
      apply(bucketFor(index, jibun.roadNumKey, jibun.regionKey, fields.address), fields);
      byJibun.set(`${jibun.roadNumKey}${HISTORY_SEP}${jibun.regionKey}`, [
        jibun.roadNumKey,
        jibun.regionKey,
      ]);
    }
  }

  /* 샤드로 나눠 쓰기 */
  const shards: Shard[] = Array.from({ length: SHARD_COUNT }, () => ({ k: {}, j: {} }));
  let sites = 0;
  for (const [key, buckets] of index) {
    const shard = shards[parseInt(shardOf(key), 16)];
    const bucket: Record<string, SiteRecord> = {};
    for (const [regionKey, draft] of buckets) {
      bucket[regionKey] = finalize(draft);
      sites += 1;
    }
    shard.k[key] = bucket;
  }
  for (const [alias, pointer] of byJibun) {
    const [jibunKey, regionKey] = alias.split(HISTORY_SEP);
    const shard = shards[parseInt(shardOf(jibunKey), 16)];
    (shard.j[jibunKey] ??= {})[regionKey] = pointer;
  }

  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  let bytes = 0;
  let biggest = { name: '', size: 0 };
  await Promise.all(
    shards.map(async (shard, i) => {
      const name = `${i.toString(16).padStart(2, '0')}.json`;
      const json = JSON.stringify(shard);
      const size = Buffer.byteLength(json);
      bytes += size;
      if (size > biggest.size) biggest = { name, size };
      await writeFile(path.join(OUT_DIR, name), json);
    })
  );

  const meta: IndexMeta = {
    source: fileName,
    asOf,
    rows: stats.rows,
    addresses: index.size,
    sites,
    shardCount: SHARD_COUNT,
  };
  await writeFile(path.join(OUT_DIR, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);

  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)}MB`;
  const num = (n: number) => n.toLocaleString('ko-KR');
  console.log(`원본        ${fileName} (기준일 ${asOf})`);
  console.log(`행          ${num(stats.rows)}`);
  console.log(
    `주소 붙임   도로명 ${num(stats.byRoad)} · 지번→도로명 ${num(stats.byJibunMerged)} · ` +
      `지번만 ${num(stats.jibunOnly)} · 버림 ${num(stats.dropped)}`
  );
  console.log(`조회 키     ${num(index.size)} · 지역별 기록 ${num(sites)} · 지번 우회로 ${num(byJibun.size)}`);
  console.log(
    `출력        ${SHARD_COUNT}개 샤드 · 합계 ${mb(bytes)} · 최대 ${biggest.name} ${(
      biggest.size / 1024
    ).toFixed(0)}KB`
  );
  if (stats.unknownSido.size) {
    console.log('별칭에 없는 시·도 (첫 토큰):');
    for (const [name, count] of [...stats.unknownSido].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${num(count).padStart(9)}  ${name}`);
    }
  }
  if (stats.sampleDropped.length) {
    console.log('버린 주소 예시:');
    for (const sample of stats.sampleDropped) console.log(`  ${sample}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
