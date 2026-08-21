/**
 * 협력사 정보 저장소 — 계정마다 사업자등록증·정산 계좌.
 *
 * 지급(하도급 정산)에 쓰는 값이다. ★자기 것이거나 한백이거나★ — 협력사는 /settings 에서
 * 자기 것을 스스로 적고, 한백은 /admin/accounts 에서 전 계정을 고친다. 남의 계좌는
 * 저장소 계층에서 막는다 (redactForViewer 와 같은 원칙: 화면에서 가리는 것으로는 부족하다).
 *
 * 파일(사업자등록증·통장사본)은 Vercel Blob 에 있고 여기는 URL 만 둔다.
 * 파일 교체·삭제 시 이전 Blob 을 지우는 것은 라우트의 일이다 — 저장소는 이전 URL 을
 * 돌려줘서 그것을 가능하게만 한다.
 */
import { eq } from 'drizzle-orm';
import type { Actor } from './types';
import { getDb, hasDatabase } from '@/lib/db/client';
import { partnerDetails, users } from '@/lib/db/schema';
import { writeAudit } from '@/lib/db/audit';

export interface PartnerDetailsView {
  bizRegNo: string | null;
  bizCertUrl: string | null;
  bankName: string | null;
  bankAccountNo: string | null;
  bankHolder: string | null;
  bankbookUrl: string | null;
}

export type PartnerFileKind = 'bizCert' | 'bankbook';

export const FILE_KIND_LABEL: Record<PartnerFileKind, string> = {
  bizCert: '사업자등록증',
  bankbook: '통장사본',
};

const FIELD_LABEL = {
  bizRegNo: '사업자등록번호',
  bankName: '은행',
  bankAccountNo: '계좌번호',
  bankHolder: '예금주',
} as const;

type TextField = keyof typeof FIELD_LABEL;

/** 자기 것이거나 한백이거나. targetId 는 정규화된 id 여야 한다. */
function assertSelfOrAdmin(actor: Actor, targetId: string, what: string): void {
  if (actor.role === 'admin') return;
  if (actor.id.trim().toLowerCase() === targetId) return;
  throw new Error(`${what}는 본인 계정 것만 할 수 있습니다.`);
}

/** 협력사 계정인지 확인하고 정규화된 id 를 돌려준다. 관리자 계정에는 협력사 정보가 없다. */
async function requirePartnerAccount(loginId: string): Promise<string> {
  const id = loginId.trim().toLowerCase();
  const db = getDb();
  const [row] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!row) {
    throw new Error('DB 에 없는 계정입니다 — 배포 설정(AUTH_USERS)에 있는 계정에는 협력사 정보를 붙일 수 없습니다.');
  }
  if (row.role === 'admin') throw new Error('관리자 계정에는 협력사 정보를 두지 않습니다.');
  return id;
}

/** 한 계정의 협력사 정보. 자기 것이거나 한백이거나. */
export async function getPartnerDetails(
  loginId: string,
  actor: Actor
): Promise<PartnerDetailsView | null> {
  const id = loginId.trim().toLowerCase();
  assertSelfOrAdmin(actor, id, '협력사 정보 보기');
  if (!hasDatabase()) return null;
  const [r] = await getDb()
    .select()
    .from(partnerDetails)
    .where(eq(partnerDetails.userId, id))
    .limit(1);
  if (!r) return null;
  return {
    bizRegNo: r.bizRegNo,
    bizCertUrl: r.bizCertUrl,
    bankName: r.bankName,
    bankAccountNo: r.bankAccountNo,
    bankHolder: r.bankHolder,
    bankbookUrl: r.bankbookUrl,
  };
}

/** 계정별 협력사 정보 전체. [한백 전용] — 부르는 쪽이 확인한다. */
export async function listPartnerDetails(): Promise<Record<string, PartnerDetailsView>> {
  if (!hasDatabase()) return {};
  const rows = await getDb().select().from(partnerDetails);
  const map: Record<string, PartnerDetailsView> = {};
  for (const r of rows) {
    map[r.userId] = {
      bizRegNo: r.bizRegNo,
      bizCertUrl: r.bizCertUrl,
      bankName: r.bankName,
      bankAccountNo: r.bankAccountNo,
      bankHolder: r.bankHolder,
      bankbookUrl: r.bankbookUrl,
    };
  }
  return map;
}

/**
 * 글자 값(사업자등록번호·은행·계좌번호·예금주) 고치기. 자기 것이거나 한백이거나.
 * 안 보낸 값은 그대로 둔다. 빈 문자열은 지우는 것이다 — 잘못 넣은 값을 되돌릴 길 (화면 규칙 7).
 */
export async function savePartnerFields(
  loginId: string,
  patch: Partial<Record<TextField, string>>,
  actor: Actor
): Promise<void> {
  assertSelfOrAdmin(actor, loginId.trim().toLowerCase(), '협력사 정보 고치기');
  if (!hasDatabase()) throw new Error('저장소(DB)가 연결되지 않았습니다.');
  const id = await requirePartnerAccount(loginId);

  const next: Partial<Record<TextField, string | null>> = {};
  for (const field of Object.keys(FIELD_LABEL) as TextField[]) {
    const raw = patch[field];
    if (raw === undefined) continue;
    const value = raw.trim() || null;
    if (field === 'bizRegNo' && value) {
      const digits = value.replace(/\D/g, '');
      if (digits.length !== 10) throw new Error('사업자등록번호는 숫자 10자리여야 합니다.');
      next[field] = digits;
    } else {
      next[field] = value;
    }
  }
  if (Object.keys(next).length === 0) throw new Error('바꿀 값이 없습니다.');

  const db = getDb();
  const [before] = await db
    .select()
    .from(partnerDetails)
    .where(eq(partnerDetails.userId, id))
    .limit(1);

  await db
    .insert(partnerDetails)
    .values({ userId: id, ...next, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: partnerDetails.userId,
      set: { ...next, updatedAt: new Date() },
    });

  for (const [field, after] of Object.entries(next) as Array<[TextField, string | null]>) {
    const old = before?.[field] ?? null;
    if (old !== after) {
      await writeAudit(db, {
        projectId: null,
        actor,
        action: `협력사 정보 ${id}`,
        field: FIELD_LABEL[field],
        oldValue: old,
        newValue: after,
      });
    }
  }
}

/**
 * 파일(사업자등록증·통장사본) URL 지정·해제. 자기 것이거나 한백이거나.
 * 이전 URL 을 돌려준다 — 라우트가 그 Blob 을 지운다.
 */
export async function setPartnerFile(
  loginId: string,
  kind: PartnerFileKind,
  url: string | null,
  actor: Actor
): Promise<string | null> {
  assertSelfOrAdmin(actor, loginId.trim().toLowerCase(), '협력사 서류 올리기');
  if (!hasDatabase()) throw new Error('저장소(DB)가 연결되지 않았습니다.');
  const id = await requirePartnerAccount(loginId);
  const column = kind === 'bizCert' ? 'bizCertUrl' : 'bankbookUrl';

  const db = getDb();
  const [before] = await db
    .select()
    .from(partnerDetails)
    .where(eq(partnerDetails.userId, id))
    .limit(1);
  const old = before?.[column] ?? null;

  await db
    .insert(partnerDetails)
    .values({ userId: id, [column]: url, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: partnerDetails.userId,
      set: { [column]: url, updatedAt: new Date() },
    });

  // URL 자체는 기록하지 않는다 — 감사 기록은 무엇이 있었는지가 아니라 무슨 일이 있었는지다
  await writeAudit(db, {
    projectId: null,
    actor,
    action: `협력사 정보 ${id}`,
    field: FILE_KIND_LABEL[kind],
    oldValue: old ? '있음' : null,
    newValue: url ? '올림' : '지움',
  });

  return old;
}
