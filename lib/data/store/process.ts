/**
 * 공정 — 마일스톤 날짜와 단계 이동.
 *
 * `pg-store.ts` 에서 떼어 왔다(doc/REFACTOR_PLAN_3.md 2-1). 인터페이스는 그대로고
 * 부르는 쪽도 그대로다 — pgRepository 가 이 객체를 펼쳐 담는다.
 *
 * ★단계는 조건이 차야 넘어간다★ — 완료 체크가 그 단계를 열면 저절로 한 걸음 가고
 * (advanceAfterCheck), 체크를 풀면 한 걸음 되돌아온다(retreatAfterUncheck). 조건 판정은
 * lib/process 의 canEnter 한 곳이고, 화면도 같은 함수를 본다.
 */
import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { writeAudit } from '@/lib/db/audit';
import { processDocuments, processes, projects } from '@/lib/db/schema';
import { today } from '@/lib/date';
import {
  asProcessStatus, assertProcessWrite, canEnter, CHECK_ADVANCES, COURT_AFTER_STATUS,
  declarationBlockers, gateContextOf, statusIndex,
} from '@/lib/process';
import { PROCESS_STATUSES } from '@/types/project';
import type { ProcessStatus } from '@/types/project';
import type { Actor, ProcessPatch, ProjectRepository } from '../repository';
import { toDetail } from '../assemble';
import { assertAdmin, recordsOf, ruleMap, settleMap, toProcess, type TxLike } from './shared';

/** pgRepository 가 펼쳐 담는 조각 — 이름과 시그니처는 인터페이스가 정한다 */
export const processStore: Pick<
  ProjectRepository,
  'updateProcess' | 'setProcessStatus'
> = {
  async updateProcess(projectId, patch: ProcessPatch, actor): Promise<void> {
    const fields = Object.keys(patch) as Array<keyof ProcessPatch>;
    if (fields.length === 0) return;

    /** 실제로 풀린 체크 칸 — 트랜잭션 안에서 정하고, 커밋 뒤 단계를 되돌리는 데 쓴다 */
    let unchecked: keyof typeof CHECK_ADVANCES | null = null;
    const db = getDb();
    await db.transaction(async (tx) => {
      const [project] = await tx
        .select({
          id: projects.id, gcOrg: projects.gcOrg,
          // 선언 선행조건 판정에 쓴다 — 준공서류가 현장 사정으로 갈린다(gateContextOf)
          bizType: projects.bizType, powerType: projects.powerType,
        })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      if (!project) throw new Error('현장을 찾을 수 없습니다.');

      // 한백은 전부, 그 현장의 시공사는 한백 전용 칸(환경부 승인·충전기 발주)을 뺀 전부
      assertProcessWrite(actor, project.gcOrg, fields);

      const [before] = await tx
        .select()
        .from(processes)
        .where(eq(processes.projectId, projectId))
        .limit(1);

      unchecked = uncheckedField(fields, patch, before);
      checkStepWindow(fields, patch, before, unchecked);
      await checkDeclarations(tx, projectId, project, fields, patch, before);

      // 공정 행이 없는 현장이 있다 — update 는 0행을 조용히 지나가므로 없으면 만들어 넣는다
      if (before) {
        await tx.update(processes).set(patch).where(eq(processes.projectId, projectId));
      } else {
        await tx.insert(processes).values({ projectId, ...patch });
      }
      await tx
        .update(projects)
        .set({ lastProgressAt: today() })
        .where(eq(projects.id, projectId));

      for (const f of fields) {
        // 설치 실적은 숫자다 — 로그는 글자로 남긴다
        const prev = before?.[f as keyof typeof before] ?? null;
        const next = patch[f] ?? null;
        await writeAudit(tx, {
          projectId, actor, action: '공정 입력 변경',
          field: f,
          oldValue: prev === null ? null : String(prev),
          newValue: next === null ? null : String(next),
        });
      }
    });

    // 완료 체크는 선언이자 전이다(한백 확인) — 조건이 차 있으면 다음 단계로 저절로 넘어간다
    await advanceAfterCheck(projectId, patch, actor);
    if (unchecked) await retreatAfterUncheck(projectId, unchecked, actor);
  },

  async setProcessStatus(projectId, status, actor): Promise<void> {
    assertAdmin(actor, '진행 단계 옮기기');

    const rows = await getDb().select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!rows[0]) throw new Error('현장을 찾을 수 없습니다.');
    const [record] = await recordsOf(rows);
    if (!record) throw new Error('현장을 찾을 수 없습니다.');
    if (record.process.status === status) return;

    // 계약이 끝나지 않은 현장은 공정에 없다 — 상세의 시공 탭이 잠기는 것과 같은 규칙이다
    if (toDetail(record, await ruleMap(), await settleMap()).stage === 'intake') {
      throw new Error('계약이 끝나기 전에는 진행 단계를 옮길 수 없습니다.');
    }
    const entry = canEnter(status, record.process, gateContextOf(record.project));
    if (!entry.ok) throw new Error(`${status} 로 넘기려면 ${entry.blockedBy} 이(가) 필요합니다.`);

    /*
     * 「운영사 계약서 제출」은 넘기는 것이 곧 선언이다 — 낸 날을 여기서 찍는다.
     *
     * 조건(STATUS_GATES)을 걷어내면서 이 칸을 적는 자리가 화면에서 사라졌다. 날짜는
     * 남긴다 — 언제 냈는지는 상세가 보여준다. 이미 찍혀 있으면 덮지 않는다.
     *
     * ★그 칸에 들어설 때만 찍는다.★ 「지났으면 다 찍는다」로 두면 옛 현장을 착공→설치완료로
     * 옮길 때 오늘 날짜가 제출일로 들어간다 — 오래전에 낸 현장에 틀린 날을 새로 적는 꼴이다.
     * 건너뛰어 지나간 현장은 날짜 없이 「제출됨」으로 보인다(제출 여부는 단계가 말한다).
     *
     * 되돌려서 그 앞으로 내려가면 지운다 — 되돌리기는 「그 일이 없던 것으로」다(화면 규칙 7).
     */
    const before = record.process.cpoSubmitDate;
    const stamp =
      status === '운영사 계약서 제출' && !before
        ? { cpoSubmitDate: today() }
        : statusIndex(status) < statusIndex('운영사 계약서 제출') && before
          ? { cpoSubmitDate: null }
          : {};

    /*
     * ★준공완료일도 같은 방식으로 찍는다★ (한백 2026-08-31) — 이 날이 영업비·시공비
     * 2차 지급의 조건이다(lib/settlement payoutReleaseOf). 준공완료는 게이트가 없는
     * 사람의 판단이라 체크 칸을 따로 두지 않고, 그 칸에 들어설 때를 선언으로 본다.
     * 되돌려 내려가면 지운다 — 되돌리기는 「그 일이 없던 것으로」다(화면 규칙 7).
     * 지우지 않으면 2차 지급 조건이 찬 채로 남아 돈이 나갈 수 있다.
     */
    const doneBefore = record.process.completeDoneAt;
    const doneStamp =
      status === '준공완료' && !doneBefore
        ? { completeDoneAt: today() }
        : status !== '준공완료' && doneBefore
          ? { completeDoneAt: null }
          : {};

    const db = getDb();
    await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ status: processes.status })
        .from(processes)
        .where(eq(processes.projectId, projectId))
        .limit(1);
      /*
       * 공정 행이 없는 현장이 있다 — 접수만 되고 아직 공정이 만들어지지 않은 경우다.
       * update 는 0행을 조용히 지나가므로 없으면 만들어 넣는다.
       */
      if (row) {
        if (row.status === status) return;
        await tx.update(processes).set({ status, ...stamp, ...doneStamp }).where(eq(processes.projectId, projectId));
      } else {
        await tx.insert(processes).values({ projectId, status, ...stamp, ...doneStamp });
      }
      // 상태를 옮기면 차례도 따라 넘어간다 — 다음 사람이 움직일 차례다 (lib/process.ts)
      await tx
        .update(projects)
        .set({ lastProgressAt: today(), court: COURT_AFTER_STATUS[status] })
        .where(eq(projects.id, projectId));

      await writeAudit(tx, {
        projectId, actor, action: '진행 단계 변경',
        field: 'process.status', oldValue: row?.status ?? null, newValue: status,
      });
      if ('cpoSubmitDate' in stamp) {
        await writeAudit(tx, {
          projectId, actor, action: '운영사 계약서 제출',
          field: 'process.cpoSubmitDate',
          oldValue: before, newValue: stamp.cpoSubmitDate,
        });
      }
      /* 2차 지급의 조건이 되는 날이라 남긴다 — 돈이 걸린 값은 언제 바뀌었는지 물을 수 있어야 한다 */
      if ('completeDoneAt' in doneStamp) {
        await writeAudit(tx, {
          projectId, actor, action: doneStamp.completeDoneAt ? '준공완료' : '준공완료 해제',
          field: 'process.completeDoneAt',
          oldValue: doneBefore, newValue: doneStamp.completeDoneAt ?? null,
        });
      }
    });
  },
};

/**
 * 완료 체크 뒤의 자동 전이 — 체크가 여는 단계(CHECK_ADVANCES)의 조건이 차 있으면
 * 다음 한 걸음만 저절로 간다. 시공사의 체크로도 넘어간다 — 사람이 옮기는 것이
 * 아니라 선언이 옮기는 것이라 setProcessStatus 의 한백 전용 판정을 타지 않는다.
 * 조건(canEnter)·계약 전 잠금은 똑같이 확인한다.
 */
async function advanceAfterCheck(projectId: string, patch: ProcessPatch, actor: Actor): Promise<void> {
  const field = (Object.keys(patch) as Array<keyof ProcessPatch>).find(
    (f) => f in CHECK_ADVANCES && patch[f] != null
  );
  if (!field) return;
  const target = CHECK_ADVANCES[field as keyof typeof CHECK_ADVANCES];

  const db = getDb();
  const rows = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!rows[0]) return;
  const [record] = await recordsOf(rows);
  if (!record) return;

  const cur = record.process.status;
  if (statusIndex(target) !== statusIndex(cur) + 1) return;      // 바로 다음 한 걸음만
  if (!canEnter(target, record.process, gateContextOf(record.project)).ok) return; // 조건이 아직 안 찼다
  if (toDetail(record, await ruleMap(), await settleMap()).stage === 'intake') return;
  await moveStatus(projectId, cur, target, actor, '진행 단계 변경 (완료 체크)');
}

/**
 * 체크를 풀면 그 체크가 열었던 단계에서 물러난다 (한백 지시 2026-08-26).
 *
 * ★안 물러나면 기록 없이 통과한 현장이 남는다★ — canEnter 는 지나온 자리를 다시 묻지
 * 않으므로(lib/process), 「행위신고 불필요」를 체크해 충전기 발주로 올라간 뒤 체크를
 * 풀면 신고 기록이 하나도 없는 채로 준공까지 흘러간다.
 *
 * ★부르는 쪽이 「실제로 풀린 칸」을 준다★ — patch 를 그대로 훑지 않는다. 라우트가
 * 행위신고 상호배제로 반대쪽에 심는 null 을 해제로 읽어서, 체크가 단계를 올린 직후
 * 스스로 되돌리는 일이 있었다(2026-08-26 실사고 — 시공 구간 입구가 막혔다).
 * 되감을 수 없는 경우(더 진행됨)는 부르는 쪽이 저장 전에 이미 거절한다.
 */
async function retreatAfterUncheck(
  projectId: string, field: keyof typeof CHECK_ADVANCES, actor: Actor
): Promise<void> {
  const opened = CHECK_ADVANCES[field];

  const rows = await getDb().select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!rows[0]) return;
  const [record] = await recordsOf(rows);
  if (!record) return;

  // 계약이 안 끝난 현장은 공정을 움직이지 않는다 — advanceAfterCheck 와 같은 잠금
  if (toDetail(record, await ruleMap(), await settleMap()).stage === 'intake') return;

  const cur = record.process.status;
  if (statusIndex(cur) !== statusIndex(opened)) return;  // 그 단계에 서 있을 때만 물러난다
  const back = PROCESS_STATUSES[statusIndex(opened) - 1];
  if (!back) return;
  await moveStatus(projectId, cur, back, actor, '진행 단계 되돌림 (체크 해제)', { progress: false });
}

/**
 * 단계를 옮기고 담당·감사기록을 함께 맞춘다 — 체크로 오르내릴 때 쓴다.
 * 되돌림에는 정체일을 찍지 않는다(progress: false) — 되돌리는 것은 진척이 아니다.
 */
async function moveStatus(
  projectId: string, cur: ProcessStatus, target: ProcessStatus, actor: Actor, action: string,
  opts: { progress?: boolean } = {}
): Promise<void> {
  const db = getDb();

  await db.transaction(async (tx) => {
    await tx.update(processes).set({ status: target }).where(eq(processes.projectId, projectId));
    await tx
      .update(projects)
      .set({
        ...(opts.progress === false ? {} : { lastProgressAt: today() }),
        court: COURT_AFTER_STATUS[target],
      })
      .where(eq(projects.id, projectId));
    await writeAudit(tx, {
      projectId, actor, action,
      field: 'process.status', oldValue: cur, newValue: target,
    });
  });
}

/** 공정 행 한 줄 — 저장 전 판정에 쓰는 만큼만 */
type ProcRowLike = Record<string, unknown> & { status?: string | null };

/**
 * 실제로 풀린 체크 칸을 고른다.
 *
 * ★원래도 null 인 칸은 해제가 아니다★ — 라우트가 행위신고 상호배제로 반대쪽에 심는 null 이
 * 그렇다. 안 걸러서 체크가 단계를 올린 직후 스스로 되돌리는 일이 있었다(2026-08-26 실사고).
 */
function uncheckedField(
  fields: Array<keyof ProcessPatch>,
  patch: ProcessPatch,
  before: ProcRowLike | undefined
): keyof typeof CHECK_ADVANCES | null {
  return fields.find(
    (f) => f in CHECK_ADVANCES && patch[f] === null && before?.[f as string] != null
  ) as keyof typeof CHECK_ADVANCES | undefined ?? null;
}

/**
 * 그 구간에 와서 체크하는가 — 아니면 던진다. ★거절은 저장 전에 한다★ (예전에는 커밋 뒤에
 * 던져서 「해제할 수 없습니다」를 띄우면서 값은 이미 지워져 있었다 — 그 값이 지급 트리거면
 * 근거가 조용히 사라진다).
 *
 * 체크 필드가 곧 지급 트리거다(설치완료 → 시공비 1차, 개통완료 → 양쪽 2차). 화면 스테퍼는
 * 미래 구간도 열어 주고 서버는 「누가 적는가」만 봐서, 충전기 발주 현장에서 설치완료·개통완료를
 * 체크하면 ★착공도 안 한 현장의 지급이 전액 열렸다★. 이미 지난 구간의 체크는 막지 않는다 —
 * 되돌려 고치는 길이다(화면 규칙 7).
 */
/**
 * 완료 선언의 선행조건 — ★서버도 본다★ (감사 2026-09-04 H2).
 *
 * 그전에는 화면만 봤다(advanceBlockers → CHECK_REQUIRES). 단추는 막혀 있어도 라우트를
 * 직접 부르면 그대로 찍혔고, 설치완료 선언은 ★시공비 1차 지급 트리거★라 그 현장의
 * 시공사가 사진도 착공일도 없이 지급 조건을 열 수 있었다.
 *
 * ★같은 요청에 실려 온 값도 인정한다★ — 지금 화면은 선언만 따로 보내지만(saveCheck),
 * 조건과 선언을 한 번에 보내는 것을 틀렸다고 할 이유가 없다. before 에 patch 를 덮어
 * 「이 요청이 끝난 뒤의 모습」으로 판정한다.
 *
 * 푸는 것(null)은 검사하지 않는다 — 되돌리는 길은 열려 있어야 한다(화면 규칙 7).
 */
async function checkDeclarations(
  tx: TxLike,
  projectId: string,
  project: { bizType: string | null; powerType: string | null },
  fields: Array<keyof ProcessPatch>,
  patch: ProcessPatch,
  before: ProcRowLike | undefined
): Promise<void> {
  const declaring = fields.filter((f) => f in CHECK_ADVANCES && patch[f] != null);
  if (declaring.length === 0) return;

  const docs = await tx
    .select()
    .from(processDocuments)
    .where(eq(processDocuments.projectId, projectId));
  const merged = toProcess(projectId, { ...(before ?? {}), ...patch } as never, docs);
  const ctx = gateContextOf(project as never);

  for (const f of declaring) {
    const lack = declarationBlockers(f as string, merged, ctx);
    if (lack.length > 0) {
      throw new Error(`${lack.join(' · ')} 이(가) 아직입니다.`);
    }
  }
}

function checkStepWindow(
  fields: Array<keyof ProcessPatch>,
  patch: ProcessPatch,
  before: ProcRowLike | undefined,
  unchecked: keyof typeof CHECK_ADVANCES | null
): void {
  const cur = asProcessStatus(before?.status);
  if (unchecked && statusIndex(cur) > statusIndex(CHECK_ADVANCES[unchecked])) {
    throw new Error(`이미 ${cur} 까지 진행돼 해제할 수 없습니다 — 단계를 먼저 되돌리세요.`);
  }
  for (const f of fields) {
    if (!(f in CHECK_ADVANCES) || patch[f] == null) continue;
    const opened = CHECK_ADVANCES[f as keyof typeof CHECK_ADVANCES];
    if (statusIndex(cur) < statusIndex(opened) - 1) {
      throw new Error(`아직 그 구간이 아닙니다 — 지금은 ${cur} 입니다.`);
    }
  }
}
