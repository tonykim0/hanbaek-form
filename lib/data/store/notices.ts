/**
 * 공지 — 한백이 협력사 전체에 알리는 글 (한백 지시 2026-09-03).
 *
 * 쓰는 사람은 한백 관리자뿐이고, 읽는 사람은 로그인한 전부다(열람 전용 포함).
 * 읽음 표시는 사람마다 시각 하나다(users.notices_read_at — 공지 화면을 연 시각).
 * 그보다 뒤에 만들어진 공지가 「안 읽은 것」이고 상단바 배지가 그 수를 단다.
 */
import { desc, eq, gt, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { writeAudit } from '@/lib/db/audit';
import { notices, users } from '@/lib/db/schema';
import type { Notice, NoticeFile } from '@/types/project';
import type { ProjectRepository } from '../repository';
import { assertAdmin } from './shared';

const toNotice = (r: typeof notices.$inferSelect): Notice => ({
  id: r.id,
  title: r.title,
  body: r.body,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt?.toISOString() ?? null,
  /* 옛 행은 null 일 수 있다 — 마이그레이션이 기본값을 줬어도 방어한다(세는 자리가 갈린다) */
  files: r.files ?? [],
});

/** pgRepository 가 펼쳐 담는 조각 — 이름과 시그니처는 인터페이스가 정한다 */
export const noticeStore: Pick<
  ProjectRepository,
  'listNotices' | 'countUnreadNotices' | 'markNoticesRead' | 'saveNotice' | 'deleteNotice'
  | 'attachNoticeFile' | 'removeNoticeFile'
> = {
  /* 로그인한 누구나 — 라우트·화면이 세션만 본다 */
  async listNotices(): Promise<Notice[]> {
    const rows = await getDb().select().from(notices).orderBy(desc(notices.createdAt));
    return rows.map(toNotice);
  },

  async countUnreadNotices(userId): Promise<number> {
    const db = getDb();
    const [me] = await db
      .select({ readAt: users.noticesReadAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    // 한 번도 안 열었으면(null) 전부가 새것이다 — 「확인 전에는 표시」가 그 말이다
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(notices)
      .where(me?.readAt ? gt(notices.createdAt, me.readAt) : undefined);
    return row?.n ?? 0;
  },

  /*
   * ★열람 전용도 부른다 — 쓰기가 아니라 읽었다는 표시다.★
   * write-route 가 막는 것은 사업 데이터의 쓰기이고, 이것은 제 읽음 시각 한 칸이다.
   * 그래서 assert 가 없다 — 남의 것은 못 건드린다(자기 id 로만 찍는다, 라우트가 세션에서 꺼낸다).
   */
  async markNoticesRead(userId): Promise<void> {
    await getDb().update(users).set({ noticesReadAt: sql`now()` }).where(eq(users.id, userId));
  },

  async saveNotice(input, actor): Promise<string> {
    assertAdmin(actor, '공지 작성');
    const title = input.title?.trim();
    const body = input.body?.trim();
    if (!title) throw new Error('제목을 적어주세요.');
    if (!body) throw new Error('내용을 적어주세요.');

    const db = getDb();
    if (input.id) {
      const [before] = await db.select().from(notices).where(eq(notices.id, input.id)).limit(1);
      if (!before) throw new Error('공지를 찾을 수 없습니다.');
      await db.transaction(async (tx) => {
        // createdAt 은 그대로 둔다 — 오타 수정이 전원의 배지를 다시 켜면 안 된다
        await tx.update(notices).set({ title, body, updatedAt: sql`now()` }).where(eq(notices.id, input.id!));
        await writeAudit(tx, {
          projectId: null, actor, action: '공지 수정',
          field: 'notices', oldValue: before.title, newValue: title,
        });
      });
      return input.id;
    }

    const id = crypto.randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(notices).values({ id, title, body });
      // 쓴 사람은 확인한 것이다 — 제 공지가 제 배지에 서면 거짓말이다
      await tx.update(users).set({ noticesReadAt: sql`now()` }).where(eq(users.id, actor.id));
      await writeAudit(tx, {
        projectId: null, actor, action: '공지 등록',
        field: 'notices', oldValue: null, newValue: title,
      });
    });
    return id;
  },

  async deleteNotice(id, actor): Promise<string[]> {
    assertAdmin(actor, '공지 삭제');
    const db = getDb();
    const [before] = await db.select().from(notices).where(eq(notices.id, id)).limit(1);
    if (!before) throw new Error('공지를 찾을 수 없습니다.');
    await db.transaction(async (tx) => {
      await tx.delete(notices).where(eq(notices.id, id));
      await writeAudit(tx, {
        projectId: null, actor, action: '공지 삭제',
        field: 'notices', oldValue: before.title, newValue: null,
      });
    });
    /* 붙어 있던 파일 주소 — 부르는 쪽이 Blob 에서 지운다(DB 가 정본이라 여기서 안 막는다) */
    return (before.files ?? []).map((f) => f.url);
  },

  /*
   * ★파일은 쌓인다 — 갈아치우지 않는다★ (서류 칸과 같은 규칙, lib/attach-doc).
   * 같은 이름이 또 와도 둘 다 남긴다: 무엇이 최신인지는 올린 시각이 말하고,
   * 무엇을 지울지는 사람이 정한다. 조용히 덮으면 되돌릴 자리가 없다.
   */
  async attachNoticeFile(id, file: NoticeFile, actor): Promise<void> {
    assertAdmin(actor, '공지 첨부');
    const db = getDb();
    const [before] = await db.select().from(notices).where(eq(notices.id, id)).limit(1);
    if (!before) throw new Error('공지를 찾을 수 없습니다.');
    await db.transaction(async (tx) => {
      await tx
        .update(notices)
        .set({ files: [...(before.files ?? []), file] })
        .where(eq(notices.id, id));
      await writeAudit(tx, {
        projectId: null, actor, action: '공지 첨부 올림',
        field: 'notices.files', oldValue: before.title, newValue: file.name,
      });
    });
  },

  async removeNoticeFile(id, url, actor): Promise<string> {
    assertAdmin(actor, '공지 첨부 빼기');
    const db = getDb();
    const [before] = await db.select().from(notices).where(eq(notices.id, id)).limit(1);
    if (!before) throw new Error('공지를 찾을 수 없습니다.');
    const gone = (before.files ?? []).find((f) => f.url === url);
    if (!gone) throw new Error('그 첨부를 찾을 수 없습니다.');
    await db.transaction(async (tx) => {
      await tx
        .update(notices)
        .set({ files: (before.files ?? []).filter((f) => f.url !== url) })
        .where(eq(notices.id, id));
      await writeAudit(tx, {
        projectId: null, actor, action: '공지 첨부 뺌',
        field: 'notices.files', oldValue: gone.name, newValue: null,
      });
    });
    return gone.url;
  },
};
