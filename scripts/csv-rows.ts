/**
 * 인덱스 생성기들이 함께 쓰는 스트리밍 CSV 리더.
 *
 * 원본이 수백 MB라 한 번에 메모리에 올릴 수 없고, 「상세위치」처럼 쉼표가 들어간
 * 칸이 있어 단순 split 으로는 깨집니다. 따옴표로 감싼 필드(쉼표 · 줄바꿈 포함)를
 * 처리합니다.
 */

import { createReadStream } from 'node:fs';

export async function* readCsvRows(file: string): AsyncGenerator<string[]> {
  const stream = createReadStream(file, { encoding: 'utf8', highWaterMark: 1 << 20 });
  let field = '';
  let row: string[] = [];
  let quoted = false;
  let first = true;

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
        if (row.length > 1 || row[0] !== '') {
          if (first) {
            // UTF-8 BOM 제거
            row[0] = row[0].replace(/^﻿/, '');
            first = false;
          }
          yield row;
        }
        row = [];
      } else field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    yield row;
  }
}
