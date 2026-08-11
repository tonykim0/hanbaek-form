/**
 * 「EV 보조금 신청이력(2017~2024)」 원본 CSV → 주소별 조회 인덱스(정적 JSON) 생성기.
 *
 *   node scripts/build-subsidy-index.ts "~/Downloads/ev보조금이력_2017-2024_all.csv"
 *   node scripts/build-subsidy-index.ts 2017.csv 2018.csv …   (연도별로 나눠도 됩니다)
 *
 * 원본은 연도별 시트 8장짜리 엑셀입니다. 엑셀은 그대로 못 읽으니 시트를 CSV 로
 * 내보낸 뒤(머리글 8칸: 사업년도 · 대기번호 · 신청자명 · 도로명주소 · 신청대수 ·
 * 충전기유형 · 공사완료일 · 최초지급서류제출일) 이 스크립트에 넘깁니다. 여러 개를
 * 넘기면 하나로 합쳐 인덱스를 만듭니다.
 *
 * 기관충전소 인덱스(build-charger-index.ts)와 같은 주소 규칙 · 같은 256샤드로
 * public/data/subsidy-history/ 에 씁니다. 두 자료는 합치지 않고 따로 조회합니다.
 */

import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readCsvRows } from './csv-rows.ts';
import {
  parseJibunAddress,
  parseRoadAddress,
  shardOf,
  SHARD_COUNT,
  SIDO_ALIAS,
  type JibunPointer,
  type ParsedAddress,
  type Shard,
} from '../lib/charger-history.ts';
import type { SubsidyMeta, SubsidyRecord, SubsidyRow } from '../lib/subsidy-history.ts';

const OUT_DIR = path.join(process.cwd(), 'public', 'data', 'subsidy-history');

/** 원본 머리글 — 모두 있어야 합니다 */
const COLUMNS = [
  '사업년도',
  '대기번호',
  '신청자명',
  '도로명주소',
  '신청대수',
  '충전기유형',
  '공사완료일',
  '최초지급서류제출일',
] as const;

/* ------------------------------------------------------------- 값 정리 */

/** 「2025-06-10 00:00:00」 「2025/6/10」 → 「2025-06-10」. 알아볼 수 없으면 빈 값 */
function isoDate(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  const m = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/.exec(value);
  if (!m) return '';
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

function toQty(raw: string): number {
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/* ------------------------------------------------------------ 집계 자료구조 */

interface Draft {
  ad: string;
  names: Set<string>;
  rows: SubsidyRow[];
}

interface RowFields {
  address: string;
  name: string;
  row: SubsidyRow;
}

function readFields(row: string[], col: Record<string, number>): RowFields {
  const at = (name: string) => (row[col[name]] ?? '').trim();
  return {
    address: at('도로명주소'),
    name: at('신청자명'),
    row: [
      at('사업년도'),
      at('대기번호'),
      toQty(at('신청대수')),
      at('충전기유형'),
      isoDate(at('공사완료일')),
      isoDate(at('최초지급서류제출일')),
    ],
  };
}

type Index = Map<string, Map<string, Draft>>;

function draftFor(index: Index, key: string, regionKey: string, address: string): Draft {
  let buckets = index.get(key);
  if (!buckets) {
    buckets = new Map();
    index.set(key, buckets);
  }
  const found = buckets.get(regionKey);
  if (found) return found;
  const created: Draft = { ad: address, names: new Set(), rows: [] };
  buckets.set(regionKey, created);
  return created;
}

function apply(draft: Draft, f: RowFields): void {
  if (f.name) draft.names.add(f.name);
  draft.rows.push(f.row);
}

function finalize(draft: Draft): SubsidyRecord {
  const rows = [...draft.rows].sort((a, b) =>
    `${b[0]}${b[1].padStart(8, '0')}`.localeCompare(`${a[0]}${a[1].padStart(8, '0')}`)
  );
  return {
    ad: draft.ad,
    nm: [...draft.names].sort(),
    c: rows.length,
    q: rows.reduce((sum, r) => sum + r[2], 0),
    h: rows,
  };
}

/* ------------------------------------------------------------------ 실행 */

async function main() {
  const sources = process.argv.slice(2);
  if (sources.length === 0) {
    console.error('사용법: node scripts/build-subsidy-index.ts <보조금이력 CSV 경로…>');
    process.exit(1);
  }

  /** 「도로명|건물번호」 → 「시도|시군구」 → 집계 */
  const index: Index = new Map();
  /** 지번 키 + 지역 → 도로명 키 + 지역 (조회 우회로 · 지번뿐인 행 병합에 함께 씁니다) */
  const byJibun = new Map<string, JibunPointer>();
  /** 도로명이 해석되지 않아 지번으로 붙여야 하는 행 */
  const pending: Array<{ fields: RowFields; jibun: ParsedAddress }> = [];
  const SEP = '';

  const stats = {
    rows: 0,
    units: 0,
    byRoad: 0,
    byJibunMerged: 0,
    jibunOnly: 0,
    dropped: 0,
    droppedUnits: 0,
    years: new Map<string, number>(),
    unknownSido: new Map<string, number>(),
    sampleDropped: [] as string[],
  };

  for (const src of sources) {
    let col: Record<string, number> | null = null;
    for await (const row of readCsvRows(src)) {
      if (!col) {
        col = Object.fromEntries(row.map((name, i) => [name.trim(), i]));
        const missing = COLUMNS.filter((name) => col![name] === undefined);
        if (missing.length) {
          throw new Error(`${path.basename(src)} 에 없는 컬럼: ${missing.join(', ')}`);
        }
        continue;
      }

      const fields = readFields(row, col);
      if (!fields.address && !fields.row[1]) continue; // 빈 줄
      stats.rows += 1;
      stats.units += fields.row[2];
      stats.years.set(fields.row[0], (stats.years.get(fields.row[0]) ?? 0) + 1);

      const road = parseRoadAddress(fields.address);
      const jibun = parseJibunAddress(fields.address);

      if (road) {
        const first = fields.address.split(' ')[0];
        if (!SIDO_ALIAS[first]) {
          stats.unknownSido.set(first, (stats.unknownSido.get(first) ?? 0) + 1);
        }
        stats.byRoad += 1;
        apply(draftFor(index, road.roadNumKey, road.regionKey, fields.address), fields);
        const alias = `${jibun?.roadNumKey}${SEP}${jibun?.regionKey}`;
        if (jibun && !byJibun.has(alias)) {
          byJibun.set(alias, [road.roadNumKey, road.regionKey]);
        }
      } else if (jibun) {
        pending.push({ fields, jibun });
      } else {
        stats.dropped += 1;
        stats.droppedUnits += fields.row[2];
        if (stats.sampleDropped.length < 10 && fields.address) {
          stats.sampleDropped.push(fields.address);
        }
      }
    }
  }

  // 도로명으로 못 붙인 행 처리 — 같은 지번의 도로명 기록이 있으면 그쪽으로 합치고,
  // 없으면 지번 키 자체를 조회 키로 씁니다.
  for (const { fields, jibun } of pending) {
    const target = byJibun.get(`${jibun.roadNumKey}${SEP}${jibun.regionKey}`);
    if (target) {
      stats.byJibunMerged += 1;
      apply(draftFor(index, target[0], target[1], fields.address), fields);
    } else {
      stats.jibunOnly += 1;
      apply(draftFor(index, jibun.roadNumKey, jibun.regionKey, fields.address), fields);
      byJibun.set(`${jibun.roadNumKey}${SEP}${jibun.regionKey}`, [
        jibun.roadNumKey,
        jibun.regionKey,
      ]);
    }
  }

  /* 샤드로 나눠 쓰기 */
  const shards: Array<Shard<SubsidyRecord>> = Array.from({ length: SHARD_COUNT }, () => ({
    k: {},
    j: {},
  }));
  let sites = 0;
  for (const [key, buckets] of index) {
    const shard = shards[parseInt(shardOf(key), 16)];
    const bucket: Record<string, SubsidyRecord> = {};
    for (const [regionKey, draft] of buckets) {
      bucket[regionKey] = finalize(draft);
      sites += 1;
    }
    shard.k[key] = bucket;
  }
  for (const [alias, pointer] of byJibun) {
    const [jibunKey, regionKey] = alias.split(SEP);
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

  const years = [...stats.years.keys()].sort();
  const meta: SubsidyMeta = {
    source: sources.map((s) => path.basename(s)).join(', '),
    years: years.length > 1 ? `${years[0]}~${years[years.length - 1]}` : (years[0] ?? ''),
    rows: stats.rows,
    units: stats.units,
    addresses: index.size,
    sites,
    shardCount: SHARD_COUNT,
  };
  await writeFile(path.join(OUT_DIR, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);

  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)}MB`;
  const num = (n: number) => n.toLocaleString('ko-KR');
  console.log(`원본        ${meta.source}`);
  console.log(`행          ${num(stats.rows)} · 신청대수 ${num(stats.units)} · 연도 ${meta.years}`);
  console.log(`  연도별    ${years.map((y) => `${y} ${num(stats.years.get(y) ?? 0)}`).join(' · ')}`);
  console.log(
    `주소 붙임   도로명 ${num(stats.byRoad)} · 지번→도로명 ${num(stats.byJibunMerged)} · ` +
      `지번만 ${num(stats.jibunOnly)} · 버림 ${num(stats.dropped)}(${num(stats.droppedUnits)}대)`
  );
  console.log(
    `조회 키     ${num(index.size)} · 지역별 기록 ${num(sites)} · 지번 우회로 ${num(byJibun.size)}`
  );
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
