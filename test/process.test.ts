/**
 * 공정 게이트 — 무엇이 있어야 다음 칸으로 가나.
 *
 * ★오늘(2026-08-27) 이 판정을 통째로 갈아엎었다(I 항목)★ — 그때는 임시 스크립트로 확인하고
 * 지웠다. 그 확인을 여기 항구화한다. 게이트는 화면과 서버가 같이 보는 유일한 판정이라,
 * 어긋나면 「단추는 활성인데 서버가 거절」이 된다.
 */
import { describe, expect, it } from 'vitest';
import {
  advanceBlockers, asProcessStatus, assertProcessWrite, canEnter, CHECK_ADVANCES,
  COURT_AFTER_STATUS, isHanbaekOnlyProcessField, statusIndex,
  canChangeContractDocs, CONTRACT_DOCS_LOCK_AT,
} from '@/lib/process';
import type { GateContext } from '@/lib/process';
import type { ProcessInfo, ProcessStatus } from '@/types/project';

/** 필요한 칸만 채운 공정 — 나머지는 비어 있는 현장이다 */
const P = (o: Record<string, unknown> = {}): ProcessInfo =>
  ({ docs: [], status: '행위신고', ...o }) as unknown as ProcessInfo;

/** 환경부 사업 — 승인일을 기다린다 */
const ENV: GateContext = { subsidized: true, powerType: '모자분리', bizType: '환경부' };
/** 자체투자·연동 — 환경부 승인도 대기번호도 없다 (한백 2026-08-28) */
const SELF: GateContext = { subsidized: false, powerType: '모자분리', bizType: '자체투자' };
const doc = (kind: string) => ({ kind, status: 'uploaded' });

describe('advanceBlockers — 진행 단추를 막는 것들', () => {
  it('행위신고: 아무것도 없으면 대상 여부부터 고르라고 한다', () => {
    expect(advanceBlockers('충전기 발주', 'notifyDoneAt', P(), ENV))
      .toEqual(['행위신고 대상 여부 선택', '환경부 승인일 (한백 입력)']);
  });

  it('행위신고: 대상을 고르면 신고일·파일을 묻는다', () => {
    expect(advanceBlockers('충전기 발주', 'notifyDoneAt', P({ notifyRequiredAt: '2026-08-27' }), ENV))
      .toEqual(['행위신고일', '신고 파일', '환경부 승인일 (한백 입력)']);
  });

  it('행위신고: 대상 아님 + 환경부 승인일이면 열린다', () => {
    expect(advanceBlockers('충전기 발주', 'notifySkippedAt',
      P({ notifySkippedAt: '2026-08-27', envApprovalDate: '2026-08-01' }), ENV)).toEqual([]);
  });

  it('★발주: 다섯 칸을 다 묻는다 — 모뎀 발주 수량이 빠졌던 자리다★', () => {
    expect(advanceBlockers('충전기 수령', null, P(), ENV)).toEqual([
      '충전기 발주일', '충전기 출고일', '충전기 모델', '충전기 발주 수량', '모뎀 발주 수량',
    ]);
  });

  it('발주: 수량이 0 이어도 「적었다」로 본다 — null 만 안 적은 것이다', () => {
    const p = P({
      chargerOrderDate: 'd', chargerShipDate: 'd', chargerModelId: 'm',
      chargerOrderQty: 0, modemOrderQty: 0,
    });
    expect(advanceBlockers('충전기 수령', null, p, ENV)).toEqual([]);
  });

  it('수령: 수령일만 있으면 수량 둘을 묻는다', () => {
    expect(advanceBlockers('착공', 'chargerDoneAt', P({ chargerRecvDate: 'd' }), ENV))
      .toEqual(['충전기 수령 수량', '모뎀 수령 수량']);
  });

  it('설치: 선언 조건이 먼저 오고, 게이트의 착공일이 뒤에 온다', () => {
    const p = P({ installDoneDate: 'd' });
    expect(advanceBlockers('설치완료', 'installConfirmedAt', p, ENV)).toEqual(['설치완료 사진', '착공일']);
  });

  it('★같은 말을 두 번 하지 않는다★ — 선언 조건과 게이트가 겹치면 한 번만', () => {
    const blockers = advanceBlockers('설치완료', 'installConfirmedAt', P(), ENV);
    expect(blockers.filter((b) => b === '설치완료 사진')).toHaveLength(1);
  });

  /*
   * 「개통완료」 칸을 걷으면서(한백 2026-08-31) 개통 조건이 준공서류 칸으로 옮겨 왔다.
   * ★조건을 같이 걷으면 개통도 안 한 현장이 준공서류로 넘어간다★ — 그래서 여기서 지킨다.
   */
  it('개통: 통신·개통 선언이 다 있어야 준공서류 칸이 열린다', () => {
    const done = P({ commDoneDate: 'd', openDate: 'd' });
    expect(advanceBlockers('준공서류 접수/검토', 'openDoneAt', done, ENV)).toEqual([]);
    const noComm = P({ openDate: 'd' });
    expect(advanceBlockers('준공서류 접수/검토', 'openDoneAt', noComm, ENV)).toEqual(['통신완료일']);
  });
});

describe('자체투자 — 환경부 승인이 없는 현장 (한백 2026-08-28)', () => {
  /*
   * 전남 무안 전남개발공사에서 나왔다 — 자체투자인데 「환경부 승인일 필요」로 행위신고에
   * 갇혀 있었다. 그때 프로덕션의 자체투자 17건 중 16건이 같은 자리에 서 있었다.
   * 없는 서류를 기다리게 두면 그 현장은 영원히 안 넘어간다.
   */
  it('대상 아님만 골라도 열린다 — 승인일을 묻지 않는다', () => {
    expect(advanceBlockers('충전기 발주', 'notifySkippedAt',
      P({ notifySkippedAt: '2026-08-28' }), SELF)).toEqual([]);
  });

  it('행위신고를 했으면 열린다 — 승인일 없이', () => {
    const p = P({ notifyRequiredAt: 'd', notifyDate: 'd', docs: [doc('notify')] });
    expect(advanceBlockers('충전기 발주', 'notifyDoneAt', p, SELF)).toEqual([]);
  });

  it('환경부 사업은 그대로 승인일을 묻는다 — 같은 현장 값, 사업구분만 다르다', () => {
    const p = P({ notifySkippedAt: '2026-08-28' });
    expect(advanceBlockers('충전기 발주', 'notifySkippedAt', p, SELF)).toEqual([]);
    expect(advanceBlockers('충전기 발주', 'notifySkippedAt', p, ENV)).toEqual(['환경부 승인일 (한백 입력)']);
  });

  it('서버도 같이 연다 — 화면만 열리면 눌렀을 때 거절된다', () => {
    const p = P({ status: '행위신고', notifySkippedAt: 'd' });
    expect(canEnter('충전기 발주', p, SELF)).toEqual({ ok: true });
    expect(canEnter('충전기 발주', p, ENV).ok).toBe(false);
  });
});

describe('canEnter — 서버가 막는 자리', () => {
  it('되돌리는 것은 언제나 열려 있다', () => {
    expect(canEnter('행위신고', P({ status: '착공' }), ENV)).toEqual({ ok: true });
  });

  it('★한 칸을 건너뛰면 지나치는 칸의 조건도 다 본다★', () => {
    const p = P({ status: '행위신고', envApprovalDate: 'd', notifySkippedAt: 'd' });
    const r = canEnter('착공', p, ENV);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.blockedBy).toMatch(/발주일/);
  });

  it('조건이 다 차면 다음 칸이 열린다', () => {
    const p = P({ status: '행위신고', envApprovalDate: 'd', notifySkippedAt: 'd' });
    expect(canEnter('충전기 발주', p, ENV)).toEqual({ ok: true });
  });

  it('막힌 이유는 사람이 읽는 말이다', () => {
    const r = canEnter('충전기 발주', P({ status: '행위신고' }), ENV);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.blockedBy).toBe('환경부 승인일 (한백 입력) · 행위신고 대상 여부');
  });
});

describe('완료 선언이 여는 칸 (CHECK_ADVANCES)', () => {
  it('선언마다 여는 칸이 하나씩 있다', () => {
    expect(CHECK_ADVANCES.notifyDoneAt).toBe('충전기 발주');
    expect(CHECK_ADVANCES.chargerDoneAt).toBe('착공');
    expect(CHECK_ADVANCES.installConfirmedAt).toBe('설치완료');
    /* 「개통완료」 칸을 걷었다 — 개통 선언이 곧바로 준공서류 칸을 연다(2026-08-31) */
    expect(CHECK_ADVANCES.openDoneAt).toBe('준공서류 접수/검토');
  });
});

describe('준공서류 제출 완료 — 세부 칸으로 본다 (2026-08-29 흐름 워크스루)', () => {
  const ALL = ['completeConfirm', 'costSurvey', 'safety', 'useInspect', 'asBuilt'];

  it('세부 칸이 다 차면 열린다 — 옛 「준공서류」 칸이 없어도', () => {
    const p = P({ status: '준공서류 접수/검토', docs: ALL.map(doc) });
    expect(advanceBlockers('준공완료', 'completionSubmitAt', p, ENV)).toEqual([]);
  });

  it('안 온 서류를 이름으로 말한다', () => {
    const p = P({ status: '준공서류 접수/검토', docs: [doc('completeConfirm'), doc('costSurvey')] });
    expect(advanceBlockers('준공완료', 'completionSubmitAt', p, ENV))
      .toEqual(['안전점검필증 (사용전점검필증)', '사용검사 필증', '준공도']);
  });

  /* 한전불입은 전기안전관리자 선임신고증명서를 더 받는다 — 모자분리는 선임 대상이 아니다 */
  it('한전불입 현장은 선임신고증명서까지 본다', () => {
    const p = P({ status: '준공서류 접수/검토', docs: ALL.map(doc) });
    const kepco: GateContext = { subsidized: true, powerType: '한전불입', bizType: '환경부' };
    expect(advanceBlockers('준공완료', 'completionSubmitAt', p, kepco))
      .toEqual(['전기안전관리자 선임신고증명서']);
  });

  /* 이관 현장은 준공서류를 한 칸에 냈다 — 그 파일이 있으면 세부 칸을 다시 받지 않는다 */
  it('옛 한 칸으로 낸 현장은 그것으로 갈음한다', () => {
    const p = P({ status: '준공서류 접수/검토', docs: [doc('completion')] });
    expect(advanceBlockers('준공완료', 'completionSubmitAt', p, ENV)).toEqual([]);
  });
});

describe('차례 (COURT_AFTER_STATUS)', () => {
  it('★발주는 한백, 수령부터 현장★ — 칸을 가른 이유가 이것이다', () => {
    expect(COURT_AFTER_STATUS['충전기 발주']).toBe('한백');
    expect(COURT_AFTER_STATUS['충전기 수령']).toBe('시공사');
  });

  it('모든 칸에 차례가 정해져 있다', () => {
    for (const [status, court] of Object.entries(COURT_AFTER_STATUS)) {
      expect(court, status).toBeTruthy();
    }
  });
});

describe('한백만 적는 칸', () => {
  it('발주 쪽은 한백, 수령 쪽은 현장이다', () => {
    expect(isHanbaekOnlyProcessField('chargerOrderDate')).toBe(true);
    expect(isHanbaekOnlyProcessField('chargerShipDate')).toBe(true);
    expect(isHanbaekOnlyProcessField('chargerOrderQty')).toBe(true);
    expect(isHanbaekOnlyProcessField('chargerModelId')).toBe(true);
    expect(isHanbaekOnlyProcessField('chargerRecvDate')).toBe(false);
    expect(isHanbaekOnlyProcessField('chargerQty')).toBe(false);
  });

  it('★서버가 화면과 같은 판정을 한다★ — 시공사가 발주일을 적으면 막힌다', () => {
    const 시공사 = { role: 'cons', org: '대광이브이' };
    expect(() => assertProcessWrite(시공사, '대광이브이', ['chargerRecvDate'])).not.toThrow();
    expect(() => assertProcessWrite(시공사, '대광이브이', ['chargerOrderDate'])).toThrow(/한백/);
  });

  it('남의 현장에는 아무것도 못 적는다', () => {
    expect(() => assertProcessWrite({ role: 'cons', org: '차저스랩' }, '대광이브이', ['chargerRecvDate']))
      .toThrow(/시공사만/);
  });

  it('한백 관리자는 전부 적는다', () => {
    expect(() => assertProcessWrite({ role: 'admin', org: null }, '대광이브이', ['chargerOrderDate']))
      .not.toThrow();
  });
});

describe('asProcessStatus — 옛 값이 남아 있어도 사라지지 않는다', () => {
  it('아는 값은 그대로', () => {
    expect(asProcessStatus('착공')).toBe('착공');
  });

  it('★모르는 값은 첫 칸으로★ — 어느 칸에도 없으면 화면에서 조용히 사라진다', () => {
    expect(asProcessStatus('시공진행필요')).toBe('계약완료');
    expect(asProcessStatus(null)).toBe('계약완료');
  });
});

describe('statusIndex — 칸 순서', () => {
  it('앞뒤를 견줄 수 있다', () => {
    const order: ProcessStatus[] = ['행위신고', '충전기 발주', '충전기 수령', '착공'];
    const idx = order.map(statusIndex);
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
  });
});

describe('canChangeContractDocs — 운영사에 낸 뒤로 계약 서류는 잠긴다', () => {
  it('낸 자리부터 협력사는 못 바꾼다', () => {
    expect(canChangeContractDocs('sales', CONTRACT_DOCS_LOCK_AT)).toBe(false);
    expect(canChangeContractDocs('cons', CONTRACT_DOCS_LOCK_AT)).toBe(false);
    expect(canChangeContractDocs('salesCons', CONTRACT_DOCS_LOCK_AT)).toBe(false);
  });

  it('★그 뒤 단계에서도 잠겨 있다★ — 낸 자리 한 칸만 막으면 다음 칸에서 다시 열린다', () => {
    for (const status of ['행위신고', '충전기 발주', '착공', '설치완료', '준공완료'] as const) {
      expect(canChangeContractDocs('sales', status)).toBe(false);
    }
  });

  it('내기 전에는 협력사도 바꾼다 — 반려된 서류를 다시 올리는 길이다', () => {
    expect(canChangeContractDocs('sales', '계약완료')).toBe(true);
  });

  it('★한백은 낸 뒤에도 바꾼다★ — 운영사가 반려해 다시 내는 길이 있어야 한다', () => {
    expect(canChangeContractDocs('admin', '준공완료')).toBe(true);
  });

  it('열람 전용은 언제나 못 바꾼다', () => {
    expect(canChangeContractDocs('viewer', '계약완료')).toBe(false);
  });
});

/*
 * ★반려는 언제든, 승인은 다 낸 뒤에★ (한백 지시 2026-08-31).
 *
 * 그전에는 준공보완에 들어가는 조건이 「준공서류 제출 완료」였다 — 잘못된 서류가 이미
 * 올라와 있어도 시공사가 다 냈다고 선언하기 전에는 한백이 돌려보낼 수 없었고, 선언을
 * 안 하고 두면 그대로 멈춰 있었다. 검수를 「예외를 걸러내는 방식」으로 둔 것과 어긋난다.
 */
describe('준공서류 반려 — 제출 완료 선언을 기다리지 않는다', () => {
  const 개통 = { commDoneDate: 'd', openDoneAt: 'd' };

  it('제출 완료 선언이 없어도 준공보완으로 내려보낼 수 있다', () => {
    expect(canEnter('준공보완', P({ status: '준공서류 접수/검토', ...개통 }), ENV).ok).toBe(true);
  });

  /* 개통 조건까지 걷지는 않는다 — 개통도 안 한 현장을 준공보완에 세울 이유가 없다 */
  it('개통이 안 끝났으면 준공보완도 막는다', () => {
    const before = canEnter('준공보완', P({ status: '설치완료' }), ENV);
    expect(before).toEqual({ ok: false, blockedBy: '통신완료일 · 개통 완료 선언' });
  });

  /* 승인 쪽은 그대로다 — 다 냈다는 선언 없이 준공으로 넘기면 빠진 서류가 묻힌다 */
  it('준공완료로 넘기려면 준공서류 제출 완료가 있어야 한다', () => {
    expect(advanceBlockers('준공완료', 'completionSubmitAt', P({ status: '준공서류 접수/검토' }), ENV))
      .not.toEqual([]);
  });
});
