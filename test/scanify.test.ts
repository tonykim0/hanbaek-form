/**
 * 사진 → 스캔본의 계산 부분 — ★눈으로는 「좀 비뚤다」밖에 말할 수 없는 자리다.★
 *
 * 원근을 펴는 일과 네 점을 짐작하는 일은 결과가 그림이라, 틀려도 「그럴싸하게」 틀린다.
 * 그 「좀」이 쌓이면 왜 어긋났는지 짚을 데가 없어서, 아는 답이 있는 그림을 만들어 묶는다.
 */
import { describe, expect, it } from 'vitest';
import {
  applyHomography, estimateQuad, flatten, orderQuad, otsu, outputSize, quadArea,
  solveHomography, warpToRect, type Bitmap, type Pt,
} from '@/lib/scanify';

/** 단색 배경 위에 밝은 사각형 하나 — 종이 한 장을 흉내 낸다 */
function paperOn(W: number, H: number, rect: { x: number; y: number; w: number; h: number },
  bgLevel = 60, paperLevel = 230): Bitmap {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const inside = x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
      const v = inside ? paperLevel : bgLevel;
      const i = (y * W + x) * 4;
      data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
    }
  }
  return { width: W, height: H, data };
}

const at = (b: Bitmap, x: number, y: number) => b.data[(y * b.width + x) * 4];

describe('사영변환 — 네 점을 직사각형으로', () => {
  it('네 점을 정확히 옮긴다', () => {
    const from: Pt[] = [{ x: 10, y: 20 }, { x: 90, y: 12 }, { x: 96, y: 78 }, { x: 4, y: 70 }];
    const to: Pt[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    const h = solveHomography(from, to);
    from.forEach((p, i) => {
      const got = applyHomography(h, p.x, p.y);
      expect(got.x).toBeCloseTo(to[i].x, 6);
      expect(got.y).toBeCloseTo(to[i].y, 6);
    });
  });

  /* 기울지 않은 네 점이면 그냥 옮기고 늘리는 것과 같아야 한다 — 가장 흔한 경우다 */
  it('반듯한 네 점은 단순한 확대·이동이 된다', () => {
    const h = solveHomography(
      [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
      [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }]
    );
    const mid = applyHomography(h, 5, 5);
    expect(mid.x).toBeCloseTo(10, 6);
    expect(mid.y).toBeCloseTo(10, 6);
  });
});

describe('네 점 세우기 (orderQuad)', () => {
  /* 어느 점을 먼저 끌었든 좌상 → 우상 → 우하 → 좌하 여야 편 결과가 뒤집히지 않는다 */
  it('섞어 넣어도 좌상·우상·우하·좌하 순이다', () => {
    const q: Pt[] = [{ x: 90, y: 80 }, { x: 10, y: 10 }, { x: 8, y: 84 }, { x: 92, y: 6 }];
    expect(orderQuad(q)).toEqual([
      { x: 10, y: 10 }, { x: 92, y: 6 }, { x: 90, y: 80 }, { x: 8, y: 84 },
    ]);
  });
});

describe('원근 펴기 (warpToRect)', () => {
  it('종이만 남고 배경은 사라진다', () => {
    const src = paperOn(100, 100, { x: 20, y: 20, w: 60, h: 60 });
    const out = warpToRect(src, [
      { x: 20, y: 20 }, { x: 79, y: 20 }, { x: 79, y: 79 }, { x: 20, y: 79 },
    ], 30, 30);
    expect(out.width).toBe(30);
    /* 안쪽은 전부 종이 밝기다 — 배경(60)이 한 점이라도 섞이면 이 값이 내려간다 */
    expect(at(out, 15, 15)).toBeGreaterThan(220);
    expect(at(out, 1, 1)).toBeGreaterThan(220);
  });

  /* 종이 밖을 가리키면 검정이 아니라 흰색이다 — 검게 두면 사진 테두리처럼 보인다 */
  it('네 점이 그림 밖으로 나가면 그 자리는 흰색이다', () => {
    const src = paperOn(40, 40, { x: 0, y: 0, w: 40, h: 40 });
    const out = warpToRect(src, [
      { x: -20, y: -20 }, { x: 39, y: -20 }, { x: 39, y: 39 }, { x: -20, y: 39 },
    ], 20, 20);
    expect(at(out, 0, 0)).toBe(255);
  });
});

describe('네 귀퉁이 짐작 (estimateQuad)', () => {
  it('배경 위의 종이를 찾아낸다', () => {
    const q = orderQuad(estimateQuad(paperOn(200, 200, { x: 40, y: 30, w: 120, h: 140 })));
    /* 줄여서 보므로 몇 픽셀은 어긋난다 — 자리를 맞히는지만 본다 */
    expect(q[0].x).toBeGreaterThan(30); expect(q[0].x).toBeLessThan(50);
    expect(q[0].y).toBeGreaterThan(20); expect(q[0].y).toBeLessThan(40);
    expect(q[2].x).toBeGreaterThan(150); expect(q[2].x).toBeLessThan(170);
    expect(q[2].y).toBeGreaterThan(160); expect(q[2].y).toBeLessThan(180);
  });

  /*
   * ★못 찾겠으면 물러난다.★ 틀린 네 점은 없는 것보다 나쁘다 — 사람이 옮겨야 할 거리가
   * 더 멀어진다. 배경이 없는(전부 밝은) 그림이 그 자리다.
   */
  it('종이를 못 가리면 전체에서 5% 안쪽으로 물러난다', () => {
    const all = paperOn(200, 200, { x: 0, y: 0, w: 200, h: 200 });
    expect(orderQuad(estimateQuad(all))[0]).toEqual({ x: 10, y: 10 });
  });

  it('너무 작은 그림도 물러난다 — 줄일 자리가 없다', () => {
    expect(estimateQuad(paperOn(4, 4, { x: 1, y: 1, w: 2, h: 2 }))).toHaveLength(4);
  });
});

describe('밝기 가르기 (otsu)', () => {
  /*
   * 돌려주는 것은 ★첫 무리의 끝값★이다 — 부르는 쪽이 「> t」로 밝은 쪽을 고른다
   * (estimateQuad 가 그렇게 쓴다). 그래서 어두운 값 그 자체가 답일 수 있다.
   * 자리보다 ★가르는가★를 본다: 어두운 것은 다 t 이하, 밝은 것은 다 t 초과.
   */
  it('두 무리를 갈라 세운다', () => {
    const g = new Uint8Array(200);
    g.fill(50, 0, 100);
    g.fill(200, 100, 200);
    const t = otsu(g);
    expect(50).toBeLessThanOrEqual(t);
    expect(200).toBeGreaterThan(t);
  });

  it('한 가지 값뿐이면 가를 것이 없다 — 전부 한 무리다', () => {
    const flat = new Uint8Array(50).fill(120);
    expect(otsu(flat)).toBeLessThanOrEqual(120);
  });
});

describe('그림자 걷기 (flatten)', () => {
  /*
   * ★한쪽이 어두운 종이★ — 사진과 스캔본의 진짜 차이가 이것이다. 임계값 하나로 자르면
   * 어두운 쪽이 통째로 새까매진다. 배경으로 나누면 양쪽 다 흰 종이로 돌아와야 한다.
   */
  it('조명이 기운 흰 종이를 고르게 편다', () => {
    const W = 120;
    const H = 120;
    const data = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const v = 90 + (x / W) * 150; // 왼쪽 어둡고 오른쪽 밝은 흰 종이
        const i = (y * W + x) * 4;
        data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
      }
    }
    const out = flatten({ width: W, height: H, data }, { mono: true });
    expect(at(out, 8, 60)).toBeGreaterThan(200);
    expect(at(out, 110, 60)).toBeGreaterThan(200);
  });

  it('어두운 자리(글자)는 검게 남는다', () => {
    const src = paperOn(120, 120, { x: 50, y: 50, w: 8, h: 8 }, 235, 20); // 흰 바탕에 검은 획
    const out = flatten(src, { mono: true });
    expect(at(out, 54, 54)).toBeLessThan(60);
    expect(at(out, 5, 5)).toBeGreaterThan(200);
  });
});

describe('펼 크기 (outputSize)', () => {
  it('세로로 찍은 것은 세로 A4 비율이다', () => {
    const s = outputSize([{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 900 }, { x: 0, y: 900 }]);
    expect(s.h).toBeGreaterThan(s.w);
    expect(s.h / s.w).toBeCloseTo(297 / 210, 1);
  });

  it('가로로 찍은 것은 가로 A4 비율이다', () => {
    const s = outputSize([{ x: 0, y: 0 }, { x: 900, y: 0 }, { x: 900, y: 600 }, { x: 0, y: 600 }]);
    expect(s.w).toBeGreaterThan(s.h);
  });

  /* 원본보다 크게 펴 봐야 없는 화소를 지어낼 뿐이고 PDF 만 무거워진다 */
  it('원본보다 크게 펴지 않는다', () => {
    const s = outputSize([{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 420 }, { x: 0, y: 420 }]);
    expect(Math.max(s.w, s.h)).toBeLessThanOrEqual(420);
  });
});

describe('넓이 (quadArea)', () => {
  it('반듯한 사각형의 넓이를 센다', () => {
    expect(quadArea([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 0, y: 5 }])).toBe(50);
  });
});
