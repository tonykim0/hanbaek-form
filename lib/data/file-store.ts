/**
 * 파일 기반 저장소 — 자체 DB 가 정해지기 전까지 쓰는 다리.
 *
 * 왜 메모리가 아닌가: Next 는 라우트별로 서버 번들을 따로 만든다. API 핸들러의
 * 모듈 상태와 페이지의 모듈 상태가 다른 인스턴스라서, 한쪽에서 push 한 값이
 * 다른 쪽에서 보이지 않는다. 파일은 모든 인스턴스가 같은 것을 본다.
 *
 * 한계: Vercel 파일시스템은 읽기 전용이라 배포 환경에서는 쓰기가 안 된다.
 * 자체 DB 를 정하면 이 파일만 그 구현으로 바꾸면 되고, 화면은 그대로다.
 */
import { promises as fs } from 'fs';
import path from 'path';
import type {
  ContractLine, IntakeDraft, PayoutRow, ProcessStatus, Project, ProjectDetail, ProjectDocument,
  ProjectSummary, SettlementSummary,
} from '@/types/project';
import type { Viewer } from '@/lib/auth/types';
import type { Actor, ProjectRepository } from './repository';
import { canAccessProject, effectiveVisibility, normalizeOrg } from '@/lib/roles';
import { asProcessStatus, canEnter } from '@/lib/process';
import {
  ALL_DOC_KEYS, byStalled, contractReadyOf, emptyProcess, emptySettlement, isProcessDocKind,
  payoutRowsOf,
  redactForViewer, settlementSummaryOf, summaryOf, toDetail, type ProjectRecord,
} from './assemble';
import { SEED_RECORDS } from './mock';
import { PRICING_RULE_BY_ID } from './seed/pricing-rules';

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'projects.json');

/** 저장 파일은 예전 상태 이름을 갖고 있을 수 있다 — 목록이 바뀌면 첫 칸으로 되돌린다 */
function parse(raw: string): ProjectRecord[] {
  const records = JSON.parse(raw) as ProjectRecord[];
  for (const r of records) r.process.status = asProcessStatus(r.process.status);
  return records;
}

async function load(): Promise<ProjectRecord[]> {
  try {
    return parse(await fs.readFile(DATA_FILE, 'utf8'));
  } catch {
    // 첫 실행 — 시드를 심는다. 동시 요청이 겹쳐도 각자 자기 임시파일을 쓰므로 부딪히지 않는다.
    try {
      await save(SEED_RECORDS);
    } catch {
      // 다른 요청이 먼저 심었을 수 있다 — 다시 읽어본다
      const raw = await fs.readFile(DATA_FILE, 'utf8').catch(() => null);
      if (raw) return parse(raw);
    }
    return SEED_RECORDS;
  }
}

let writeSeq = 0;

/**
 * 임시 파일에 쓴 뒤 rename — 쓰다 죽어도 반쯤 쓰인 파일이 남지 않게.
 * 임시 파일명에 pid·순번을 붙인다. 같은 이름을 쓰면 동시 요청의 rename 이 서로를 덮어 ENOENT 가 난다.
 *
 * ※ 이래도 동시 쓰기의 lost update 는 막지 못한다 — 두 요청이 같은 스냅샷을 읽어 각자 쓰면
 *   나중 것이 이긴다. 이건 파일 저장소의 근본 한계이고, Postgres 로 옮기면 사라진다.
 */
async function save(records: ProjectRecord[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${DATA_FILE}.${process.pid}.${writeSeq++}.tmp`;
  try {
    await fs.writeFile(tmp, JSON.stringify(records, null, 2), 'utf8');
    await fs.rename(tmp, DATA_FILE);
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
}

/** HB-2026-041 → 41. 연도 부분까지 숫자로 긁으면 안 된다. */
function seqOf(id: string): number {
  const tail = id.slice(id.lastIndexOf('-') + 1);
  const n = Number(tail);
  return Number.isFinite(n) ? n : 0;
}

function nextId(records: ProjectRecord[]): string {
  const max = records.reduce((m, r) => Math.max(m, seqOf(r.project.id)), 0);
  return `HB-2026-${String(max + 1).padStart(3, '0')}`;
}

export const fileRepository: ProjectRepository = {
  async listProjects(viewer: Viewer): Promise<ProjectSummary[]> {
    const records = await load();
    return records
      .filter((r) => canAccessProject(viewer.role, viewer.org, r.project))
      .map(summaryOf)
      .sort(byStalled);
  },

  async listSettlements(viewer: Viewer): Promise<SettlementSummary[]> {
    // 관리자가 아니면 금액을 조립조차 하지 않는다
    if (viewer.role !== 'admin') return [];
    const records = await load();
    return records
      .map(settlementSummaryOf)
      .sort((a, b) => b.planTotal - a.planTotal);
  },

  async getProject(id: string, viewer: Viewer): Promise<ProjectDetail | null> {
    const records = await load();
    const r = records.find((x) => x.project.id === id);
    if (!r || !canAccessProject(viewer.role, viewer.org, r.project)) return null;
    return redactForViewer(toDetail(r), effectiveVisibility(viewer.role, viewer.org, r.project));
  },

  async listPayouts(viewer: Viewer): Promise<PayoutRow[]> {
    const records = await load();
    return records
      .filter((r) => canAccessProject(viewer.role, viewer.org, r.project))
      .flatMap((r) => payoutRowsOf(r, viewer));
  },

  async createProject(draft: IntakeDraft, actor): Promise<string> {
    const records = await load();
    const id = nextId(records);
    const today = new Date().toISOString().slice(0, 10);

    const project: Project = {
      id, mgmtNo: id, cpo: draft.cpo,
      // 협력사는 접수자의 소속, 한백이 대신 접수할 때만 적어 넣는다 (pg-store 와 같은 판정)
      salesOrg: actor.role === 'admin' ? normalizeOrg(draft.salesOrg) : actor.org,
      gcOrg: actor.role === 'admin' ? normalizeOrg(draft.gcOrg) : actor.org,
      name: draft.name, addr: draft.addr, bldgType: draft.bldgType,
      contractParty: draft.contractParty, parkTotal: draft.parkTotal,
      mgr: draft.mgr, tel: draft.tel, mail: draft.mail,
      preInstall: draft.preInstall, preNote: draft.preNote, preChecked: false,
      powerType: draft.powerType, replType: draft.replType,
      bizType: draft.bizType, envQueueNo: null, note: draft.note,
      // 한백이 확인해야 계약이 넘어간다 — 접수 시점에는 확인 전이다
      contractConfirmedAt: null, createdAt: today,
      // 정산 규칙은 한백이 검수 단계에서 현장별로 적용한다
      settlementRuleId: null, settlementAppliedAt: null,
      holdState: null, holdNote: null,
    };

    const lines: ContractLine[] = draft.lines.map((l, i) => ({
      id: `${id}-L${i + 1}`, projectId: id,
      termYears: l.termYears, qty: l.qty, powerType: l.powerType,
      replType: l.replType, memo: l.memo,
      // 단가 케이스는 한백이 검수 후 지정한다
      pricingRuleId: null, pricedAt: null,
    }));

    const submitted = new Map(draft.documents.map((d) => [d.kind, d.filename]));
    const documents: ProjectDocument[] = ALL_DOC_KEYS.map((kind) => ({
      kind,
      filename: submitted.get(kind) ?? null,
      blobUrl: null,
      // 올라온 서류는 '검수 대기' — 승인은 한백이 한다
      status: submitted.has(kind) ? 'uploaded' : 'none',
      rejectReason: null,
      uploadedBy: submitted.has(kind) ? actor.name : null,
      uploadedAt: submitted.has(kind) ? today : null,
    }));

    records.push({
      project, lines, documents,
      process: emptyProcess(id),
      settlementRaw: emptySettlement(id),
      collected: {},
      court: '한백', // 접수하면 공이 한백으로 넘어간다 (검수 차례)
      lastProgressAt: today,
    });
    await save(records);
    return id;
  },

  async setDocumentStatus(input, actor): Promise<void> {
    if (actor.role !== 'admin') throw new Error('서류 검수는 한백 관리자만 할 수 있습니다.');
    if (input.status === 'rejected' && !input.reason?.trim()) {
      throw new Error('반려 사유를 입력해주세요.');
    }

    const records = await load();
    const r = records.find((x) => x.project.id === input.projectId);
    if (!r) throw new Error('현장을 찾을 수 없습니다.');
    const doc = r.documents.find((d) => d.kind === input.kind);
    // 올라오지 않은 서류는 검수 대상이 아니다 (pg-store 와 같은 판정)
    if (!doc || doc.status === 'none') {
      throw new Error('제출되지 않은 서류는 검수할 수 없습니다.');
    }

    doc.status = input.status;
    doc.rejectReason = input.status === 'rejected' ? input.reason!.trim() : null;
    // 반려는 앞서 한 계약 확인을 무효로 만든다 (pg-store 와 같은 판정)
    if (input.status === 'rejected') r.project.contractConfirmedAt = null;
    r.lastProgressAt = new Date().toISOString().slice(0, 10);
    await save(records);
  },

  async addNote(input, actor): Promise<void> {
    const body = input.body.trim();
    if (!body) throw new Error('내용을 입력해주세요.');
    if (body.length > 2000) throw new Error('한 번에 2000자까지 남길 수 있습니다.');

    const records = await load();
    const r = records.find((x) => x.project.id === input.projectId);
    if (!r) throw new Error('현장을 찾을 수 없습니다.');
    if (!canAccessProject(actor.role, actor.org, r.project)) {
      throw new Error('이 현장에 남길 권한이 없습니다.');
    }

    // 최근 것이 위로 온다 (pg-store 의 정렬과 같다)
    r.notes = [
      {
        id: `${input.projectId}-N${Date.now()}`,
        author: actor.role === 'admin' ? '한백' : actor.org ?? '협력사',
        body,
        at: new Date().toISOString().slice(0, 16).replace('T', ' '),
        editedAt: null,
      },
      ...(r.notes ?? []),
    ];
    // 남기는 것은 진척이다 (pg-store 와 같은 판정)
    r.lastProgressAt = new Date().toISOString().slice(0, 10);
    await save(records);
  },

  async editNote(input, actor): Promise<void> {
    const body = input.body.trim();
    if (!body) throw new Error('내용을 입력해주세요.');
    if (body.length > 2000) throw new Error('한 번에 2000자까지 남길 수 있습니다.');

    const records = await load();
    const r = records.find((x) => x.project.id === input.projectId);
    if (!r) throw new Error('현장을 찾을 수 없습니다.');
    const note = (r.notes ?? []).find((n) => n.id === input.noteId);
    if (!note) throw new Error('없는 기록입니다.');

    // 자기가 쓴 것만 고친다 (pg-store 와 같은 판정)
    const mine = actor.role === 'admin' ? '한백' : actor.org ?? '협력사';
    if (note.author !== mine) throw new Error('남이 남긴 기록은 고칠 수 없습니다.');
    if (note.body === body) return;

    note.body = body;
    note.editedAt = new Date().toISOString().slice(0, 16).replace('T', ' ');
    await save(records);
  },

  async deleteDocument(input, actor): Promise<{ blobUrl: string | null }> {
    if (actor.role !== 'admin') throw new Error('서류 삭제는 한백 관리자만 할 수 있습니다.');

    const records = await load();
    const r = records.find((x) => x.project.id === input.projectId);
    if (!r) throw new Error('현장을 찾을 수 없습니다.');
    // 계약 서류와 공정 서류는 다른 자리에 산다 (pg-store 와 같은 기준)
    const bucket = isProcessDocKind(input.kind) ? r.process.docs : r.documents;
    const at = bucket.findIndex((d) => d.kind === input.kind);
    if (at < 0) throw new Error('이미 없는 서류입니다.');

    const [doc] = bucket.splice(at, 1);
    // 지우는 것은 진척이 아니다 — lastProgressAt 을 건드리지 않는다 (pg-store 와 같은 판정)
    await save(records);
    return { blobUrl: doc.blobUrl ?? null };
  },

  async setLinePricing(lineId, pricingRuleId, actor): Promise<void> {
    if (actor.role !== 'admin') throw new Error('단가 케이스 지정은 한백 관리자만 할 수 있습니다.');
    if (pricingRuleId && !PRICING_RULE_BY_ID.has(pricingRuleId)) {
      throw new Error('없는 단가 케이스입니다.');
    }
    const records = await load();
    const r = records.find((x) => x.lines.some((l) => l.id === lineId));
    if (!r) throw new Error('계약 라인을 찾을 수 없습니다.');
    const line = r.lines.find((l) => l.id === lineId)!;
    if (line.pricingRuleId === pricingRuleId) return;
    const today = new Date().toISOString().slice(0, 10);
    line.pricingRuleId = pricingRuleId;
    line.pricedAt = pricingRuleId ? today : null;
    r.lastProgressAt = today;
    await save(records);
  },

  async setPayment(projectId, patch, actor): Promise<void> {
    if (actor.role !== 'admin') throw new Error('지급 정보 저장은 한백 관리자만 할 수 있습니다.');
    const records = await load();
    const r = records.find((x) => x.project.id === projectId);
    if (!r) throw new Error('현장을 찾을 수 없습니다.');
    Object.assign(r.settlementRaw, patch);
    r.lastProgressAt = new Date().toISOString().slice(0, 10);
    await save(records);
  },

  async uploadDocument(input, actor): Promise<void> {
    const records = await load();
    const r = records.find((x) => x.project.id === input.projectId);
    if (!r) throw new Error('현장을 찾을 수 없습니다.');
    if (!canAccessProject(actor.role, actor.org, r.project)) {
      throw new Error('이 현장에 서류를 올릴 권한이 없습니다.');
    }
    const today = new Date().toISOString().slice(0, 10);
    // 계약 서류와 공정 서류는 다른 목록에 산다 — 섞으면 공정 게이트가 서류를 못 찾는다
    const bucket = isProcessDocKind(input.kind) ? r.process.docs : r.documents;
    let doc = bucket.find((d) => d.kind === input.kind);
    if (!doc) {
      doc = { kind: input.kind, filename: null, blobUrl: null, status: 'none', rejectReason: null, uploadedBy: null, uploadedAt: null };
      bucket.push(doc);
    }
    doc.filename = input.filename;
    doc.blobUrl = input.blobUrl;
    doc.status = 'uploaded';   // 다시 올리면 반려가 풀린다
    doc.rejectReason = null;
    doc.uploadedBy = actor.name;
    doc.uploadedAt = today;
    r.court = '한백';
    r.lastProgressAt = today;
    await save(records);
  },

  async setEnvQueueNo(projectId, value, actor): Promise<void> {
    if (actor.role !== 'admin') throw new Error('환경부 대기번호 입력은 한백 관리자만 할 수 있습니다.');
    const records = await load();
    const r = records.find((x) => x.project.id === projectId);
    if (!r) throw new Error('현장을 찾을 수 없습니다.');
    if (r.project.envQueueNo === value) return;
    r.project.envQueueNo = value;
    r.lastProgressAt = new Date().toISOString().slice(0, 10);
    await save(records);
  },

  async updateProcess(projectId, patch, actor): Promise<void> {
    if (actor.role !== 'admin') throw new Error('공정 날짜 입력은 한백 관리자만 할 수 있습니다.');
    const records = await load();
    const r = records.find((x) => x.project.id === projectId);
    if (!r) throw new Error('현장을 찾을 수 없습니다.');
    Object.assign(r.process, patch);
    r.lastProgressAt = new Date().toISOString().slice(0, 10);
    await save(records);
  },

  async setProcessStatus(projectId, status, actor): Promise<void> {
    if (actor.role !== 'admin') throw new Error('진행 단계 옮기기는 한백 관리자만 할 수 있습니다.');
    const records = await load();
    const r = records.find((x) => x.project.id === projectId);
    if (!r) throw new Error('현장을 찾을 수 없습니다.');
    if (r.process.status === status) return;

    // 계약이 끝나지 않은 현장은 공정에 없다 — 상세의 시공 탭이 잠기는 것과 같은 규칙이다
    if (toDetail(r).stage === 'intake') {
      throw new Error('계약이 끝나기 전에는 진행 단계를 옮길 수 없습니다.');
    }
    const entry = canEnter(status as ProcessStatus, r.process);
    if (!entry.ok) throw new Error(`${status} 로 넘기려면 ${entry.blockedBy} 이(가) 필요합니다.`);

    r.process.status = status;
    r.lastProgressAt = new Date().toISOString().slice(0, 10);
    await save(records);
  },

  async setPreInstall(projectId, patch, actor): Promise<void> {
    const records = await load();
    const r = records.find((x) => x.project.id === projectId);
    if (!r) throw new Error('현장을 찾을 수 없습니다.');
    // 조사는 현장에 가는 쪽이 한다 (pg-store 와 같은 판정)
    if (!canAccessProject(actor.role, actor.org, r.project)) {
      throw new Error('이 현장의 기설치를 적을 권한이 없습니다.');
    }

    if (patch.preInstall) r.project.preInstall = patch.preInstall;
    if ('preNote' in patch) r.project.preNote = patch.preNote?.trim() || null;
    if (patch.preChecked !== undefined) r.project.preChecked = patch.preChecked;
    r.lastProgressAt = new Date().toISOString().slice(0, 10);
    await save(records);
  },

  async setOrgs(projectId, patch, actor): Promise<void> {
    if (actor.role !== 'admin') throw new Error('영업사·시공사 지정은 한백 관리자만 할 수 있습니다.');
    const records = await load();
    const r = records.find((x) => x.project.id === projectId);
    if (!r) throw new Error('현장을 찾을 수 없습니다.');

    if ('salesOrg' in patch) r.project.salesOrg = normalizeOrg(patch.salesOrg);
    if ('gcOrg' in patch) r.project.gcOrg = normalizeOrg(patch.gcOrg);
    // 소속을 고치는 것은 진척이 아니다 — lastProgressAt 을 건드리지 않는다 (pg-store 와 같다)
    await save(records);
  },

  async confirmContract(projectId, confirmed, actor): Promise<void> {
    if (actor.role !== 'admin') throw new Error('계약 확인은 한백 관리자만 할 수 있습니다.');
    const records = await load();
    const r = records.find((x) => x.project.id === projectId);
    if (!r) throw new Error('현장을 찾을 수 없습니다.');
    if (confirmed && !contractReadyOf(r)) {
      throw new Error('서류가 다 차고 반려가 없고 단가가 붙어야 계약을 확인할 수 있습니다.');
    }
    const after = confirmed ? new Date().toISOString().slice(0, 10) : null;
    if (Boolean(r.project.contractConfirmedAt) === Boolean(after)) return;
    r.project.contractConfirmedAt = after;
    r.court = confirmed ? '시공사' : '한백';
    r.lastProgressAt = new Date().toISOString().slice(0, 10);
    await save(records);
  },

  async setCourt(projectId, court, actor): Promise<void> {
    if (actor.role !== 'admin') throw new Error('공 차례 넘기기는 한백 관리자만 할 수 있습니다.');
    const records = await load();
    const r = records.find((x) => x.project.id === projectId);
    if (!r) throw new Error('현장을 찾을 수 없습니다.');
    if (r.court === court) return;
    r.court = court;
    r.lastProgressAt = new Date().toISOString().slice(0, 10);
    await save(records);
  },
};

/*
 * 감사 로그는 파일 저장소에 남기지 않는다.
 * 이 저장소는 DATABASE_URL 이 없는 로컬 개발용 대체물이고, 감사 대상이 되는 실제 운영은
 * Postgres 에서만 일어난다. 여기서 흉내만 내면 「로그가 있다」는 착각을 만든다.
 */
