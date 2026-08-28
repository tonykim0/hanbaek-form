/**
 * 한국 달력 — UTC 로 세면 자정~오전 9시가 하루 전이 된다(lib/date.ts 의 그 사고).
 * 러너가 도는지 확인하는 첫 파일이기도 하다.
 */
import { describe, expect, it } from 'vitest';
import { dayOf, daysSince, monthShift, stampOf, thisMonth, today } from '@/lib/date';

/** 한국 시각 t 를 UTC Date 로 — 테스트가 시간대에 안 흔들리게 직접 만든다 */
const kst = (iso: string) => new Date(Date.parse(`${iso}+09:00`));

describe('dayOf — 한국 달력 날짜', () => {
  it('한국 시각 오전 0시 5분은 그날이다 (UTC 로 세면 어제가 된다)', () => {
    expect(dayOf(kst('2026-08-28T00:05:00'))).toBe('2026-08-28');
  });

  it('한국 시각 23시 55분도 그날이다', () => {
    expect(dayOf(kst('2026-08-28T23:55:00'))).toBe('2026-08-28');
  });
});

describe('stampOf — 사람이 읽는 시각', () => {
  it('아홉 시간을 더해 한국 벽시계로 적는다', () => {
    expect(stampOf(kst('2026-08-20T16:00:00'))).toBe('2026-08-20 16:00');
  });
});

describe('thisMonth · monthShift', () => {
  it('이번 달은 YYYY-MM 이다', () => {
    expect(thisMonth(kst('2026-08-28T09:00:00'))).toBe('2026-08');
  });

  it('해를 넘어가도 센다', () => {
    expect(monthShift('2026-01', -1)).toBe('2025-12');
    expect(monthShift('2026-12', 1)).toBe('2027-01');
  });
});

describe('daysSince — 정체일', () => {
  it('같은 날은 0일이다', () => {
    expect(daysSince('2026-08-28', kst('2026-08-28T09:00:00'))).toBe(0);
  });

  it('오전 9시 전에도 하루가 덜 세지지 않는다', () => {
    expect(daysSince('2026-08-27', kst('2026-08-28T01:00:00'))).toBe(1);
  });

  it('미래 날짜는 음수가 아니라 0이다', () => {
    expect(daysSince('2026-09-01', kst('2026-08-28T09:00:00'))).toBe(0);
  });
});

describe('today', () => {
  it('dayOf 와 같은 값을 준다', () => {
    const at = kst('2026-08-28T02:00:00');
    expect(today(at)).toBe(dayOf(at));
  });
});
