/**
 * 방향 감지가 아직 맞는지 재본다 (손으로 부르는 검사 — API 를 부르므로 돈이 든다).
 *
 *   npx tsx scripts/check-orient.ts <스캔.pdf> [반복횟수]
 *
 * 준 PDF 를 네 방향으로 돌려 놓고 lib/pdf-orient 가 그것을 되세우는지 본다.
 * 넣은 각도와 되세운 각도의 합이 360°(=0°) 여야 통과다.
 *
 * ★왜 스크립트로 남기는가★ 판독은 모델이 하는 일이라 모델이 바뀌면 조용히 나빠진다.
 * 「한 번 됐다」는 검증이 아니므로, 의심되면 이걸 두세 번 돌려 본다. 시료는 실제
 * 스캔본(글자 없는 이미지 PDF)이어야 한다 — 글자가 있는 PDF 는 뒤집혀도 읽힌다.
 *
 * npm run check 에 넣지 않는다: 호출 비용이 있고 15쪽 시료로 한 번에 1분쯤 걸린다.
 */
import { readFileSync } from 'fs';
import { PDFDocument, degrees } from 'pdf-lib';
import { loadEnvFile } from '../lib/env-file';

loadEnvFile();

const file = process.argv[2];
const rounds = Number(process.argv[3]) || 1;
if (!file) throw new Error('스캔 PDF 경로를 주세요');

/** 모든 페이지를 같은 각도로 돌려 「거꾸로 스캔된 묶음」을 만든다 */
async function rotateAll(pdf: Buffer, angle: number): Promise<Buffer> {
  const doc = await PDFDocument.load(pdf, { ignoreEncryption: true });
  for (const page of doc.getPages()) {
    page.setRotation(degrees(((page.getRotation().angle + angle) % 360 + 360) % 360));
  }
  return Buffer.from(await doc.save());
}

async function rotationsOf(pdf: Buffer): Promise<number[]> {
  const doc = await PDFDocument.load(pdf, { ignoreEncryption: true });
  return doc.getPages().map((p) => ((p.getRotation().angle % 360) + 360) % 360);
}

async function main() {
  const { uprightPdf } = await import('../lib/pdf-orient');
  const src = readFileSync(file!);
  const before = await rotationsOf(src);
  console.log(`시료 ${file} · ${before.length}쪽 · 원래 회전 ${JSON.stringify([...new Set(before)])}`);

  let failed = 0;
  for (let round = 1; round <= rounds; round++) {
    for (const angle of [0, 90, 180, 270]) {
      const skewed = await rotateAll(src, angle);
      const t = Date.now();
      const fixed = await uprightPdf(skewed, 'check-orient');
      const got = await rotationsOf(fixed);
      // 돌려 넣었으니 원래 회전값으로 되돌아와야 한다 (시료가 바로 선 스캔이라는 전제)
      const wrong = got.map((g, i) => (g === before[i] ? null : `${i + 1}p:${g}`)).filter(Boolean);
      failed += wrong.length;
      console.log(
        `#${round} ${String(angle).padStart(3)}° 넣음 → ${((Date.now() - t) / 1000).toFixed(1)}s · `
        + (wrong.length ? `★틀림 ${wrong.length}/${got.length}★ ${wrong.join(' ')}` : `${got.length}쪽 전부 바로 세움`)
      );
    }
  }
  console.log(failed === 0 ? '통과' : `실패 — 틀린 페이지 ${failed}개`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
