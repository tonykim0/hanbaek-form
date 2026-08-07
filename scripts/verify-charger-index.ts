/**
 * 인덱스 검증 — 원본 CSV와 만들어진 샤드를 맞춰 봅니다.
 *
 *   node scripts/verify-charger-index.ts "~/Downloads/기관충전소_2026-08-05.csv"
 *
 * 확인하는 것
 *   1) 샤드에 담긴 총 대수 · 보조금 대수가 원본 집계와 같은가 (집계 누락 · 중복)
 *   2) 원본 주소를 그대로 조회했을 때 실제로 찾아지는가 (조회 경로)
 */

import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  isSubsidized,
  lookupChargerHistory,
  parseJibunAddress,
  parseRoadAddress,
  regionText,
  SHARD_COUNT,
  summarize,
  type Shard,
} from '../lib/charger-history.ts';

const DIR = path.join(process.cwd(), 'public', 'data', 'charger-history');

const cache = new Map<string, Shard>();
async function load(shard: string): Promise<Shard> {
  const hit = cache.get(shard);
  if (hit) return hit;
  const parsed = JSON.parse(await readFile(path.join(DIR, `${shard}.json`), 'utf8')) as Shard;
  cache.set(shard, parsed);
  return parsed;
}

/** build 스크립트와 같은 CSV 파서 (검증용으로 최소 구현) */
async function* readCsvRows(file: string): AsyncGenerator<string[]> {
  const stream = createReadStream(file, { encoding: 'utf8', highWaterMark: 1 << 20 });
  let field = '';
  let row: string[] = [];
  let quoted = false;
  for await (const chunk of stream) {
    for (let i = 0; i < chunk.length; i += 1) {
      const ch = chunk[i];
      if (quoted) {
        if (ch === '"') {
          if (chunk[i + 1] === '"') {
            field += '"';
            i += 1;
          } else quoted = false;
        } else field += ch;
        continue;
      }
      if (ch === '"') quoted = true;
      else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && chunk[i + 1] === '\n') i += 1;
        row.push(field);
        field = '';
        if (row.length > 1 || row[0] !== '') yield row;
        row = [];
      } else field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    yield row;
  }
}

const SUBSIDY_KINDS = new Set([
  '완속보조금',
  '급속보조금',
  '브랜드사업(공단-완속)',
  '브랜드사업(공단-급속)',
  '브랜드사업(협회-완속)',
  '브랜드사업(협회-급속)',
]);

async function main() {
  const src = process.argv[2];
  if (!src) {
    console.error('사용법: node scripts/verify-charger-index.ts <기관충전소 CSV 경로>');
    process.exit(1);
  }

  /* 1) 샤드 합계 */
  let indexChargers = 0;
  let indexSubsidized = 0;
  let indexRecords = 0;
  let indexHistoryQty = 0;
  let pointers = 0;
  for (let i = 0; i < SHARD_COUNT; i += 1) {
    const shard = await load(i.toString(16).padStart(2, '0'));
    for (const bucket of Object.values(shard.k)) {
      for (const rec of Object.values(bucket)) {
        indexRecords += 1;
        indexChargers += rec.s + rec.f;
        indexSubsidized += rec.g;
        for (const row of rec.h) indexHistoryQty += row[2];
      }
    }
    pointers += Object.keys(shard.j).length;
  }

  /* 2) 원본 집계 + 조회 왕복 (1,000행마다 표본) */
  let header: string[] | null = null;
  let col: Record<string, number> = {};
  let rows = 0;
  let assignable = 0;
  let csvSubsidized = 0;
  const samples: Array<{ road: string; jibun: string }> = [];

  for await (const row of readCsvRows(src)) {
    if (!header) {
      header = row.map((h) => h.replace(/^﻿/, '').trim());
      col = Object.fromEntries(header.map((name, i) => [name, i]));
      continue;
    }
    rows += 1;
    const road = (row[col['도로명주소']] ?? '').trim();
    const jibun = (row[col['지번주소']] ?? '').trim();
    const ok =
      parseRoadAddress(road) ||
      parseRoadAddress(jibun) ||
      parseJibunAddress(jibun) ||
      parseJibunAddress(road);
    if (!ok) continue;
    assignable += 1;
    if (SUBSIDY_KINDS.has((row[col['보조금구분']] ?? '').trim())) csvSubsidized += 1;
    if (rows % 1000 === 0) samples.push({ road, jibun });
  }

  const verdicts = new Map<string, number>();
  const byPath = new Map<string, number>();
  const misses: string[] = [];
  for (const sample of samples) {
    const result = await lookupChargerHistory(sample, load);
    verdicts.set(result.status, (verdicts.get(result.status) ?? 0) + 1);
    if (result.status === '매칭') {
      byPath.set(result.by, (byPath.get(result.by) ?? 0) + 1);
    } else if (misses.length < 10) {
      misses.push(`${result.status}  ${sample.road}`);
    }
  }

  const num = (n: number) => n.toLocaleString('ko-KR');
  const mark = (a: number, b: number) => (a === b ? '일치' : `불일치 (차이 ${num(a - b)})`);

  console.log('— 합계 대조 —');
  console.log(`원본 행                 ${num(rows)}`);
  console.log(`주소를 붙일 수 있는 행  ${num(assignable)}`);
  console.log(`샤드의 충전기 대수      ${num(indexChargers)}  → ${mark(indexChargers, assignable)}`);
  console.log(`샤드의 이력 대수 합     ${num(indexHistoryQty)}  → ${mark(indexHistoryQty, assignable)}`);
  console.log(`원본 보조금 설치        ${num(csvSubsidized)}`);
  console.log(`샤드의 보조금 설치      ${num(indexSubsidized)}  → ${mark(indexSubsidized, csvSubsidized)}`);
  console.log(`기록 수 ${num(indexRecords)} · 지번 우회로 ${num(pointers)}`);

  console.log(`\n— 조회 왕복 (표본 ${num(samples.length)}건) —`);
  for (const [status, count] of [...verdicts].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(num(count)).padStart(6)}  ${status}`);
  }
  for (const [by, count] of [...byPath].sort((a, b) => b[1] - a[1])) {
    console.log(`          └ ${by} ${num(count)}`);
  }
  if (misses.length) {
    console.log('  못 찾은 예:');
    for (const miss of misses) console.log(`    ${miss}`);
  }

  /* 3) 예시 하나 자세히 */
  const example = await lookupChargerHistory(
    { road: '전남광주통합특별시 무안군 삼향읍 남악5로72번길 7', jibun: '' },
    load
  );
  console.log('\n— 예시 —');
  if (example.status === '매칭') {
    const s = summarize(example.record);
    console.log(`  ${regionText(example.regionKey)} / ${example.record.ad}`);
    console.log(`  ${example.record.nm.join(', ')} (${example.record.kd})`);
    console.log(
      `  판정 ${s.verdict} · 완속 ${s.slow} · 급속 ${s.fast} · 보조금 ${s.subsidized} · 자부담 ${s.ownFunded}`
    );
    console.log(`  신청연도 ${s.applyYears.join(', ') || '-'}`);
    console.log(`  운영기관 ${s.operators.map((o) => `${o.name} ${o.qty}`).join(' · ')}`);
    for (const [y, m, q, code, no, op, fast] of s.rows) {
      console.log(`    ${y}.${m || '--'}  ${q}기  ${code} ${no || '-'}  ${op}  ${fast ? '급속' : '완속'}`);
    }
  } else {
    console.log(`  ${example.status}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
