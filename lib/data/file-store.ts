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
  ContractLine, IntakeDraft, LineAxes, PayoutRow, PricingRule, ProcessStatus, Project, ProjectDetail,
  ProjectDocument, ProjectSummary, SettlementSummary,
} from '@/types/project';
import type { Viewer } from '@/lib/auth/types';
import type { Actor, ProjectRepository } from './repository';
import { canAccessProject, effectiveVisibility, normalizeOrg } from '@/lib/roles';
import { asProcessStatus, assertProcessWrite, canEnter, COURT_AFTER_STATUS } from '@/lib/process';
import { stamp, today } from '@/lib/date';
import { checkPayoutEntry, payoutSideOf, payoutStepsOf } from '@/lib/settlement';
import {
  ALL_DOC_KEYS, byStalled, contractStateFor, emptyProcess, emptySettlement, isProcessDocKind,
  payoutRowsOf,
  redactForViewer, settlementSummaryOf, summaryOf, toDetail,
  type ProjectRecord, type RuleMap,
} from './assemble';
import { SEED_RECORDS } from './mock';
import { needsPreInstallCheck } from '@/lib/doc-rules';
import { PRICING_RULES } from './seed/pricing-rules';
import { SETTLEMENT_RULE_BY_ID } from './seed/settlement-rules';
import { checkPricingRule, duplicateOf, normalizePricingRule, pricingRuleId } from '@/lib/pricing-match';

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'projects.json');
/*
 * 단가 케이스는 현장과 다른 파일에 둔다. 현장은 자주 바뀌고 케이스는 거의 안 바뀌는데,
 * 한 파일에 두면 현장을 저장할 때마다 케이스까지 통째로 다시 쓰게 된다 —
 * 이 저장소는 동시 쓰기에서 나중 것이 이기므로(save 주석) 겹치는 면을 좁혀 둔다.
 */
const RULES_FILE = path.join(DATA_DIR, 'pricing-rules.json');

/** 저장 파일은 예전 상태 이름을 갖고 있을 수 있다 — 목록이 바뀌면 첫 칸으로 되돌린다 */
function parse(raw: string): ProjectRecord[] {
  const records = JSON.parse(raw) as ProjectRecord[];
  for (const r of records) {
    r.process.status = asProcessStatus(r.process.status);
    // 원장이 생기기 전의 파일에는 이 배열이 없다 — 빈 원장으로 읽는다
    r.payoutEntries = r.payoutEntries ?? [];
    // 설치 실적이 생기기 전의 파일에는 이 칸이 없다
    r.process.installedSpots = r.process.installedSpots ?? null;
    r.process.installedUnits = r.process.installedUnits ?? null;
  }
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

/** 단가 케이스 — 첫 실행이면 시드를 심는다. 채널 축이 없던 때의 파일은 턴키로 읽는다. */
async function loadRules(): Promise<PricingRule[]> {
  try {
    const list = JSON.parse(await fs.readFile(RULES_FILE, 'utf8')) as PricingRule[];
    return list.map((r) => ({ ...r, channel: r.channel ?? '턴키' }));
  } catch {
    await saveRules(PRICING_RULES).catch(() => {});
    return PRICING_RULES;
  }
}

async function saveRules(list: PricingRule[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${RULES_FILE}.${process.pid}.${writeSeq++}.tmp`;
  try {
    await fs.writeFile(tmp, JSON.stringify(list, null, 2), 'utf8');
    await fs.rename(tmp, RULES_FILE);
  } finally {
    await fs.rm(tmp, { force: true });
  }
}

/** 조립 함수에 넘길 표 */
const ruleMap = async (): Promise<RuleMap> =>
  new Map((await loadRules()).map((r) => [r.id, r]));

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
    const [records, rules] = await Promise.all([load(), ruleMap()]);
    return records
      .filter((r) => canAccessProject(viewer.role, viewer.org, r.project))
      .map((r) => summaryOf(r, rules))
      .sort(byStalled);
  },

  async listSettlements(viewer: Viewer): Promise<SettlementSummary[]> {
    // 관리자가 아니면 금액을 조립조차 하지 않는다
    if (viewer.role !== 'admin') return [];
    const [records, rules] = await Promise.all([load(), ruleMap()]);
    return records
      .map((r) => settlementSummaryOf(r, rules))
      .sort((a, b) => b.planTotal - a.planTotal);
  },

  async getProject(id: string, viewer: Viewer): Promise<ProjectDetail | null> {
    const [records, rules] = await Promise.all([load(), ruleMap()]);
    const r = records.find((x) => x.project.id === id);
    if (!r || !canAccessProject(viewer.role, viewer.org, r.project)) return null;
    return redactForViewer(
      toDetail(r, rules),
      effectiveVisibility(viewer.role, viewer.org, r.project)
    );
  },

  async listPayouts(viewer: Viewer): Promise<PayoutRow[]> {
    const [records, rules] = await Promise.all([load(), ruleMap()]);
    return records
      .filter((r) => canAccessProject(viewer.role, viewer.org, r.project))
      .flatMap((r) => payoutRowsOf(r, viewer, rules));
  },

  async createProject(draft: IntakeDraft, actor): Promise<string> {
    const records = await load();
    const id = nextId(records);
    const day = today();

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
      contractConfirmedAt: null, createdAt: day,
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
      uploadedAt: submitted.has(kind) ? day : null,
    }));

    records.push({
      project, lines, documents,
      process: emptyProcess(id),
      settlementRaw: emptySettlement(id),
      collected: {},
      court: '한백', // 접수하면 공이 한백으로 넘어간다 (검수 차례)
      lastProgressAt: day,
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
    // 반려는 앞서 한 계약 확인을 무효로 만들고, 공을 영업사로 넘긴다 (pg-store 와 같은 판정)
    if (input.status === 'rejected') {
      r.project.contractConfirmedAt = null;
      r.court = '영업사';
    }
    r.lastProgressAt = today();
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
        at: stamp(),
        editedAt: null,
      },
      ...(r.notes ?? []),
    ];
    // 남기는 것은 진척이다 (pg-store 와 같은 판정)
    r.lastProgressAt = today();
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
    note.editedAt = stamp();
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
    let suggestedSettlement: string | null = null;
    if (pricingRuleId) {
      const rule = (await loadRules()).find((x) => x.id === pricingRuleId);
      if (!rule) throw new Error('없는 단가 케이스입니다.');
      if (!rule.active) throw new Error('중지된 단가 케이스는 지정할 수 없습니다.');
      suggestedSettlement = rule.defaultSettlementRuleId || null;
    }
    const records = await load();
    const r = records.find((x) => x.lines.some((l) => l.id === lineId));
    if (!r) throw new Error('계약 라인을 찾을 수 없습니다.');
    const line = r.lines.find((l) => l.id === lineId)!;
    if (line.pricingRuleId === pricingRuleId) return;
    const day = today();
    line.pricingRuleId = pricingRuleId;
    line.pricedAt = pricingRuleId ? day : null;
    // 케이스의 정산 규칙 제안값을 현장에 옮긴다 — 없을 때만 (pg-store 와 같은 판정)
    if (suggestedSettlement && !r.project.settlementRuleId) {
      r.project.settlementRuleId = suggestedSettlement;
      r.project.settlementAppliedAt = day;
    }
    r.lastProgressAt = day;
    await save(records);
  },

  async setPayment(projectId, patch, actor): Promise<void> {
    if (actor.role !== 'admin') throw new Error('지급 정보 저장은 한백 관리자만 할 수 있습니다.');
    const records = await load();
    const r = records.find((x) => x.project.id === projectId);
    if (!r) throw new Error('현장을 찾을 수 없습니다.');
    Object.assign(r.settlementRaw, patch);
    r.lastProgressAt = today();
    await save(records);
  },

  async setSettlementRule(projectId, ruleId, actor): Promise<void> {
    if (actor.role !== 'admin') throw new Error('정산 규칙 적용은 한백 관리자만 할 수 있습니다.');
    // 규칙의 정본은 코드다 — 없는 규칙을 넣으면 화면에서 미적용으로 보인다 (pg-store 와 같은 판정)
    if (ruleId !== null) {
      const rule = SETTLEMENT_RULE_BY_ID.get(ruleId);
      if (!rule) throw new Error('없는 정산 규칙입니다.');
      if (!rule.active) throw new Error('중지된 정산 규칙은 적용할 수 없습니다.');
    }
    const records = await load();
    const r = records.find((x) => x.project.id === projectId);
    if (!r) throw new Error('현장을 찾을 수 없습니다.');
    if (r.project.settlementRuleId === ruleId) return;
    // lastProgressAt 은 건드리지 않는다 — 규칙을 고르는 것은 설정이지 현장의 진척이 아니다
    r.project.settlementRuleId = ruleId;
    r.project.settlementAppliedAt = ruleId ? today() : null;
    await save(records);
  },

  async runPayoutBatch(items, at, actor): Promise<{ count: number; total: number }> {
    if (actor.role !== 'admin') throw new Error('지급 처리는 한백 관리자만 할 수 있습니다.');
    if (items.length === 0) throw new Error('지급할 항목이 없습니다.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(at)) throw new Error('지급일은 YYYY-MM-DD 형식이어야 합니다.');
    const records = await load();
    const rules = new Map((await loadRules()).map((r) => [r.id, r]));
    let total = 0;
    for (const item of items) {
      const r = records.find((x) => x.project.id === item.projectId);
      if (!r) throw new Error(`현장을 찾을 수 없습니다 — ${item.projectId}`);
      const plan = r.lines.reduce((n, l) => {
        const rule = l.pricingRuleId ? rules.get(l.pricingRuleId) : null;
        const unit = item.kind === '영업비' ? rule?.salesUnit : rule?.consUnit;
        return n + (unit ?? 0) * l.qty;
      }, 0);
      const entries = r.payoutEntries ?? [];
      const { adjust, paid } = payoutSideOf(entries, item.kind);
      const { open } = payoutStepsOf(plan, adjust, paid);
      if (!open) throw new Error(`${r.project.name} ${item.kind} — 지급할 회차가 없습니다 (잔액 0 이거나 이미 나갔습니다).`);
      const category = `${open.no}차` as const;
      if (entries.some((e) => e.kind === item.kind && e.category === category)) {
        throw new Error(`${r.project.name} ${item.kind} ${category} — 이미 지급 처리된 회차입니다.`);
      }
      r.payoutEntries = entries;
      r.payoutEntries.push({
        id: crypto.randomUUID(), projectId: item.projectId,
        kind: item.kind, category, amount: open.amount, at, note: null, createdAt: stamp(),
      });
      r.lastProgressAt = today();
      total += open.amount;
    }
    await save(records);
    return { count: items.length, total };
  },

  async addPayoutEntry(projectId, input, actor): Promise<string> {
    if (actor.role !== 'admin') throw new Error('지급 기록은 한백 관리자만 할 수 있습니다.');
    // 회차(1차·2차)는 여기로 못 들어온다 — 금액이 정해져 있어 runPayoutBatch 가 계산해 넣는다
    const bad = checkPayoutEntry(input, { manualOnly: true });
    if (bad) throw new Error(bad);
    const records = await load();
    const r = records.find((x) => x.project.id === projectId);
    if (!r) throw new Error('현장을 찾을 수 없습니다.');
    const id = crypto.randomUUID();
    r.payoutEntries = r.payoutEntries ?? [];
    r.payoutEntries.push({
      id, projectId,
      kind: input.kind, category: input.category, amount: input.amount, at: input.at,
      note: typeof input.note === 'string' && input.note.trim() ? input.note.trim() : null,
      createdAt: stamp(),
    });
    r.lastProgressAt = today();
    await save(records);
    return id;
  },

  async deletePayoutEntry(projectId, entryId, actor): Promise<void> {
    if (actor.role !== 'admin') throw new Error('지급 기록 삭제는 한백 관리자만 할 수 있습니다.');
    const records = await load();
    const r = records.find((x) => x.project.id === projectId);
    if (!r) throw new Error('현장을 찾을 수 없습니다.');
    const idx = (r.payoutEntries ?? []).findIndex((e) => e.id === entryId);
    if (idx < 0) throw new Error('지급 기록을 찾을 수 없습니다.');
    r.payoutEntries!.splice(idx, 1);
    await save(records);
  },

  async uploadDocument(input, actor): Promise<void> {
    const records = await load();
    const r = records.find((x) => x.project.id === input.projectId);
    if (!r) throw new Error('현장을 찾을 수 없습니다.');
    if (!canAccessProject(actor.role, actor.org, r.project)) {
      throw new Error('이 현장에 서류를 올릴 권한이 없습니다.');
    }
    const day = today();
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
    doc.uploadedAt = day;
    r.court = '한백';
    r.lastProgressAt = day;
    await save(records);
  },

  async setEnvQueueNo(projectId, value, actor): Promise<void> {
    if (actor.role !== 'admin') throw new Error('환경부 대기번호 입력은 한백 관리자만 할 수 있습니다.');
    const records = await load();
    const r = records.find((x) => x.project.id === projectId);
    if (!r) throw new Error('현장을 찾을 수 없습니다.');
    // 자체투자는 환경부 보조금을 받지 않는다 — 대기번호가 없다 (pg-store 와 같은 판정)
    if (r.project.bizType === '자체투자' && value !== null) {
      throw new Error('자체투자 현장은 환경부 대기번호가 없습니다.');
    }
    if (r.project.envQueueNo === value) return;
    r.project.envQueueNo = value;
    r.lastProgressAt = today();
    await save(records);
  },

  async updateProcess(projectId, patch, actor): Promise<void> {
    const records = await load();
    const r = records.find((x) => x.project.id === projectId);
    if (!r) throw new Error('현장을 찾을 수 없습니다.');
    // 한백은 전부, 그 현장의 시공사는 한백 전용 칸을 뺀 전부 (pg-store 와 같은 판정)
    assertProcessWrite(actor, r.project.gcOrg, Object.keys(patch));
    Object.assign(r.process, patch);
    r.lastProgressAt = today();
    await save(records);
  },

  async setProcessStatus(projectId, status, actor): Promise<void> {
    if (actor.role !== 'admin') throw new Error('진행 단계 옮기기는 한백 관리자만 할 수 있습니다.');
    const records = await load();
    const r = records.find((x) => x.project.id === projectId);
    if (!r) throw new Error('현장을 찾을 수 없습니다.');
    if (r.process.status === status) return;

    // 계약이 끝나지 않은 현장은 공정에 없다 — 상세의 시공 탭이 잠기는 것과 같은 규칙이다
    if (toDetail(r, await ruleMap()).stage === 'intake') {
      throw new Error('계약이 끝나기 전에는 진행 단계를 옮길 수 없습니다.');
    }
    const entry = canEnter(status as ProcessStatus, r.process);
    if (!entry.ok) throw new Error(`${status} 로 넘기려면 ${entry.blockedBy} 이(가) 필요합니다.`);

    r.process.status = status;
    // 상태를 옮기면 차례도 따라 넘어간다 — 다음 사람이 움직일 차례다 (pg-store 와 같은 판정)
    r.court = COURT_AFTER_STATUS[status];
    r.lastProgressAt = today();
    await save(records);
  },

  async setPreInstall(projectId, patch, actor): Promise<void> {
    const records = await load();
    const r = records.find((x) => x.project.id === projectId);
    if (!r) throw new Error('현장을 찾을 수 없습니다.');
    // 자체투자는 기설치 조사를 하지 않는다 (pg-store 와 같은 판정)
    if (!needsPreInstallCheck(r.project.bizType)) {
      throw new Error('자체투자 현장은 기설치 조사를 하지 않습니다.');
    }
    // 조사는 현장에 가는 쪽이 한다 (pg-store 와 같은 판정)
    if (!canAccessProject(actor.role, actor.org, r.project)) {
      throw new Error('이 현장의 기설치를 적을 권한이 없습니다.');
    }

    if (patch.preInstall) r.project.preInstall = patch.preInstall;
    if ('preNote' in patch) r.project.preNote = patch.preNote?.trim() || null;
    if (patch.preChecked !== undefined) r.project.preChecked = patch.preChecked;
    r.lastProgressAt = today();
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
    if (confirmed && !contractStateFor(r).ready) {
      throw new Error('서류가 다 차고 반려가 없고 단가가 붙어야 계약을 확인할 수 있습니다.');
    }
    const after = confirmed ? today() : null;
    if (Boolean(r.project.contractConfirmedAt) === Boolean(after)) return;
    r.project.contractConfirmedAt = after;
    r.court = confirmed ? '시공사' : '한백';
    r.lastProgressAt = today();
    await save(records);
  },

  async listLineAxes(actor): Promise<LineAxes[]> {
    if (actor.role !== 'admin') throw new Error('단가 판정 축 조회는 한백 관리자만 할 수 있습니다.');
    const records = await load();
    return records.flatMap((r) =>
      r.lines.map((l) => ({
        lineId: l.id,
        projectId: r.project.id,
        projectName: r.project.name,
        cpo: r.project.cpo,
        bizType: r.project.bizType,
        bldgType: r.project.bldgType,
        projectReplType: r.project.replType,
        termYears: l.termYears,
        qty: l.qty,
        powerType: l.powerType,
        lineReplType: l.replType,
        pricingRuleId: l.pricingRuleId,
      }))
    );
  },

  async listPricingRules(actor): Promise<PricingRule[]> {
    if (actor.role !== 'admin') throw new Error('단가 케이스 조회는 한백 관리자만 할 수 있습니다.');
    return (await loadRules()).sort((a, b) => a.caseName.localeCompare(b.caseName, 'ko'));
  },

  async addPricingRule(input, actor): Promise<string> {
    if (actor.role !== 'admin') throw new Error('단가 케이스 추가는 한백 관리자만 할 수 있습니다.');
    const bad = checkPricingRule(input);
    if (bad.length > 0) throw new Error(bad[0]);
    const rule = normalizePricingRule(input);
    const list = await loadRules();
    const dup = duplicateOf(rule, list);
    if (dup) {
      throw new Error(`같은 조건을 덮는 케이스가 이미 있습니다 — ${dup.caseName}. 개정이라면 적용 시작을 다르게 적어주세요.`);
    }
    const id = pricingRuleId(rule, new Set(list.map((r) => r.id)));
    list.push({ ...rule, id, active: true });
    await saveRules(list);
    return id;
  },

  async setPricingRuleMeta(id, patch, actor): Promise<void> {
    if (actor.role !== 'admin') throw new Error('단가 케이스 정보 수정은 한백 관리자만 할 수 있습니다.');
    const list = await loadRules();
    const me = list.find((r) => r.id === id);
    if (!me) throw new Error('없는 단가 케이스입니다.');
    const startDate = patch.startDate !== undefined ? patch.startDate.trim() : me.startDate;
    const note = patch.note !== undefined ? (patch.note?.trim() || null) : me.note;
    if (startDate === me.startDate && note === me.note) return;
    if (!startDate) throw new Error('적용 시작을 비울 수 없습니다.');
    const next = { ...me, startDate, note };
    if (next.active) {
      const dup = duplicateOf(next, list.filter((r) => r.id !== id));
      if (dup) throw new Error(`그 적용 시작에는 같은 조건의 케이스가 이미 있습니다 — ${dup.caseName}`);
    }
    me.startDate = startDate;
    me.note = note;
    await saveRules(list);
  },

  async setPricingRuleActive(id, active, actor): Promise<void> {
    if (actor.role !== 'admin') throw new Error('단가 케이스 변경은 한백 관리자만 할 수 있습니다.');
    const list = await loadRules();
    const rule = list.find((r) => r.id === id);
    if (!rule) throw new Error('없는 단가 케이스입니다.');
    if (rule.active === active) return;
    if (active) {
      const dup = duplicateOf(rule, list.filter((r) => r.id !== id));
      if (dup) {
        throw new Error(`같은 조건을 덮는 케이스가 이미 있습니다 — ${dup.caseName}. 그쪽을 중지한 뒤 되살려주세요.`);
      }
    }
    rule.active = active;
    await saveRules(list);
  },

  async setCourt(projectId, court, actor): Promise<void> {
    if (actor.role !== 'admin') throw new Error('공 차례 넘기기는 한백 관리자만 할 수 있습니다.');
    const records = await load();
    const r = records.find((x) => x.project.id === projectId);
    if (!r) throw new Error('현장을 찾을 수 없습니다.');
    if (r.court === court) return;
    r.court = court;
    r.lastProgressAt = today();
    await save(records);
  },
};

/*
 * 감사 로그는 파일 저장소에 남기지 않는다.
 * 이 저장소는 DATABASE_URL 이 없는 로컬 개발용 대체물이고, 감사 대상이 되는 실제 운영은
 * Postgres 에서만 일어난다. 여기서 흉내만 내면 「로그가 있다」는 착각을 만든다.
 */
