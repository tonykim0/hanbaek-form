'use client';

/**
 * 사진 → 스캔본 — 휴대폰으로 찍은 서류를 스캐너로 민 것처럼 만든다.
 *
 * ★왜 있는가★ 접수에서 「휴대폰 사진으로 보임」을 짚어 반려하게 만들었는데(lib/photo-check,
 * 2026-08-31), 반려당한 사람이 할 수 있는 일이 없었다 — 스캐너를 다시 찾아가는 것뿐이다.
 * 짚기만 하고 고칠 길을 안 주면 그 표는 잔소리가 된다. 이 화면이 그 길이다(한백 지시).
 *
 * ★서버를 쓰지 않는다.★ 전부 브라우저 캔버스에서 돈다 — 원본 사진이 우리 저장소로 갈
 * 이유가 없고(개인 책상·손이 같이 찍힌다), 판독 비용도 안 나가고, 무엇보다 네 점을
 * 끌면서 결과를 바로 볼 수 있다. 계산은 lib/scanify 가 하고 여기서는 그리고 받는다.
 *
 * 차례는 셋이다: 사진을 넣는다 → 네 점을 맞춘다(자동으로 잡아 두고 사람이 고친다) →
 * A4 PDF 로 받는다. 여러 장이면 한 묶음으로 나온다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import {
  estimateQuad, flatten, orderQuad, outputSize, warpToRect, type Bitmap, type Pt,
} from '@/lib/scanify';
import { useFileDragging } from '@/components/DocFiles';
import { useLeaveGuard } from '@/lib/use-leave-guard';
import { Btn, Choice, Err, PANEL } from '@/components/ui';

/** 한 장 — 원본 그림과 사람이 맞춘 네 점 */
interface Shot {
  id: string;
  name: string;
  /** 화면에 그릴 원본. 캔버스에 한 번 그려 두고 계속 쓴다 */
  bmp: Bitmap;
  quad: Pt[];
}

/**
 * 원본을 이만큼으로 줄여 들고 있는다.
 *
 * 요즘 휴대폰 사진은 4000×3000 이 예사인데, 그대로 두면 네 점을 끌 때마다 4천만 화소를
 * 다시 그린다 — 손가락을 따라오지 못한다. 스캔본으로 낼 해상도(150dpi A4 ≈ 1240×1754)
 * 보다 넉넉하면 화질에서 잃는 것이 없다.
 */
const WORK_MAX = 2000;

/**
 * Bitmap → ImageData.
 *
 * ★한 번 베낀다★ — ImageData 는 ArrayBuffer 로 뒷받침된 배열만 받는데(형이 그렇게 좁다),
 * 우리 Bitmap 은 어디서 왔는지 모르는 배열이다. 베끼지 않으면 형이 안 맞고, 억지로 맞추면
 * 브라우저에 따라 SharedArrayBuffer 가 들어와 조용히 깨질 자리를 남긴다.
 */
const asImageData = (b: Bitmap) =>
  new ImageData(new Uint8ClampedArray(b.data), b.width, b.height);

async function readShot(file: File): Promise<Shot> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`${file.name} 을(를) 읽지 못했습니다.`));
      el.src = url;
    });
    const scale = Math.min(1, WORK_MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d');
    if (!ctx) throw new Error('이 브라우저에서는 그림을 다룰 수 없습니다.');
    ctx.drawImage(img, 0, 0, w, h);
    const bmp = ctx.getImageData(0, 0, w, h) as unknown as Bitmap;
    return {
      id: `${file.name}-${file.size}-${Math.round(w * h)}`,
      name: file.name,
      bmp,
      quad: orderQuad(estimateQuad(bmp)),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Bitmap 을 캔버스에 그려 JPEG 로 짜낸다 — PDF 에 넣을 꼴 */
async function toJpeg(bmp: Bitmap, quality: number): Promise<Uint8Array> {
  const cv = document.createElement('canvas');
  cv.width = bmp.width;
  cv.height = bmp.height;
  const ctx = cv.getContext('2d');
  if (!ctx) throw new Error('이 브라우저에서는 그림을 다룰 수 없습니다.');
  ctx.putImageData(asImageData(bmp), 0, 0);
  const blob = await new Promise<Blob | null>((r) => cv.toBlob(r, 'image/jpeg', quality));
  if (!blob) throw new Error('그림을 만들지 못했습니다.');
  return new Uint8Array(await blob.arrayBuffer());
}

export default function PhotoScanner() {
  const [shots, setShots] = useState<Shot[]>([]);
  const [at, setAt] = useState(0);
  const [mono, setMono] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const dragging = useFileDragging();

  /* 만들다 만 것을 두고 나가면 다시 찍어야 한다 — 파일이 우리 쪽에 없다 */
  useLeaveGuard(
    shots.length > 0,
    '아직 스캔본을 내려받지 않았습니다. 이 페이지를 벗어나면 사라집니다 — 나가시겠습니까?'
  );

  const shot = shots[at] ?? null;

  const take = useCallback(async (files: FileList | null) => {
    const picked = [...(files ?? [])].filter((f) => f.type.startsWith('image/'));
    if (picked.length === 0) {
      setError('사진 파일(JPG·PNG·HEIC)을 넣어주세요 — PDF 는 이미 스캔본입니다.');
      return;
    }
    setError(null);
    setBusy(`사진 ${picked.length}장 읽는 중…`);
    try {
      const read: Shot[] = [];
      for (const f of picked) read.push(await readShot(f));
      setShots((prev) => {
        setAt(prev.length);
        return [...prev, ...read];
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }, []);

  const make = async () => {
    if (shots.length === 0) return;
    setError(null);
    setBusy('스캔본 만드는 중…');
    try {
      const pdf = await PDFDocument.create();
      for (const s of shots) {
        const size = outputSize(s.quad);
        const flat = flatten(warpToRect(s.bmp, s.quad, size.w, size.h), { mono });
        const jpg = await toJpeg(flat, 0.86);
        const img = await pdf.embedJpg(jpg);
        /* 종이 크기를 A4(포인트)로 못 박는다 — 장마다 크기가 다르면 인쇄가 어긋난다 */
        const [pw, ph] = size.w > size.h ? [841.89, 595.28] : [595.28, 841.89];
        const page = pdf.addPage([pw, ph]);
        page.drawImage(img, { x: 0, y: 0, width: pw, height: ph });
      }
      const bytes = await pdf.save();
      const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `스캔본_${shots.length}장.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const catchDrop = {
    onDragEnter: (e: React.DragEvent) => { e.preventDefault(); setOver(true); },
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setOver(true); },
    onDragLeave: (e: React.DragEvent) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      setOver(false);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setOver(false);
      if (busy) return;
      void take(e.dataTransfer.files);
    },
  };

  return (
    <div className="flex flex-col gap-5">
      {/* 넣는 자리 — 접수 화면의 ZIP 상자와 같은 꼴이다(상자째 누르고, 끌어다 놓는다) */}
      <label
        {...catchDrop}
        className={`relative block rounded-2xl border-2 border-dashed p-5 transition ${
          busy ? 'cursor-default opacity-60' : 'cursor-pointer'
        } ${over ? 'border-brand-500 bg-brand-50' : 'border-brand-300 bg-brand-50/40'}`}
      >
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          disabled={busy !== null}
          onChange={(e) => {
            const files = e.target.files;
            e.target.value = '';
            void take(files);
          }}
        />
        {dragging && !busy && (
          <div
            className={`absolute inset-0 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed text-small font-bold transition ${
              over ? 'border-brand-500 bg-brand-50/95 text-brand-800' : 'border-slate-300 bg-white/90 text-slate-500'
            }`}
          >
            여기에 사진을 놓기
          </div>
        )}
        <h2 className="text-base font-black tracking-[-0.02em] text-slate-900">사진 넣기</h2>
        <p className="mt-0.5 text-small leading-relaxed text-slate-500">
          찍은 서류 사진을 넣으면 종이만 잘라 반듯하게 펴고, 그림자를 걷어 스캔본처럼 만듭니다.
          여러 장을 넣으면 한 PDF 로 묶입니다.
        </p>
        <span className="mt-3 inline-flex items-center rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white">
          {busy ?? '사진 고르기 · 끌어다 놓기'}
        </span>
      </label>
      <Err className="block">{error}</Err>

      {shot && (
        <>
          <section className={`${PANEL} p-5`}>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <h2 className="text-h3 font-black text-slate-900">네 귀퉁이 맞추기</h2>
                <span className="text-small font-bold tabular-nums text-slate-400">
                  {at + 1}/{shots.length}
                </span>
                <span className="text-tiny text-slate-400">{shot.name}</span>
              </div>
              <Btn
                size="sm"
                kind="quiet"
                onClick={() => {
                  setShots((prev) => prev.filter((_, i) => i !== at));
                  setAt((i) => Math.max(0, i - 1));
                }}
              >
                이 장 빼기
              </Btn>
            </div>

            <QuadEditor
              shot={shot}
              onChange={(quad) => setShots((prev) => prev.map((s, i) => (i === at ? { ...s, quad } : s)))}
            />

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Btn size="sm" kind="side" disabled={at === 0} onClick={() => setAt((i) => i - 1)}>
                이전 장
              </Btn>
              <Btn
                size="sm"
                kind="side"
                disabled={at >= shots.length - 1}
                onClick={() => setAt((i) => i + 1)}
              >
                다음 장
              </Btn>
              <Btn
                size="sm"
                kind="quiet"
                className="ml-auto"
                onClick={() =>
                  setShots((prev) =>
                    prev.map((s, i) => (i === at ? { ...s, quad: orderQuad(estimateQuad(s.bmp)) } : s)))
                }
              >
                자동으로 다시 잡기
              </Btn>
            </div>
          </section>

          <section className={`${PANEL} p-5`}>
            <h2 className="mb-3 text-h3 font-black text-slate-900">만들기</h2>
            <div className="flex flex-wrap items-center gap-1.5">
              {/*
                도장·서명이 빨간 서류가 있다(한백 2026-08-31) — 흑백으로 만들면 인감인지
                구별이 안 된다. 기본은 흑백(스캐너 느낌)이고, 그런 서류만 색을 살린다.
              */}
              <Choice on={mono} onClick={() => setMono(true)}>흑백</Choice>
              <Choice on={!mono} onClick={() => setMono(false)}>색 살리기</Choice>
              <Btn className="ml-auto" busy={busy !== null} busyLabel={busy ?? '만드는 중…'} onClick={() => void make()}>
                A4 PDF 로 받기 · {shots.length}장
              </Btn>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/* ── 네 점 끌기 ───────────────────────────────────────────────────────────
 * 사진을 캔버스에 그리고 그 위에 점 넷과 이은 선을 얹는다.
 *
 * ★점은 SVG 로 얹는다★ — 캔버스에 같이 그리면 끌 때마다 사진까지 다시 그려야 하고,
 * 어느 점을 잡았는지 좌표로 따져야 한다. SVG 로 두면 브라우저가 잡아 준다.
 * 좌표는 원본 화소 기준으로 들고, 화면 크기는 viewBox 가 맞춘다 — 창을 줄여도
 * 점이 어긋나지 않는다.
 */
function QuadEditor({ shot, onChange }: { shot: Shot; onChange: (q: Pt[]) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [drag, setDrag] = useState<number | null>(null);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    cv.width = shot.bmp.width;
    cv.height = shot.bmp.height;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.putImageData(asImageData(shot.bmp), 0, 0);
  }, [shot]);

  const { width: W, height: H } = shot.bmp;
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    if (drag === null) return;
    const box = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * W;
    const y = ((e.clientY - box.top) / box.height) * H;
    /* 그림 밖으로는 못 나간다 — 나가면 편 결과에 흰 삼각형이 생긴다 */
    const p = { x: Math.max(0, Math.min(W, x)), y: Math.max(0, Math.min(H, y)) };
    onChange(shot.quad.map((q, i) => (i === drag ? p : q)));
  };

  return (
    <div className="relative overflow-hidden rounded-box border border-slate-200 bg-slate-50">
      <canvas ref={canvas} className="block w-full" />
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerMove={move}
        onPointerUp={() => setDrag(null)}
        onPointerLeave={() => setDrag(null)}
      >
        <polygon
          points={shot.quad.map((p) => `${p.x},${p.y}`).join(' ')}
          className="fill-brand-500/15 stroke-brand-500"
          strokeWidth={Math.max(2, W / 300)}
        />
        {shot.quad.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={Math.max(8, W / 60)}
            className={`cursor-grab ${drag === i ? 'fill-brand-600' : 'fill-white'} stroke-brand-600`}
            strokeWidth={Math.max(2, W / 300)}
            onPointerDown={(e) => {
              (e.target as Element).setPointerCapture?.(e.pointerId);
              setDrag(i);
            }}
          />
        ))}
      </svg>
    </div>
  );
}
