/**
 * 스캔본인가 휴대폰 사진인가 — ★결정적인 부분만★ 묶는다.
 *
 * 이 판정에 AI 를 쓰지 않기로 한 이유가 곧 이 파일이 있는 이유다: 파일이 스스로 적어 둔
 * 사실(EXIF·페이지 크기)만 보므로 같은 입력이면 늘 같은 답이고, 그래서 시험으로 못 박힌다.
 */
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { cameraOf, isCameraRatio, paperOf, checkImagePhoto, checkPdfPhoto } from '@/lib/photo-check';

/** 최소한의 EXIF 를 만든다 — 「Exif\0\0」 + TIFF(LE) + IFD0(제조사·기종) */
function exifBuffer(make: string, model: string): Buffer {
  const HEAD = 38; // IFD0 뒤 데이터가 시작하는 자리(TIFF 헤더 기준)
  const makeBytes = Buffer.from(`${make}\0`, 'latin1');
  const modelBytes = Buffer.from(`${model}\0`, 'latin1');
  const tiff = Buffer.alloc(HEAD + makeBytes.length + modelBytes.length);

  tiff.write('II', 0, 'latin1');
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(2, 8); // 항목 둘

  const entry = (at: number, tag: number, len: number, dataAt: number) => {
    tiff.writeUInt16LE(tag, at);
    tiff.writeUInt16LE(2, at + 2); // ASCII
    tiff.writeUInt32LE(len, at + 4);
    tiff.writeUInt32LE(dataAt, at + 8);
  };
  entry(10, 0x010f, makeBytes.length, HEAD);
  entry(22, 0x0110, modelBytes.length, HEAD + makeBytes.length);
  tiff.writeUInt32LE(0, 34); // 다음 IFD 없음
  makeBytes.copy(tiff, HEAD);
  modelBytes.copy(tiff, HEAD + makeBytes.length);

  /* 앞에 JPEG 부스러기를 붙여 둔다 — 실제로는 PDF 한가운데에서 찾아야 한다 */
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x00]),
    Buffer.from('Exif\0\0', 'latin1'), tiff]);
}

describe('카메라 정보 — 사진이 스스로 적어 둔 사실', () => {
  it('제조사와 기종을 읽는다', () => {
    expect(cameraOf(exifBuffer('Apple', 'iPhone 15 Pro'))).toBe('Apple iPhone 15 Pro');
    expect(cameraOf(exifBuffer('samsung', 'SM-S928N'))).toBe('samsung SM-S928N');
  });

  /* 「Canon」 + 「Canon EOS」처럼 기종이 제조사를 이미 품는 일이 흔하다 */
  it('기종이 제조사로 시작하면 기종만 적는다', () => {
    expect(cameraOf(exifBuffer('Canon', 'Canon EOS R5'))).toBe('Canon EOS R5');
  });

  it('카메라 정보가 없으면 null — 스캐너는 이 칸을 안 쓴다', () => {
    expect(cameraOf(Buffer.from('%PDF-1.7 스캔본입니다', 'utf8'))).toBeNull();
    /* 「Exif」라는 글자만 우연히 있는 것으로는 안 잡는다 */
    expect(cameraOf(Buffer.from('Exif\0\0 그냥 글자', 'latin1'))).toBeNull();
  });

  it('이미지 파일도 같은 잣대로 본다', () => {
    expect(checkImagePhoto(exifBuffer('Apple', 'iPhone 15 Pro'))).toEqual({
      suspect: true, reasons: ['카메라 정보 — Apple iPhone 15 Pro'],
    });
    expect(checkImagePhoto(Buffer.from('스캔', 'utf8')).suspect).toBe(false);
  });
});

describe('페이지 규격 — 스캔은 용지로 나온다', () => {
  it('표준 용지를 알아본다 (세로·가로 무관)', () => {
    expect(paperOf(595.28, 841.89)).toBe('A4');
    expect(paperOf(841.89, 595.28)).toBe('A4');
    expect(paperOf(612, 792)).toBe('Letter');
    expect(paperOf(612, 1008)).toBe('Legal');
  });

  /* 스캐너마다 몇 포인트씩 어긋난다 — 그것으로 사진이라 부르면 안 된다 */
  it('몇 포인트 어긋난 A4 도 A4 다', () => {
    expect(paperOf(596, 842)).toBe('A4');
    expect(paperOf(595, 843)).toBe('A4');
  });

  it('사진을 감싼 페이지는 용지가 아니다', () => {
    expect(paperOf(3024, 4032)).toBeNull();
    expect(paperOf(1170, 2532)).toBeNull();
  });

  it('4:3 · 16:9 는 사진 비율이다', () => {
    expect(isCameraRatio(3024, 4032)).toBe(true);
    expect(isCameraRatio(4032, 3024)).toBe(true);
    expect(isCameraRatio(1080, 1920)).toBe(true);
  });

  /*
   * ★A4 가 사진 비율로 잡히면 이 검사는 통째로 못 쓴다.★ 1.414 와 1.333 은 6% 밖에 안
   * 떨어져 있어서, 여유를 조금만 넓혀도 모든 스캔이 사진이 된다. 이 시험이 그 경계를 지킨다.
   */
  it('A4·Letter 는 사진 비율이 아니다', () => {
    expect(isCameraRatio(595.28, 841.89)).toBe(false);
    expect(isCameraRatio(612, 792)).toBe(false);
    expect(isCameraRatio(612, 1008)).toBe(false);
  });
});

/*
 * 묶음 단위 판정 — 처음에는 「모든 페이지가 그럴 때만」으로 두었다가, A4 스캔 뒤에 사진
 * 한 장이 붙은 묶음을 통째로 놓치는 것을 보고 쪽 단위로 바꿨다. 그 경계를 여기서 지킨다.
 */
describe('PDF 한 묶음 — 쪽 단위로 센다', () => {
  const A4: [number, number] = [595.28, 841.89];
  const CAM: [number, number] = [3024, 4032];
  const pdfOf = async (sizes: Array<[number, number]>) => {
    const doc = await PDFDocument.create();
    for (const s of sizes) doc.addPage(s);
    return Buffer.from(await doc.save());
  };

  it('A4 스캔본은 통과한다', async () => {
    expect((await checkPdfPhoto(await pdfOf([A4, A4, A4, A4, A4]))).suspect).toBe(false);
  });

  it('사진 한 장은 잡는다', async () => {
    const r = await checkPdfPhoto(await pdfOf([CAM]));
    expect(r.suspect).toBe(true);
    expect(r.reasons[0]).toBe('페이지가 용지 규격이 아님 — 4:3 사진 비율');
  });

  /* 이걸 놓치는 것이 「모든 페이지」 규칙을 버린 이유다 */
  it('스캔 묶음에 사진이 한 장 섞여도 잡고, 몇 쪽인지 적는다', async () => {
    const r = await checkPdfPhoto(await pdfOf([A4, A4, A4, A4, CAM]));
    expect(r.suspect).toBe(true);
    expect(r.reasons[0]).toBe('5쪽 중 1쪽이 용지 규격이 아님 — 4:3 사진 비율');
  });

  it('용지가 섞인 스캔은 통과한다 — Letter·Legal 도 용지다', async () => {
    expect((await checkPdfPhoto(await pdfOf([[612, 792], [612, 1008]]))).suspect).toBe(false);
  });

  /* 비표준 크기만으로는 안 친다 — 재단한 스캔이 그렇다 */
  it('재단된 스캔은 통과한다', async () => {
    expect((await checkPdfPhoto(await pdfOf([[560, 800]]))).suspect).toBe(false);
  });

  it('못 읽는 PDF 는 판정하지 않는다 — 접수를 막지 않는다', async () => {
    expect((await checkPdfPhoto(Buffer.from('not a pdf'))).suspect).toBe(false);
  });
});
