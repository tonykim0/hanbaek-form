/**
 * 올린 파일의 임자 — 판독 라우트 셋이 「내가 올린 것인가」를 묻는 근거.
 *
 * ★왜 있는가★ (감사 2026-09-04 H7·H8·H9)
 * 세 라우트(intake-zip · pdf-sort · import-form)가 클라이언트가 준 blobUrl 을 읽고,
 * 끝나면 ★반드시 지운다★. 그런데 검증이 「우리 호스트인가」뿐이었다 — 로그인한 계정이면
 * 우리 스토어의 임의 주소를 넣어 현장 서류 원본을 지울 수 있었고, 판독 비용도 남의
 * 파일에 쓰였다. 판정은 stagedPathnameOf 하나이고, 그것이 서는 근거가 ★경로에 계정이
 * 들어 있다★는 것이다. 경로를 서버가 만들지 않으면 이 판정이 통째로 무너진다.
 */
import { describe, expect, it } from 'vitest';
import { stagePrefix, stagedPathnameOf, STAGE_ROOT } from '@/lib/intake-stage';

const HOST = 'https://abc123.public.blob.vercel-storage.com';
const url = (pathname: string) => `${HOST}/${pathname}`;
const ME = 'ecoelec';

describe('stagedPathnameOf — 내가 올린 것만 통과한다', () => {
  /* 세 라우트가 토큰 발급 때 만드는 경로 — 하나라도 어긋나면 정상 흐름이 막힌다 */
  it('★라우트가 만드는 경로 넷이 다 통과한다★', () => {
    for (const name of ['zip-1757000000000.zip', 'sort-1757000000000.pdf',
      'sorted-1757000000000/계약서.pdf', 'form-import-1757000000000.pdf']) {
      expect(stagedPathnameOf(url(`${stagePrefix(ME)}/${name}`), ME), name).toBeTruthy();
    }
  });

  it('남의 임시본은 막는다 — 계정이 경로에 있어서 갈린다', () => {
    expect(stagedPathnameOf(url(`${stagePrefix('daesang')}/zip-1.zip`), ME)).toBeNull();
  });

  it('★현장 서류 원본은 막는다 — 지워지던 자리다★', () => {
    expect(stagedPathnameOf(url('projects/HB-2026-139/contract/계약서.pdf'), ME)).toBeNull();
    expect(stagedPathnameOf(url('materials/현대엔지니어링/양식.pdf'), ME)).toBeNull();
  });

  it('루트의 옛 form-import 경로는 막는다 — 계정이 없어 임자를 못 가린다', () => {
    expect(stagedPathnameOf(url('form-import-1757000000000.pdf'), ME)).toBeNull();
  });

  it('한글 파일명(퍼센트 인코딩)도 통과한다 — 실제로 오는 이름이다', () => {
    const name = encodeURIComponent('계약서 묶음.zip');
    expect(stagedPathnameOf(url(`${stagePrefix(ME)}/${name}`), ME)).toBeTruthy();
  });

  it('내 계정 이름으로 시작만 하는 남의 자리는 막는다 (ecoelec2)', () => {
    expect(stagedPathnameOf(url(`${STAGE_ROOT}/${ME}2/zip-1.zip`), ME)).toBeNull();
  });

  it('임시 뿌리 자체를 가리키는 주소는 막는다 — 파일이 아니다', () => {
    expect(stagedPathnameOf(url(stagePrefix(ME)), ME)).toBeNull();
  });

  /*
   * ★이 함수는 호스트를 안 본다 — 경로만 본다.★
   *
   * 남의 스토어 주소도 경로 모양만 맞으면 통과한다. 그래서 라우트가 ★두 문을 다★ 지나야
   * 한다: 먼저 우리 호스트인가(BLOB_HOST_RE), 그다음 내가 올린 것인가(이 함수).
   * 한쪽만 두면 그 사이로 빠진다 — 다음에 이 검사를 옮길 때 같이 옮겨야 하는 짝이다.
   */
  it('호스트는 안 본다 — 그 판정은 라우트가 따로 한다(짝을 잊지 말 것)', () => {
    expect(stagedPathnameOf('https://evil.example.com/intake-stage/ecoelec/a.zip', ME)).toBeTruthy();
  });

  it('주소가 아니면 null', () => {
    expect(stagedPathnameOf('그냥 글자', ME)).toBeNull();
  });
});
