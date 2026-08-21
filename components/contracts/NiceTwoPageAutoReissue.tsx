'use client';

import { useState } from 'react';
import { buildContractFilename, DEFAULT_YEAR } from '@/lib/contract-form';
import { downloadBlob } from '@/lib/download';
import {
  FIELD_LABELS,
  LOW_CONFIDENCE_THRESHOLD,
  type CpoKey,
  type FormImportResult,
  type ImportedFieldKey,
} from '@/lib/form-import';
import { importFormFromPdf, type ImportPhase } from '@/lib/import-client';
import type { ContractFormData } from '@/lib/schema';
import type { HecFormData } from '@/lib/schema-hec';
import type { NiceFormData } from '@/lib/schema-nice';
import type { SkFormData } from '@/lib/schema-sk';

type Slot = 'application' | 'consulting';

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

const REQUIRED_FOR_OUTPUT: readonly ImportedFieldKey[] = [
  'custName',
  'custBizId',
  'custAddr',
  'custTel',
  'installAddr',
  'installQty',
  'contractYear',
  'contractMonth',
  'contractDay',
  'parkingLotCount',
  'siteCategory',
  'buildingType',
  'ownership',
  'ownerRelation',
  'salesCompany',
  'salesName',
  'salesTel',
  'surveyorCompany',
  'surveyorName',
  'surveyorTel',
  'dupNone',
];

export default function CpoTwoPageAutoReissue({ cpo }: { cpo: CpoKey }) {
  const config = CONFIG[cpo];
  const [application, setApplication] = useState<File | null>(null);
  const [consulting, setConsulting] = useState<File | null>(null);
  const [phase, setPhase] = useState<ImportPhase | { kind: 'generating' } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FormImportResult | null>(null);
  const [filename, setFilename] = useState<string | null>(null);

  const busy = phase !== null;

  const pick = (slot: Slot, selected: FileList | null) => {
    const file = selected?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setError('PDF 파일만 판독할 수 있습니다.');
      return;
    }
    setError(null);
    setResult(null);
    setFilename(null);
    if (slot === 'application') setApplication(file);
    else setConsulting(file);
  };

  const run = async () => {
    if (!application || !consulting) return;
    setError(null);
    setResult(null);
    setFilename(null);

    try {
      const merged = await mergePdfs(application, consulting);
      const extracted = await importFormFromPdf({
        file: merged,
        cpo,
        onPhase: setPhase,
      });
      ensureBothDocuments(extracted);

      setPhase({ kind: 'generating' });
      const filled = await fillLatestTemplate(
        cpo,
        extracted,
        config.defaultContractTerm
      );
      const { sliceApplicationAndConsulting } = await import('@/lib/slice-docx');
      const sliced = await sliceApplicationAndConsulting(filled.blob, {
        installQty11to30: extracted.fields.installQty11to30,
        powerSharingKw: extracted.fields.powerSharingKw,
        powerSharingQty: extracted.fields.powerSharingQty,
        powerSharingCableQty: extracted.fields.powerSharingCableQty,
        dupKioskQty: extracted.fields.dupKioskQty,
      });
      const outputName = buildContractFilename(
        filled.contractYear || DEFAULT_YEAR,
        `${config.shortName}_설치신청서_사전현장컨설팅결과서`,
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
    ? REQUIRED_FOR_OUTPUT.filter((key) => {
        const value = result.fields[key];
        return value === null || value === undefined || value === '';
      })
    : [];
  const uncertain = result
    ? REQUIRED_FOR_OUTPUT.filter((key) => {
        const score = result.confidence[key];
        return typeof score === 'number' && score < LOW_CONFIDENCE_THRESHOLD;
      })
    : [];

  return (
    <section className="rounded-2xl border border-brand-200 bg-white shadow-sm">
      <div className="border-b border-brand-100 bg-brand-50 px-5 py-4">
        <p className="text-xs font-black tracking-[0.12em] text-brand-700">
          {config.shortName} 자동 재발행
        </p>
        <h2 className="mt-1 text-xl font-black tracking-[-0.03em] text-slate-900">
          기존 2개 서류를 최신 양식으로 변환
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          설치신청서와 사전현장컨설팅 결과서 PDF를 각각 넣으면 내용을 자동 판독하고,
          최신 {config.operatorName} 양식의 해당 2페이지만 채운 DOCX를 바로 다운로드합니다.
        </p>
      </div>

      <div className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <FileSlot
            title="1. 설치신청서"
            description="기존 별지5호 설치신청서 PDF"
            file={application}
            busy={busy}
            onPick={(files) => pick('application', files)}
          />
          <FileSlot
            title="2. 사전현장컨설팅 결과서"
            description="기존 별지7호 결과서 PDF"
            file={consulting}
            busy={busy}
            onPick={(files) => pick('consulting', files)}
          />
        </div>

        <button
          type="button"
          onClick={run}
          disabled={!application || !consulting || busy}
          className="w-full rounded-xl bg-brand-700 px-5 py-3.5 text-sm font-bold text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {phase ? phaseText(phase, config.operatorName) : '두 문서 판독 후 최신 DOCX 다운로드'}
        </button>

        <p className="text-xs leading-5 text-slate-500">
          결과물에는 계약서·직인동의서·개인정보동의서가 포함되지 않습니다. 별지5호와
          별지7호만 들어갑니다.
        </p>

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
  title,
  description,
  file,
  busy,
  onPick,
}: {
  title: string;
  description: string;
  file: File | null;
  busy: boolean;
  onPick: (files: FileList | null) => void;
}) {
  return (
    <label
      aria-disabled={busy}
      className={`min-h-36 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-left transition hover:border-brand-400 hover:bg-brand-50 ${busy ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
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
      <span className="block text-sm font-black text-slate-900">{title}</span>
      <span className="mt-1 block text-xs text-slate-500">{description}</span>
      {file ? (
        <span className="mt-5 block break-all text-sm font-semibold text-brand-700">
          {file.name}
          <span className="mt-1 block text-xs font-normal text-slate-400">
            {(file.size / 1024 / 1024).toFixed(1)}MB · 클릭해서 교체
          </span>
        </span>
      ) : (
        <span className="mt-5 block text-sm font-semibold text-slate-600">PDF 선택</span>
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
    <div className={`rounded-lg border px-3 py-2 text-xs ${colors}`}>
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
  if (phase.kind === 'reading') return 'AI가 두 문서를 판독 중입니다...';
  return `최신 ${operatorName} 양식으로 생성 중입니다...`;
}

async function mergePdfs(application: File, consulting: File): Promise<File> {
  const { PDFDocument } = await import('pdf-lib');
  const output = await PDFDocument.create();

  for (const file of [application, consulting]) {
    let source: Awaited<ReturnType<typeof PDFDocument.load>>;
    try {
      source = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
    } catch {
      throw new Error(`${file.name} 파일을 열 수 없습니다. 손상 또는 암호 설정을 확인해주세요.`);
    }
    const pages = await output.copyPages(source, source.getPageIndices());
    for (const page of pages) output.addPage(page);
  }

  const bytes = await output.save();
  const pdfBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(pdfBuffer).set(bytes);
  return new File(
    [pdfBuffer],
    '설치신청서_사전현장컨설팅결과서.pdf',
    { type: 'application/pdf' }
  );
}

function ensureBothDocuments(result: FormImportResult): void {
  // 공백 제거 후 검사 — 「별지 제5호」·「별지5호」 표기가 섞여 온다.
  const names = result.detectedDocs.map((doc) => doc.name.replace(/\s/g, ''));
  const hasApplication = names.some((name) => /별지제?5호|설치신청서/.test(name));
  const hasConsulting = names.some((name) => /별지제?7호|사전현장컨설팅|컨설팅결과서/.test(name));
  if (!hasApplication || !hasConsulting) {
    throw new Error(
      `두 서류를 모두 확인하지 못했습니다. ${!hasApplication ? '설치신청서' : ''}${!hasApplication && !hasConsulting ? '와 ' : ''}${!hasConsulting ? '사전현장컨설팅 결과서' : ''} PDF를 다시 확인해주세요.`
    );
  }
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
    surveyorCompany: f.surveyorCompany ?? '',
    surveyorName: f.surveyorName ?? '',
    surveyorTel: f.surveyorTel ?? '',
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
  const common = toCommonFormData(result, defaultContractTerm);
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
