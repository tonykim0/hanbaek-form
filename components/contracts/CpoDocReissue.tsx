'use client';

/**
 * 서류 재발행 — 협력사가 보낸 옛 양식 스캔본을 최신 운영사 양식으로 다시 뽑는다.
 *
 * ★서류마다 따로 넣고 따로 받는다★ (한백 지시 2026-08-26). 설치신청서만 다시
 * 필요한 일이 있고 결과서만 필요한 일이 따로 있어서, 둘을 한 파일로 묶어 주면
 * 필요 없는 장을 사람이 지워야 했다. 두 칸은 서로를 기다리지 않는다.
 *
 * 판독은 그 서류 하나만 보고 한다 — 다른 서류에만 있는 칸(설치신청서의 모집대행사)은
 * 그 서류를 넣었을 때만 채워지므로, 빈칸 보고도 서류별로 갈랐다.
 *
 * 결과서의 조사자 칸은 예외다 — 원본에서 읽지 않고 운영사별 고정 모집대행사 값을 쓰고,
 * 그 표에서 원본을 따르는 것은 조사일뿐이다(toCommonFormData 주석).
 */

import { useState } from 'react';
import { buildContractFilename, DEFAULT_YEAR, SALES_DEFAULT } from '@/lib/contract-form';
import { downloadBlob } from '@/lib/download';
import {
  FIELD_LABELS,
  LOW_CONFIDENCE_THRESHOLD,
  type CpoKey,
  type FormImportResult,
  type ImportedFieldKey,
} from '@/lib/form-import';
import { importFormFromPdf, type ImportPhase } from '@/lib/import-client';
import type { DocumentSection } from '@/lib/slice-docx';
import type { ContractFormData } from '@/lib/schema';
import type { HecFormData } from '@/lib/schema-hec';
import type { NiceFormData } from '@/lib/schema-nice';
import type { SkFormData } from '@/lib/schema-sk';

interface AutoReissueConfig {
  operatorName: string;
  shortName: string;
  defaultContractTerm: '7' | '10';
}

const CONFIG: Record<CpoKey, AutoReissueConfig> = {
  hec: {
    operatorName: '현대엔지니어링',
    shortName: 'HEC',
    defaultContractTerm: '7',
  },
  nice: {
    operatorName: '나이스인프라',
    shortName: 'NICE',
    defaultContractTerm: '10',
  },
  sk: {
    operatorName: 'SK일렉링크',
    shortName: 'SK',
    defaultContractTerm: '10',
  },
  pluglink: {
    operatorName: '플러그링크',
    shortName: '플러그링크',
    defaultContractTerm: '7',
  },
};

/** 두 서류에 다 있는 칸 — 어느 쪽을 넣어도 채워져야 한다 */
const SHARED_FIELDS: readonly ImportedFieldKey[] = [
  'custName',
  'custAddr',
  'installAddr',
  'installQty',
  'contractYear',
  'contractMonth',
  'contractDay',
  'parkingLotCount',
  'siteCategory',
];

interface DocSpec {
  section: DocumentSection;
  /** 화면에 쓰는 이름 */
  label: string;
  /** 양식 번호 — 협력사가 부르는 이름이라 같이 적는다 */
  formNo: string;
  /** 파일 이름에 들어가는 이름 */
  fileLabel: string;
  /** 판독 결과에 이 서류가 있는지 보는 자리 */
  detect: RegExp;
  /** 이 서류를 뽑는 데 필요한 칸 */
  required: readonly ImportedFieldKey[];
}

const DOCS: readonly DocSpec[] = [
  {
    section: 'application',
    label: '설치신청서',
    formNo: '별지5호',
    fileLabel: '설치신청서',
    detect: /별지제?5호|설치신청서/,
    required: [...SHARED_FIELDS, 'custBizId', 'custTel', 'salesCompany', 'salesName', 'salesTel'],
  },
  {
    section: 'consulting',
    label: '사전현장컨설팅 결과서',
    formNo: '별지7호',
    fileLabel: '사전현장컨설팅결과서',
    detect: /별지제?7호|사전현장컨설팅|컨설팅결과서/,
    required: [
      ...SHARED_FIELDS,
      'buildingType',
      'ownership',
      'ownerRelation',
      // 조사자 세 칸은 읽은 값을 쓰지 않는다(고정 모집대행사 값) — 못 읽었다고 셀 것도 없다
      'dupNone',
    ],
  },
];

export default function CpoDocReissue({ cpo }: { cpo: CpoKey }) {
  const config = CONFIG[cpo];
  return (
    <div className="space-y-4 text-left">
      {DOCS.map((doc) => (
        <DocReissueCard key={doc.section} cpo={cpo} config={config} doc={doc} />
      ))}
    </div>
  );
}

function DocReissueCard({
  cpo,
  config,
  doc,
}: {
  cpo: CpoKey;
  config: AutoReissueConfig;
  doc: DocSpec;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<ImportPhase | { kind: 'generating' } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FormImportResult | null>(null);
  const [filename, setFilename] = useState<string | null>(null);

  const busy = phase !== null;

  const pick = (selected: FileList | null) => {
    const picked = selected?.[0];
    if (!picked) return;
    if (!picked.name.toLowerCase().endsWith('.pdf') && picked.type !== 'application/pdf') {
      setError('PDF 파일만 판독할 수 있습니다.');
      return;
    }
    setError(null);
    setResult(null);
    setFilename(null);
    setFile(picked);
  };

  const run = async () => {
    if (!file) return;
    setError(null);
    setResult(null);
    setFilename(null);

    try {
      const extracted = await importFormFromPdf({ file, cpo, onPhase: setPhase });
      ensureDocument(extracted, doc);

      setPhase({ kind: 'generating' });
      const filled = await fillLatestTemplate(cpo, extracted, config.defaultContractTerm);
      const { sliceSelectedDocuments } = await import('@/lib/slice-docx');
      const sliced = await sliceSelectedDocuments(filled.blob, [doc.section], {
        installQty11to30: extracted.fields.installQty11to30,
        powerSharingKw: extracted.fields.powerSharingKw,
        powerSharingQty: extracted.fields.powerSharingQty,
        powerSharingCableQty: extracted.fields.powerSharingCableQty,
        dupKioskQty: extracted.fields.dupKioskQty,
      });
      const outputName = buildContractFilename(
        filled.contractYear || DEFAULT_YEAR,
        `${config.shortName}_${doc.fileLabel}`,
        filled.custName || '미확인현장'
      );

      downloadBlob(sliced.blob, outputName);
      setResult(extracted);
      setFilename(outputName);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPhase(null);
    }
  };

  const missing = result
    ? doc.required.filter((key) => {
        const value = result.fields[key];
        return value === null || value === undefined || value === '';
      })
    : [];
  const uncertain = result
    ? doc.required.filter((key) => {
        const score = result.confidence[key];
        return typeof score === 'number' && score < LOW_CONFIDENCE_THRESHOLD;
      })
    : [];

  return (
    <section className="rounded-2xl border border-brand-200 bg-white text-left shadow-sm">
      <div className="border-b border-brand-100 bg-brand-50 px-5 py-3.5">
        <p className="text-xs font-black tracking-[0.12em] text-brand-700">
          {config.shortName} · {doc.formNo}
        </p>
        <h2 className="mt-1 text-lg font-black tracking-[-0.03em] text-slate-900">
          {doc.label} 재발행
        </h2>
      </div>

      <div className="space-y-3 p-5">
        <FileSlot
          description={`기존 ${doc.formNo} ${doc.label} PDF`}
          file={file}
          busy={busy}
          onPick={pick}
        />

        <button
          type="button"
          onClick={run}
          disabled={!file || busy}
          className="rounded-xl bg-brand-700 px-5 py-3 text-left text-sm font-bold text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {/* 못 누르는 이유를 단추 이름에 적는다 (화면 규칙 3번) */}
          {phase
            ? phaseText(phase, config.operatorName)
            : file
              ? `${doc.label} 판독 후 최신 DOCX 다운로드`
              : `${doc.formNo} PDF 를 먼저 넣으세요`}
        </button>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {error}
          </p>
        )}

        {filename && result && (
          <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-bold text-emerald-800">다운로드 완료 — {filename}</p>
            <p className="text-xs text-emerald-700">
              {result.analyzedPages}페이지를 판독했습니다.
            </p>
            {result.issues.length > 0 && (
              <Notice title="서류에서 감지한 확인사항" tone="amber">
                <ul className="ml-4 list-disc space-y-1">
                  {result.issues.map((issue, index) => <li key={index}>{issue}</li>)}
                </ul>
              </Notice>
            )}
            {missing.length > 0 && (
              <Notice title="원본에서 읽지 못해 빈칸으로 둔 항목" tone="red">
                {missing.map((key) => FIELD_LABELS[key]).join(' · ')}
              </Notice>
            )}
            {uncertain.length > 0 && (
              <Notice title="AI 판독 신뢰도가 낮은 항목" tone="amber">
                {uncertain.map((key) => FIELD_LABELS[key]).join(' · ')}
              </Notice>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function FileSlot({
  description,
  file,
  busy,
  onPick,
}: {
  description: string;
  file: File | null;
  busy: boolean;
  onPick: (files: FileList | null) => void;
}) {
  return (
    <label
      aria-disabled={busy}
      className={`block rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-left transition hover:border-brand-400 hover:bg-brand-50 ${busy ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
    >
      <input
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        disabled={busy}
        onChange={(event) => {
          onPick(event.target.files);
          event.target.value = '';
        }}
      />
      <span className="block text-xs text-slate-500">{description}</span>
      {file ? (
        <span className="mt-2 block break-all text-sm font-semibold text-brand-700">
          {file.name}
          <span className="mt-1 block text-xs font-normal text-slate-400">
            {(file.size / 1024 / 1024).toFixed(1)}MB · 클릭해서 교체
          </span>
        </span>
      ) : (
        <span className="mt-2 block text-sm font-semibold text-slate-600">PDF 선택</span>
      )}
    </label>
  );
}

function Notice({
  title,
  tone,
  children,
}: {
  title: string;
  tone: 'amber' | 'red';
  children: React.ReactNode;
}) {
  const colors = tone === 'red'
    ? 'border-red-200 bg-red-50 text-red-800'
    : 'border-amber-200 bg-amber-50 text-amber-900';
  return (
    <div className={`rounded-lg border px-3 py-2 text-left text-xs ${colors}`}>
      <p className="mb-1 font-bold">{title}</p>
      {children}
    </div>
  );
}

function phaseText(
  phase: ImportPhase | { kind: 'generating' },
  operatorName: string
): string {
  if (phase.kind === 'uploading') return `업로드 중... ${phase.percentage}%`;
  if (phase.kind === 'reading') return 'AI가 판독 중입니다...';
  return `최신 ${operatorName} 양식으로 생성 중입니다...`;
}

/** 넣은 PDF 가 그 서류인지 본다 — 엉뚱한 서류를 넣으면 빈 양식이 나온다 */
function ensureDocument(result: FormImportResult, doc: DocSpec): void {
  // 공백 제거 후 검사 — 「별지 제5호」·「별지5호」 표기가 섞여 온다.
  const names = result.detectedDocs.map((detected) => detected.name.replace(/\s/g, ''));
  if (names.some((name) => doc.detect.test(name))) return;
  throw new Error(
    `넣은 PDF 에서 ${doc.label}(${doc.formNo})를 찾지 못했습니다 — 파일을 다시 확인해주세요.`
  );
}

type CommonAutoFormData = Omit<
  ContractFormData,
  'businessType' | 'contractTerm'
> & {
  businessType: 'subsidy';
  contractTerm: '7' | '10';
  installQty11to30: string;
  powerSharingKw: string;
  powerSharingQty: string;
  powerSharingCableQty: string;
  siteCategory: '' | 'apartment' | 'business' | 'small_business' | 'etc';
  dupNone: boolean;
  preserveDocumentFields: true;
  siteTotalSlow: string;
  siteTotalFast: string;
};

function toCommonFormData(
  cpo: CpoKey,
  result: FormImportResult,
  defaultContractTerm: '7' | '10'
): CommonAutoFormData {
  const f = result.fields;
  return {
    businessType: 'subsidy',
    custName: f.custName ?? '',
    custBizId: f.custBizId ?? '',
    custAddr: f.custAddr ?? '',
    custTel: f.custTel ?? '',
    custEmail: f.custEmail ?? '',
    installAddr: f.installAddr ?? '',
    installQty: f.installQty ?? '',
    installQty11to30: f.installQty11to30 ?? '',
    powerSharingKw: f.powerSharingKw ?? '',
    powerSharingQty: f.powerSharingQty ?? '',
    powerSharingCableQty: f.powerSharingCableQty ?? '',
    contractTerm: f.contractTerm ?? defaultContractTerm,
    contractYear: f.contractYear ?? DEFAULT_YEAR,
    contractMonth: f.contractMonth ?? '',
    contractDay: f.contractDay ?? '',
    salesCompany: f.salesCompany ?? '',
    salesName: f.salesName ?? '',
    salesTel: f.salesTel ?? '',
    /*
     * ★결과서(별지7호)의 조사자 칸은 원본 스캔에서 읽은 값을 쓰지 않는다★ (한백 지시 2026-08-26).
     * 조사는 한백 쪽에서 하므로 조사업체·조사자명·연락처는 운영사별 고정 모집대행사 값이고,
     * 원본 서류에서 따오는 것은 그 표의 ★조사일★ 하나뿐이다(계약일 = 조사일).
     * 별지5호의 모집대행사 칸은 그 현장의 사실이라 읽은 값을 그대로 쓴다.
     */
    surveyorCompany: SALES_DEFAULT[cpo].company,
    surveyorName: SALES_DEFAULT[cpo].name,
    surveyorTel: SALES_DEFAULT[cpo].tel,
    parkingLotCount: f.parkingLotCount ?? '',
    siteCategory: f.siteCategory ?? '',
    buildingType: f.buildingType ?? '',
    buildingTypeEtc: f.buildingTypeEtc ?? '',
    installLocIndoor: f.installLocIndoor ?? false,
    installLocOutdoor: f.installLocOutdoor ?? false,
    ownership: f.ownership ?? '',
    ownerRelation: f.ownerRelation ?? '',
    powerMoja: f.powerMoja ?? false,
    powerHanjeon: f.powerHanjeon ?? false,
    highVoltageConfirmed: f.highVoltageConfirmed ?? false,
    lowVoltageConfirmed: f.lowVoltageConfirmed ?? false,
    installTypeWall: f.installTypeWall ?? false,
    installTypeStand: f.installTypeStand ?? false,
    dupFast: f.dupFast ?? false,
    dupFastQty: f.dupFastQty ?? '',
    dupSlow: f.dupSlow ?? false,
    dupSlowQty: f.dupSlowQty ?? '',
    dupDist: f.dupDist ?? false,
    dupDistQty: f.dupDistQty ?? '',
    dupOutlet: f.dupOutlet ?? false,
    dupOutletQty: f.dupOutletQty ?? '',
    dupKiosk: f.dupKiosk ?? false,
    dupKioskQty: f.dupKioskQty ?? '',
    dupNone: f.dupNone ?? false,
    preserveDocumentFields: true,
    siteTotalSlow: f.siteTotalSlow ?? '',
    siteTotalFast: f.siteTotalFast ?? '',
  };
}

async function fillLatestTemplate(
  cpo: CpoKey,
  result: FormImportResult,
  defaultContractTerm: '7' | '10'
): Promise<{ blob: Blob; contractYear: string; custName: string }> {
  const common = toCommonFormData(cpo, result, defaultContractTerm);
  const f = result.fields;

  if (cpo === 'hec') {
    const form: HecFormData = {
      ...common,
      custRepresentative: f.custRepresentative ?? '',
      siteManager: f.siteManager ?? '',
      parkingSlotsSlow: '',
      evCount: f.evCount ?? '',
    };
    const { fillHecTemplate } = await import('@/lib/fillDocx-hec');
    const filled = await fillHecTemplate(form);
    return { blob: filled.blob, contractYear: form.contractYear, custName: form.custName };
  }

  if (cpo === 'nice') {
    const form: NiceFormData = {
      ...common,
      custRepresentative: f.custRepresentative ?? '',
      installDetailLocation: f.installDetailLocation ?? '',
    };
    const { fillNiceTemplate } = await import('@/lib/fillDocx-nice');
    const filled = await fillNiceTemplate(form);
    return { blob: filled.blob, contractYear: form.contractYear, custName: form.custName };
  }

  if (cpo === 'sk') {
    const form: SkFormData = {
      ...common,
      custRepresentative: f.custRepresentative ?? '',
    };
    const { fillSkTemplate } = await import('@/lib/fillDocx-sk');
    const filled = await fillSkTemplate(form);
    return { blob: filled.blob, contractYear: form.contractYear, custName: form.custName };
  }

  const form: ContractFormData = common;
  const { fillContractTemplate } = await import('@/lib/fillDocx');
  const filled = await fillContractTemplate(form);
  return { blob: filled.blob, contractYear: form.contractYear, custName: form.custName };
}
