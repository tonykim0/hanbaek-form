/**
 * 사진을 스캔본처럼 — 이미지 계산만. [브라우저에서 돈다]
 *
 * ★왜 여기 갈라 두는가★ 화면(components/PhotoScanner)은 캔버스·드래그·PDF 만들기를 하고,
 * 이 파일은 ★그림 하나를 받아 그림 하나를 돌려주는 순수 함수★다. 그래서 시험으로 묶인다 —
 * 네 점을 정하는 일과 원근을 펴는 일은 눈으로 봐서는 「좀 비뚤다」밖에 말할 수 없고,
 * 그 「좀」이 쌓이면 왜 틀렸는지 짚을 자리가 없다.
 *
 * ★서버를 쓰지 않는 이유★ 원본 사진은 우리 저장소로 갈 이유가 없다. 브라우저에서 고쳐
 * PDF 로 받아 가면, 올리는 것은 이미 스캔본이 된 결과물뿐이다. 판독 비용도 안 나가고,
 * 사람이 결과를 보면서 네 점을 고칠 수 있다.
 *
 * 하는 일 넷 — 순서가 곧 이 파일의 차례다:
 *   ① estimateQuad  종이 네 귀퉁이를 짐작한다 (사람이 끌어 고치는 것이 전제다)
 *   ② warpToRect    그 네 점을 곧은 직사각형으로 편다 (원근 보정)
 *   ③ flatten       그림자·조명 얼룩을 걷고 대비를 올린다
 *   ④ (화면이) A4 PDF 로 묶는다
 *
 * DOM 의 ImageData 를 직접 받지 않고 Bitmap 으로 좁혀 받는다 — 시험이 브라우저 없이 돈다.
 */

export interface Pt { x: number; y: number }

/** ImageData 와 같은 모양 — 브라우저 밖에서도 만들 수 있다 */
export interface Bitmap {
  width: number;
  height: number;
  /** RGBA, 폭×높이×4 */
  data: Uint8ClampedArray;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/* ── ① 네 귀퉁이 ─────────────────────────────────────────────────────────
 * 종이는 보통 책상보다 밝다. 밝기로 두 무리를 가르고(Otsu), 밝은 쪽에서 네 방향의
 * 끝점을 집는다 — 기울어져 있어도 x+y·x−y 의 최대·최소가 곧 네 귀퉁이다.
 *
 * ★윤곽선을 찾지 않는다.★ 제대로 하려면 Canny·Hough 가 필요한데 그 무게를 브라우저에
 * 지고 들어올 만한 일이 아니다. 여기서 잡는 것은 ★출발점★이고, 맞추는 것은 사람이다
 * (한백 지시 2026-08-31 「자동 + 손으로 고침」). 그래서 틀렸을 때 조용히 이상해지지 않고,
 * 못 믿겠으면 통째로 물러난다(전체에서 5% 안쪽).
 */
export function estimateQuad(bmp: Bitmap): Pt[] {
  const { width: W, height: H } = bmp;
  const fallback = (): Pt[] => {
    const mx = W * 0.05;
    const my = H * 0.05;
    return [
      { x: mx, y: my }, { x: W - mx, y: my },
      { x: W - mx, y: H - my }, { x: mx, y: H - my },
    ];
  };
  if (W < 8 || H < 8) return fallback();

  /* 작게 줄여 본다 — 귀퉁이를 찾는 데 원본 해상도가 필요하지 않고, 잡티에도 덜 흔들린다 */
  const w = Math.min(160, W);
  const h = Math.max(1, Math.round((H * w) / W));
  const gray = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    const sy = Math.min(H - 1, Math.floor((y * H) / h));
    for (let x = 0; x < w; x += 1) {
      const sx = Math.min(W - 1, Math.floor((x * W) / w));
      const i = (sy * W + sx) * 4;
      gray[y * w + x] = (bmp.data[i] * 299 + bmp.data[i + 1] * 587 + bmp.data[i + 2] * 114) / 1000;
    }
  }

  const t = otsu(gray);
  /*
   * 밝은 쪽이 종이라고 본다. 너무 적거나(종이를 못 찾음) 거의 전부이면(배경도 밝다)
   * 짐작을 접는다 — 틀린 네 점은 없는 것보다 나쁘다. 사람이 옮겨야 할 거리가 더 멀어진다.
   */
  let bright = 0;
  for (let i = 0; i < gray.length; i += 1) if (gray[i] > t) bright += 1;
  const ratio = bright / gray.length;
  if (ratio < 0.15 || ratio > 0.98) return fallback();

  let tl = { x: 0, y: 0, s: Infinity };
  let br = { x: 0, y: 0, s: -Infinity };
  let tr = { x: 0, y: 0, s: -Infinity };
  let bl = { x: 0, y: 0, s: Infinity };
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (gray[y * w + x] <= t) continue;
      const sum = x + y;
      const dif = x - y;
      if (sum < tl.s) tl = { x, y, s: sum };
      if (sum > br.s) br = { x, y, s: sum };
      if (dif > tr.s) tr = { x, y, s: dif };
      if (dif < bl.s) bl = { x, y, s: dif };
    }
  }
  const sx = W / w;
  const sy = H / h;
  const out = [tl, tr, br, bl].map((p) => ({ x: p.x * sx, y: p.y * sy }));
  /* 찌그러진 결과(거의 선)는 안 쓴다 — 펴면 화면을 가득 채운 얼룩이 된다 */
  return quadArea(out) < W * H * 0.05 ? fallback() : out;
}

/** 두 무리를 가르는 밝기 — 반 사이의 흩어짐이 가장 작아지는 자리 */
export function otsu(gray: Uint8Array): number {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < gray.length; i += 1) hist[gray[i]] += 1;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i += 1) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let bestVar = -1;
  for (let i = 0; i < 256; i += 1) {
    wB += hist[i];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += i * hist[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const v = wB * wF * (mB - mF) * (mB - mF);
    if (v > bestVar) { bestVar = v; best = i; }
  }
  return best;
}

/** 네 점이 감싸는 넓이 — 신발끈 공식 */
export function quadArea(q: Pt[]): number {
  let a = 0;
  for (let i = 0; i < q.length; i += 1) {
    const j = (i + 1) % q.length;
    a += q[i].x * q[j].y - q[j].x * q[i].y;
  }
  return Math.abs(a) / 2;
}

/** 좌상 → 우상 → 우하 → 좌하 순으로 세운다 — 어느 점을 끌었든 순서가 같아야 편다 */
export function orderQuad(q: Pt[]): Pt[] {
  const bySum = [...q].sort((a, b) => a.x + a.y - (b.x + b.y));
  const byDif = [...q].sort((a, b) => a.x - a.y - (b.x - b.y));
  const tl = bySum[0];
  const br = bySum[3];
  const bl = byDif[0];
  const tr = byDif[3];
  return [tl, tr, br, bl];
}

/* ── ② 원근 펴기 ─────────────────────────────────────────────────────────
 * 네 점 → 직사각형의 사영변환(호모그래피)을 푼다. 여덟 개의 미지수라 8×8 을 세워
 * 소거법으로 푼다 — 라이브러리를 들이지 않는다(이 한 곳에서만 쓴다).
 */
export function solveHomography(from: Pt[], to: Pt[]): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    const { x, y } = from[i];
    const { x: u, y: v } = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const h = gauss(A, b);
  return [...h, 1];
}

/** 가우스 소거 — 부분 피벗까지만. 8×8 한 번이라 더 갖출 이유가 없다 */
function gauss(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c += 1) {
    let piv = c;
    for (let r = c + 1; r < n; r += 1) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    const d = M[c][c];
    if (Math.abs(d) < 1e-12) continue; // 겹친 점 — 못 푼다. 0 으로 두고 넘어간다
    for (let j = c; j <= n; j += 1) M[c][j] /= d;
    for (let r = 0; r < n; r += 1) {
      if (r === c) continue;
      const f = M[r][c];
      if (f === 0) continue;
      for (let j = c; j <= n; j += 1) M[r][j] -= f * M[c][j];
    }
  }
  return M.map((row) => row[n]);
}

export function applyHomography(h: number[], x: number, y: number): Pt {
  const d = h[6] * x + h[7] * y + h[8];
  const s = Math.abs(d) < 1e-12 ? 1e-12 : d;
  return { x: (h[0] * x + h[1] * y + h[2]) / s, y: (h[3] * x + h[4] * y + h[5]) / s };
}

/**
 * 네 점 안쪽을 w×h 직사각형으로 편다.
 *
 * ★거꾸로 민다★ — 결과 화소마다 원본의 어디에서 왔는지를 물어 값을 가져온다. 원본에서
 * 결과로 밀면 늘어난 자리에 구멍이 뚫린다(어느 결과 화소도 안 맞는 자리가 생긴다).
 * 값은 네 이웃을 섞어 뽑는다(쌍선형) — 안 섞으면 글자 획이 계단으로 부서진다.
 */
export function warpToRect(src: Bitmap, quad: Pt[], w: number, h: number): Bitmap {
  const q = orderQuad(quad);
  const dst: Pt[] = [{ x: 0, y: 0 }, { x: w - 1, y: 0 }, { x: w - 1, y: h - 1 }, { x: 0, y: h - 1 }];
  const inv = solveHomography(dst, q); // 결과 → 원본
  const out = new Uint8ClampedArray(w * h * 4);
  const { width: W, height: H, data } = src;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const p = applyHomography(inv, x, y);
      const o = (y * w + x) * 4;
      if (p.x < 0 || p.y < 0 || p.x > W - 1 || p.y > H - 1) {
        /* 종이 밖은 흰색이다 — 검게 두면 스캔본이 아니라 사진의 테두리처럼 보인다 */
        out[o] = 255; out[o + 1] = 255; out[o + 2] = 255; out[o + 3] = 255;
        continue;
      }
      const x0 = Math.floor(p.x);
      const y0 = Math.floor(p.y);
      const x1 = Math.min(W - 1, x0 + 1);
      const y1 = Math.min(H - 1, y0 + 1);
      const fx = p.x - x0;
      const fy = p.y - y0;
      for (let c = 0; c < 3; c += 1) {
        const a = data[(y0 * W + x0) * 4 + c] * (1 - fx) + data[(y0 * W + x1) * 4 + c] * fx;
        const b = data[(y1 * W + x0) * 4 + c] * (1 - fx) + data[(y1 * W + x1) * 4 + c] * fx;
        out[o + c] = a * (1 - fy) + b * fy;
      }
      out[o + 3] = 255;
    }
  }
  return { width: w, height: h, data: out };
}

/* ── ③ 그림자 걷고 대비 올리기 ───────────────────────────────────────────
 * 사진과 스캔본의 진짜 차이는 기울기가 아니라 ★조명★이다. 한쪽이 어둡고 손 그림자가
 * 지고 종이 바탕이 회색이다. 그래서 배경(조명)을 따로 재서 나눈다:
 *
 *   결과 = 화소 ÷ 그 자리의 배경 밝기
 *
 * 배경은 아주 흐리게 뭉갠 자기 자신이다(크게 줄였다 다시 늘린다). 글자는 작아서 뭉개면
 * 사라지고 조명만 남는다 — 그 조명으로 나누면 어두운 구석도 흰 종이로 돌아온다.
 * 임계값 하나로 자르지 않는 이유가 이것이다: 한 장 안에서 밝기가 달라 어느 값을 잡아도
 * 한쪽은 새까매지고 한쪽은 하얘진다.
 */
export function flatten(src: Bitmap, opts: { mono: boolean }): Bitmap {
  const { width: W, height: H, data } = src;
  const out = new Uint8ClampedArray(data.length);

  /* 배경 — 긴 변의 1/12 만큼 뭉갠다. 글자보다 훨씬 크고 그림자보다는 작다 */
  const bw = Math.max(2, Math.round(W / 12));
  const bh = Math.max(2, Math.round(H / 12));
  const bg = downUp(src, bw, bh);

  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c += 1) {
      const b = Math.max(24, bg.data[i + c]); // 배경이 0 에 가까우면 나눗셈이 폭발한다
      out[i + c] = clamp((data[i + c] * 255) / b, 0, 255);
    }
    out[i + 3] = 255;
  }

  if (opts.mono) {
    /*
     * 흑백 — 회색으로 만든 뒤 흰 쪽과 검은 쪽을 벌린다(레벨 보정). 딱 잘라 두 색으로
     * 만들지 않는다: 획의 가장자리가 톱니로 부서져 작은 글자가 뭉개진다.
     */
    for (let i = 0; i < out.length; i += 4) {
      const g = (out[i] * 299 + out[i + 1] * 587 + out[i + 2] * 114) / 1000;
      const v = clamp(((g - 120) * 255) / (205 - 120), 0, 255);
      out[i] = v; out[i + 1] = v; out[i + 2] = v;
    }
  } else {
    /*
     * 색 살리기 — 도장·서명이 빨간 서류가 있다(한백 2026-08-31). 나눗셈으로 이미 바탕이
     * 희어졌으니 여기서는 색만 조금 살린다. 많이 올리면 종이 누런빛까지 같이 살아난다.
     */
    for (let i = 0; i < out.length; i += 4) {
      const g = (out[i] * 299 + out[i + 1] * 587 + out[i + 2] * 114) / 1000;
      for (let c = 0; c < 3; c += 1) out[i + c] = clamp(g + (out[i + c] - g) * 1.35, 0, 255);
    }
  }
  return { width: W, height: H, data: out };
}

/** 작게 줄였다 다시 늘린다 — 큰 흐림의 값싼 대용이다(가우시안을 돌릴 이유가 없다) */
function downUp(src: Bitmap, w: number, h: number): Bitmap {
  const { width: W, height: H, data } = src;
  const small = new Float32Array(w * h * 3);
  const count = new Float32Array(w * h);
  for (let y = 0; y < H; y += 1) {
    const ty = Math.min(h - 1, Math.floor((y * h) / H));
    for (let x = 0; x < W; x += 1) {
      const tx = Math.min(w - 1, Math.floor((x * w) / W));
      const s = (ty * w + tx) * 3;
      const i = (y * W + x) * 4;
      small[s] += data[i]; small[s + 1] += data[i + 1]; small[s + 2] += data[i + 2];
      count[ty * w + tx] += 1;
    }
  }
  for (let i = 0; i < w * h; i += 1) {
    const n = Math.max(1, count[i]);
    small[i * 3] /= n; small[i * 3 + 1] /= n; small[i * 3 + 2] /= n;
  }

  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y += 1) {
    const fy = clamp((y * h) / H - 0.5, 0, h - 1);
    const y0 = Math.floor(fy);
    const y1 = Math.min(h - 1, y0 + 1);
    const wy = fy - y0;
    for (let x = 0; x < W; x += 1) {
      const fx = clamp((x * w) / W - 0.5, 0, w - 1);
      const x0 = Math.floor(fx);
      const x1 = Math.min(w - 1, x0 + 1);
      const wx = fx - x0;
      const o = (y * W + x) * 4;
      for (let c = 0; c < 3; c += 1) {
        const a = small[(y0 * w + x0) * 3 + c] * (1 - wx) + small[(y0 * w + x1) * 3 + c] * wx;
        const b = small[(y1 * w + x0) * 3 + c] * (1 - wx) + small[(y1 * w + x1) * 3 + c] * wx;
        out[o + c] = a * (1 - wy) + b * wy;
      }
      out[o + 3] = 255;
    }
  }
  return { width: W, height: H, data: out };
}

/**
 * 펼 크기 — A4 비율(1:√2)에 맞추되 네 점이 그린 실제 크기를 넘지 않는다.
 * 원본보다 크게 펴 봐야 없는 화소를 지어낼 뿐이고, PDF 만 무거워진다.
 */
export function outputSize(quad: Pt[], dpi = 150): { w: number; h: number } {
  const q = orderQuad(quad);
  const len = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
  const wide = Math.max(len(q[0], q[1]), len(q[3], q[2]));
  const tall = Math.max(len(q[0], q[3]), len(q[1], q[2]));
  /* 가로로 찍은 서류도 있다 — 긴 쪽을 A4 의 긴 쪽에 맞춘다 */
  const landscape = wide > tall;
  const longPx = Math.round((dpi * 297) / 25.4);
  const shortPx = Math.round((dpi * 210) / 25.4);
  const cap = Math.max(wide, tall);
  const scale = Math.min(1, cap / longPx);
  const L = Math.max(200, Math.round(longPx * scale));
  const S = Math.max(140, Math.round(shortPx * scale));
  return landscape ? { w: L, h: S } : { w: S, h: L };
}
