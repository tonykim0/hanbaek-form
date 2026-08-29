/**
 * 자료실 보관 자리 — 옛 자료가 어디로 가나.
 *
 * ★지켜야 하는 불변식 하나★: 보관 경로는 자료실 목록의 접두사(`materials/`)와 겹치지
 * 않는다. 겹치면 협력사 화면에 같은 자료가 옛 본까지 줄줄이 뜨고, 어느 것이 최신인지
 * 알 수 없게 된다. 목록은 그 접두사로만 훑으므로(lib/materials 의 list) 이 한 글자
 * 차이가 화면을 가른다.
 */
import { describe, expect, it } from 'vitest';
import {
  archivePathOf, archiveStamp, MATERIALS_ARCHIVE_PREFIX, MATERIALS_PREFIX,
} from '@/lib/materials-meta';

describe('archivePathOf — 옛 자료가 옮겨 갈 자리', () => {
  const src = 'materials/sk/sales/제안서 v1.9.pdf';

  it('원래 경로를 그대로 품는다 — 되돌릴 곳이 경로에 적혀 있어야 한다', () => {
    expect(archivePathOf(src, '20260829-130455'))
      .toBe('materials-archive/materials/sk/sales/제안서 v1.9.pdf/20260829-130455.pdf');
  });

  it('★보관 경로는 자료실 목록에 안 걸린다★ — 접두사가 겹치면 옛 본이 화면에 뜬다', () => {
    const kept = archivePathOf(src, '20260829-130455');
    expect(kept.startsWith(MATERIALS_PREFIX)).toBe(false);
    expect(kept.startsWith(MATERIALS_ARCHIVE_PREFIX)).toBe(true);
  });

  it('확장자를 붙여 둔다 — 보관본도 눌러서 열려야 한다', () => {
    expect(archivePathOf('materials/hec/corp/사업자등록증.pdf', '20260101-000000')).toMatch(/\.pdf$/);
    expect(archivePathOf('materials/sk/install/준공서류.zip', '20260101-000000')).toMatch(/\.zip$/);
  });

  it('확장자가 없으면 안 붙인다 — 없는 것을 만들지 않는다', () => {
    expect(archivePathOf('materials/sk/sales/README', '20260101-000000'))
      .toBe('materials-archive/materials/sk/sales/README/20260101-000000');
  });

  it('같은 자료를 두 번 밀어내도 서로 덮지 않는다 — 시각이 다르면 자리가 다르다', () => {
    expect(archivePathOf(src, '20260829-130455')).not.toBe(archivePathOf(src, '20260829-130456'));
  });
});

describe('archiveStamp — 서울 달력으로 센다', () => {
  it('UTC 자정 무렵에 날짜가 밀리지 않는다', () => {
    /* 2026-08-29 20:00Z = 서울 2026-08-30 05:00 — UTC 로 세면 하루 전으로 적힌다 */
    expect(archiveStamp(new Date('2026-08-29T20:00:00Z'))).toBe('20260830-050000');
  });

  it('두 자리로 맞춘다 — 이름이 정렬되어야 한다', () => {
    expect(archiveStamp(new Date('2026-01-02T00:04:05Z'))).toBe('20260102-090405');
  });
});
