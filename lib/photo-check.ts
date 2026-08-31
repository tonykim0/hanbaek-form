/**
 * 스캔본인가, 휴대폰으로 찍은 사진인가 — 접수 파일을 결정적으로 가린다.
 *
 * ★왜 필요한가★ 카메라로 찍은 서류는 기울고, 그림자가 지고, 가장자리가 잘린다. 판독이
 * 틀리는 것은 그 다음 문제이고, 애초에 운영사에 낼 수 없는 서류다 — 그래서 받는 자리에서
 * 짚어 반려해야 한다(한백 2026-08-31 「휴대폰 카메라로 찍은 사진같으면 반려 필요」).
 *
 * ★AI 에게 묻지 않는다.★ 「이거 사진인가요」는 비결정적이고, 틀린 지적은 없는 것보다
 * 나쁘다 — 멀쩡한 스캔을 반려하게 만든다(접수 검수를 껐던 이유가 그것이다). 대신 파일이
 * 스스로 들고 있는 두 가지 사실만 본다. 둘 다 사람이 눈으로 검산할 수 있다.
 *
 *   ① ★카메라 정보(EXIF)★ — 휴대폰이 찍은 JPEG 에는 제조사·기종이 박힌다. PDF 안에
 *      그대로 실려 오므로 버퍼에서 찾아 읽는다. 「Apple iPhone 15 Pro」가 나오면 그것은
 *      추측이 아니라 그 파일이 적어 둔 사실이다. 스캐너는 이 칸을 안 쓰거나 제 기종을 쓴다.
 *   ② ★페이지 규격★ — 스캔은 A4·Letter 같은 용지 크기로 나온다. 사진을 PDF 로 감싸면
 *      센서 비율(4:3·3:4)이 그대로 페이지가 된다. 그래서 「표준 용지가 아니다」와
 *      「사진 비율이다」가 함께 성립할 때만 신호로 친다 — 둘 중 하나만으로는 약하다
 *      (재단된 스캔도 비표준 크기가 되고, A4 는 1.41 이라 4:3 과 6% 밖에 안 떨어져 있다).
 *
 * ★막지 않는다. 짚어만 준다.★ 스캔 앱(Adobe Scan 등)으로 보정한 것은 카메라로 찍었어도
 * 쓸 만한 서류일 수 있고, 그 판단은 한백의 것이다. 접수는 그대로 되고 서류 칸에 표가
 * 붙는다 — 반려는 사람이 누른다(서류 검수를 「반려만 한다」로 만든 것과 같은 이유).
 *
 * 서버 전용(Buffer).
 */
import { PDFDocument } from 'pdf-lib';

export interface PhotoCheck {
  /** 휴대폰 사진으로 보이는가 */
  suspect: boolean;
  /** 왜 그렇게 보는가 — 그대로 화면에 적는다(사람이 검산할 수 있는 사실만) */
  reasons: string[];
}

const OK: PhotoCheck = { suspect: false, reasons: [] };

/* ── ① 카메라로 찍었다는 증거 ───────────────────────────────────────────
 * JPEG 의 EXIF 는 APP1 마커 안에 「Exif\0\0」 + TIFF 헤더로 들어 있다. PDF 는 JPEG 를
 * DCTDecode 스트림으로 ★그대로★ 품으므로(재압축하지 않는다) 버퍼에서 그 표지를 찾으면 된다.
 *
 * ★제조사·기종이 있다고 카메라가 아니다 (한백 지적 2026-08-31).★ 처음에는 Make/Model 이
 * 있으면 사진으로 봤는데, 계약서류가 거의 다 「카메라 정보 — Canon」으로 잡혔다.
 * ★Canon 은 복합기다★ — imageRUNNER 같은 사무용 스캐너가 스캔한 JPEG 에 제 이름을
 * 그대로 박는다. 스캐너는 이 칸을 안 쓴다는 전제가 틀렸다.
 *
 * 그래서 ★브랜드가 아니라 구조로 가른다.★ 이름 목록(iPhone·SM-·Pixel…)으로 막는 길은
 * 늘 새 기종에 뚫리고, 반대로 새 복합기가 또 걸린다. 대신 ★카메라만 적는 칸★을 본다:
 *
 *   조리개(FNumber) · 셔터(ExposureTime) · 감도(ISO) · 초점거리(FocalLength) · 위치(GPS)
 *
 * 유리판에 대고 미는 스캐너에는 조리개도 셔터도 초점거리도 없다 — 있을 수가 없는 값이라
 * 안 적는다. 렌즈로 찍은 것에는 거의 언제나 있다. 이름은 사람에게 보여줄 때만 쓴다.
 *
 * 못 잡는 자리는 있다: 편집기로 다시 저장해 EXIF 가 통째로 날아간 사진. 그때는 두 번째
 * 신호(페이지 규격)가 받는다. ★놓치는 것이 멀쩡한 스캔을 반려하게 만드는 것보다 낫다.★
 */
const EXIF_MARK = Buffer.from('Exif\0\0', 'latin1');
const TAG_MAKE = 0x010f;
const TAG_MODEL = 0x0110;
/** IFD0 에서 갈라져 나가는 곳 */
const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
/** ★렌즈가 있어야 생기는 값들★ — 스캐너에는 있을 수가 없다 */
const LENS_TAGS = new Set([
  0x829a, // ExposureTime 셔터
  0x829d, // FNumber 조리개
  0x8827, // ISOSpeedRatings 감도
  0x920a, // FocalLength 초점거리
  0x9202, // ApertureValue
  0x9201, // ShutterSpeedValue
]);

/** EXIF 에 적힌 카메라 — ★렌즈로 찍은 증거가 있을 때만★ 이름을 돌려준다 */
export function cameraOf(buffer: Buffer): string | null {
  let from = 0;
  /* 파일 하나에 이미지가 여럿일 수 있다 — 하나라도 카메라 것이면 사진이 섞인 것이다 */
  for (let i = 0; i < 8; i += 1) {
    const at = buffer.indexOf(EXIF_MARK, from);
    if (at < 0) return null;
    const read = readExif(buffer, at + EXIF_MARK.length);
    if (read?.byLens) return read.name ?? '카메라';
    from = at + EXIF_MARK.length;
  }
  return null;
}

interface ExifRead {
  /** 사람에게 보여줄 이름 — 제조사·기종 */
  name: string | null;
  /** 렌즈로 찍은 증거가 있는가 */
  byLens: boolean;
}

/** TIFF 헤더가 tiff 위치에서 시작한다고 보고 읽는다 */
function readExif(buf: Buffer, tiff: number): ExifRead | null {
  if (tiff + 8 > buf.length) return null;
  const order = buf.toString('latin1', tiff, tiff + 2);
  const le = order === 'II';
  if (!le && order !== 'MM') return null;
  const u16 = (a: number) => (le ? buf.readUInt16LE(a) : buf.readUInt16BE(a));
  const u32 = (a: number) => (le ? buf.readUInt32LE(a) : buf.readUInt32BE(a));
  if (u16(tiff + 2) !== 42) return null;

  /** 한 IFD 의 항목을 훑는다 — { 태그: 항목 시작 위치 } */
  const walk = (offset: number): Map<number, number> | null => {
    const ifd = tiff + offset;
    if (ifd < 0 || ifd + 2 > buf.length) return null;
    const count = u16(ifd);
    // 터무니없는 개수는 EXIF 가 아니라 우연히 같은 글자가 나온 자리다
    if (count === 0 || count > 512) return null;
    const out = new Map<number, number>();
    for (let i = 0; i < count; i += 1) {
      const e = ifd + 2 + i * 12;
      if (e + 12 > buf.length) break;
      out.set(u16(e), e);
    }
    return out;
  };

  const ifd0 = walk(u32(tiff + 4));
  if (!ifd0) return null;

  /** ASCII 값을 읽는다 — 4바이트를 넘으면 값 자리에 오프셋이 들어 있다 */
  const ascii = (entry: number | undefined): string | null => {
    if (entry === undefined) return null;
    if (u16(entry + 2) !== 2) return null;
    const len = u32(entry + 4);
    if (len === 0 || len > 128) return null;
    const at = len <= 4 ? entry + 8 : tiff + u32(entry + 8);
    if (at < 0 || at + len > buf.length) return null;
    const text = buf.toString('latin1', at, at + len).replace(/\0.*$/, '').trim();
    return text || null;
  };

  const make = ascii(ifd0.get(TAG_MAKE));
  const model = ascii(ifd0.get(TAG_MODEL));
  const parts = [make, model].filter((v): v is string => Boolean(v));
  /* 「Canon」 + 「Canon EOS R5」처럼 기종이 제조사를 이미 품는 일이 흔하다 */
  const name = parts.length === 0
    ? null
    : model && make && model.toLowerCase().startsWith(make.toLowerCase())
      ? model
      : parts.join(' ');

  /* 위치가 박혀 있으면 들고 다니며 찍은 것이다 — 스캐너는 제자리에 있다 */
  let byLens = ifd0.has(TAG_GPS_IFD);
  if (!byLens) {
    const ptr = ifd0.get(TAG_EXIF_IFD);
    if (ptr !== undefined && u16(ptr + 2) === 4) {
      const sub = walk(u32(ptr + 8));
      if (sub) for (const tag of sub.keys()) if (LENS_TAGS.has(tag)) { byLens = true; break; }
    }
  }
  return { name, byLens };
}

/* ── ② 페이지 규격 ────────────────────────────────────────────────────────
 * 단위는 포인트(1/72 인치). 세로·가로 어느 쪽으로 놓였든 같은 용지로 본다.
 */
const PAPERS: ReadonlyArray<{ name: string; w: number; h: number }> = [
  { name: 'A4', w: 595.28, h: 841.89 },
  { name: 'Letter', w: 612, h: 792 },
  { name: 'Legal', w: 612, h: 1008 },
  { name: 'A3', w: 841.89, h: 1190.55 },
  { name: 'A5', w: 419.53, h: 595.28 },
  { name: 'B4', w: 708.66, h: 1000.63 },
  { name: 'B5', w: 498.9, h: 708.66 },
];
/** 스캐너마다 몇 포인트씩 어긋난다 — 2% 안이면 같은 용지로 본다 */
const PAPER_TOL = 0.02;
/** 휴대폰 센서 비율 — 4:3 과 16:9. 여기서 2% 안이면 사진 비율로 본다 */
const CAMERA_RATIOS = [4 / 3, 16 / 9];
const RATIO_TOL = 0.02;

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= b * tol;

export function paperOf(w: number, h: number): string | null {
  const long = Math.max(w, h);
  const short = Math.min(w, h);
  for (const p of PAPERS) {
    if (near(short, p.w, PAPER_TOL) && near(long, p.h, PAPER_TOL)) return p.name;
  }
  return null;
}

export function isCameraRatio(w: number, h: number): boolean {
  if (w <= 0 || h <= 0) return false;
  const r = Math.max(w, h) / Math.min(w, h);
  return CAMERA_RATIOS.some((c) => near(r, c, RATIO_TOL));
}

/** 「4:3」처럼 사람이 아는 이름으로 — 없으면 null */
function ratioLabel(w: number, h: number): string | null {
  if (w <= 0 || h <= 0) return null;
  const r = Math.max(w, h) / Math.min(w, h);
  if (near(r, 4 / 3, RATIO_TOL)) return '4:3';
  if (near(r, 16 / 9, RATIO_TOL)) return '16:9';
  return null;
}

/**
 * PDF 한 장을 본다. 판정을 못 하면 조용히 통과시킨다 —
 * 깨진 PDF 때문에 접수가 막히면 안 된다(방향 보정과 같은 규칙).
 */
export async function checkPdfPhoto(buffer: Buffer): Promise<PhotoCheck> {
  const reasons: string[] = [];

  const camera = cameraOf(buffer);
  if (camera) reasons.push(`카메라 정보 — ${camera}`);

  try {
    const pdf = await PDFDocument.load(buffer, { updateMetadata: false });
    const sizes = pdf.getPages().map((p) => p.getSize());
    /*
     * ★쪽 단위로 센다.★ 처음에는 「모든 페이지가 그럴 때만」으로 두었는데, 그러면 A4
     * 스캔 뒤에 사진 한 장이 붙은 묶음을 통째로 놓친다 — 한백이 확인하려던 것이 바로
     * 그런 파일이다. 한 쪽이라도 ①용지 규격이 아니고 ②사진 비율이면 짚는다.
     *
     * 둘을 함께 요구하는 것이 오탐을 막는 자리다: 재단된 스캔은 비표준이지만 사진
     * 비율이 아니고, A4 는 1.41 이라 4:3 에서 6% 떨어져 있어 비율에 안 걸린다.
     */
    const hits = sizes.filter((s) => paperOf(s.width, s.height) === null && isCameraRatio(s.width, s.height));
    if (hits.length > 0) {
      const label = ratioLabel(hits[0].width, hits[0].height) ?? '사진';
      reasons.push(
        sizes.length === 1
          ? `페이지가 용지 규격이 아님 — ${label} 사진 비율`
          : `${sizes.length}쪽 중 ${hits.length}쪽이 용지 규격이 아님 — ${label} 사진 비율`
      );
    }
  } catch {
    /* 못 읽는 PDF 는 판정하지 않는다 — 카메라 정보만으로 판단한다 */
  }

  return reasons.length > 0 ? { suspect: true, reasons } : OK;
}

/**
 * 이미지 파일(jpg·png)을 그대로 낸 경우 — EXIF 만 본다.
 * K-apt 스크린샷처럼 원래 이미지인 서류가 있으므로 부르는 쪽이 가려서 부른다.
 */
export function checkImagePhoto(buffer: Buffer): PhotoCheck {
  const camera = cameraOf(buffer);
  return camera ? { suspect: true, reasons: [`카메라 정보 — ${camera}`] } : OK;
}
