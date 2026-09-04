/**
 * 할 일에 뭐라고 적히는가 — ★칸 이름과 할 일은 다른 말이다.★
 *
 * 화면 테스트는 넣지 않지만 이 문구는 다르다: 목록에 「설치완료」라는 줄이 서면 무엇을
 * 하라는 것인지 알 수 없고, 그 사실은 그 칸에 현장이 하나 들어올 때까지 드러나지 않는다.
 * 실제로 「계약완료」에서 한 번 겪고 고쳤는데 「설치완료」가 그대로 남아 있었다(2026-09-04).
 */
import { describe, expect, it } from 'vitest';
import { whatOf } from '@/lib/todo-types';

const none = { rejectedDocs: 0, rejectedEmptyDocs: 0, docsFilled: true };

describe('계약보완 — 안 낸 것과 퇴짜 맞은 것을 가른다 (한백 승인 2026-09-04)', () => {
  it('전부 파일이 없으면 「제출」이라 적는다 — 낸 적 없는 협력사에게 「반려」는 거짓말이다', () => {
    expect(whatOf('계약보완', { rejectedDocs: 3, rejectedEmptyDocs: 3, docsFilled: false }))
      .toBe('미제출 3건 제출');
  });

  it('낸 것을 돌려받은 것만 있으면 「보완」이다', () => {
    expect(whatOf('계약보완', { rejectedDocs: 2, rejectedEmptyDocs: 0, docsFilled: true }))
      .toBe('반려 2건 보완');
  });

  it('섞이면 둘을 같이 적는다 — 한쪽만 적으면 나머지가 안 보인다', () => {
    expect(whatOf('계약보완', { rejectedDocs: 5, rejectedEmptyDocs: 2, docsFilled: false }))
      .toBe('반려 3건 보완 · 미제출 2건 제출');
  });
});

describe('칸 이름이 상태인 자리는 할 일로 바꿔 적는다', () => {
  it('설치완료 → 개통 및 통신확인 (한백 지시 2026-09-04)', () => {
    expect(whatOf('설치완료', none)).toBe('개통 및 통신확인');
  });

  it('계약완료 → 운영사에 계약서 제출 — 한백의 일이다', () => {
    expect(whatOf('계약완료', none)).toBe('운영사에 계약서 제출');
  });

  it('준공서류 접수/검토 → 준공서류 검수 — 「접수/검토」는 칸 이름이지 일이 아니다', () => {
    expect(whatOf('준공서류 접수/검토', none)).toBe('준공서류 검수');
  });
});

describe('칸 이름이 곧 시킬 일인 자리는 그대로 쓴다', () => {
  /* 넷 다 「무엇을 하라」로 읽힌다 — 굳이 다른 말로 옮기면 보드와 할 일이 갈린다 */
  it.each(['행위신고', '충전기 발주', '충전기 수령', '착공', '준공보완'] as const)(
    '%s',
    (column) => { expect(whatOf(column, none)).toBe(column); }
  );
});
