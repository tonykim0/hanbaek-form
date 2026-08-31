/**
 * pdf.js 의 일꾼(worker) 파일을 public/ 으로 베낀다.
 *
 * ★번들러에 태우면 깨진다.★ `new URL('…pdf.worker.min.mjs', import.meta.url)` 로 가리키면
 * webpack 이 그것을 정적 자산으로 뽑아내는데, 그 파일이 ES 모듈인데도 Terser 가 일반
 * 스크립트로 보고 압축하려 든다 — 「'import', and 'export' cannot be used outside of
 * module code」로 빌드가 멈춘다(2026-08-31 실제로 겪었다).
 *
 * ★베끼는 쪽이 판을 붙들어 준다.★ public 에 한 번 커밋해 두면 pdfjs-dist 를 올릴 때마다
 * 사람이 같이 갱신해야 하고, 잊으면 API 와 일꾼의 판이 어긋나 「The API version does not
 * match the Worker version」이 난다. node_modules 에서 매번 베끼면 어긋날 수가 없다.
 *
 * npm 의 pre 훅이 부른다(predev·prebuild) — 부르는 것을 잊을 자리를 두지 않는다.
 * 베낀 파일은 git 에 넣지 않는다(.gitignore).
 */
import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const from = join(dirname(require.resolve('pdfjs-dist/package.json')), 'build', 'pdf.worker.min.mjs');
const to = join(process.cwd(), 'public', 'pdf.worker.min.mjs');

await mkdir(dirname(to), { recursive: true });
await copyFile(from, to);
console.log(`[pdf-worker] ${from} → public/pdf.worker.min.mjs`);
