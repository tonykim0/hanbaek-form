'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  ConsultingSection,
  ContractInfoSection,
  CustomerInfoSection,
} from '@/components/contracts/ContractFormSections';
import {
  contractInputClass,
  Field,
  Radio,
  RadioField,
  Section,
} from '@/components/contracts/FormControls';
import NiceTwoPageAutoReissue from '@/components/contracts/NiceTwoPageAutoReissue';
import {
  ContractPageShell,
  FormActions,
  type SubmitStatus,
} from '@/components/contracts/PageChrome';
import { DEFAULT_YEAR, formatAdvancedSuccessMessage } from '@/lib/contract-form';
import { downloadBlob } from '@/lib/download';
import { NiceFormData } from '@/lib/schema-nice';
import { useInternalModeState } from '@/lib/use-internal-mode';
import { useDocScope } from '@/lib/use-doc-scope';

const defaultValues: Partial<NiceFormData> = {
  businessType: 'subsidy',
  contractYear: DEFAULT_YEAR,
  contractMonth: '',
  contractDay: '',
  contractTerm: '10',
  salesCompany: '한백',
  salesName: '김정우',
  salesTel: '010-5343-9983',
  surveyorCompany: '한백',
  surveyorName: '',
  surveyorTel: '',
  buildingType: 'apartment',
  buildingTypeEtc: '',
  installLocIndoor: false,
  installLocOutdoor: false,
  ownership: 'own',
  ownerRelation: 'self',
  powerMoja: false,
  powerHanjeon: false,
  installTypeWall: false,
  installTypeStand: false,
  dupFast: false,
  dupFastQty: '',
  dupSlow: false,
  dupSlowQty: '',
  dupDist: false,
  dupDistQty: '',
  dupOutlet: false,
  dupOutletQty: '',
  dupKiosk: false,
  custRepresentative: '',
  installDetailLocation: '',
};

const inputCls = contractInputClass;

export default function NicePage() {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<NiceFormData>({ defaultValues });

  const [status, setStatus] = useState<SubmitStatus | null>(null);
  // NICE 템플릿에는 사진대지·체크리스트가 없어 토글을 감춥니다.
  const { docScope, finalize } = useDocScope();
  // 협력사 스캔본 판독은 담당자 전용 — ?import=1 일 때만 노출합니다.
  const internalMode = useInternalModeState();

  const buildingType = watch('buildingType');
  const dupFast = watch('dupFast');
  const dupSlow = watch('dupSlow');
  const dupDist = watch('dupDist');
  const dupOutlet = watch('dupOutlet');

  const onSubmit = async (data: NiceFormData) => {
    setStatus(null);
    try {
      const { fillNiceTemplate } = await import('@/lib/fillDocx-nice');
      const result = await fillNiceTemplate(data);
      const output = await finalize(result.blob, {
        contractYear: data.contractYear,
        custName: data.custName,
        documentLabel:
          data.businessType === 'invest' ? '계약서류_NICE자체투자' : '계약서류_NICE',
      });
      downloadBlob(output.blob, output.filename);
      setStatus({
        kind: 'success',
        msg: formatAdvancedSuccessMessage(result, output.filename) + output.note,
      });
      if (result.unmatchedIds.length > 0) {
        console.warn('Unmatched SDT IDs (template drift):', result.unmatchedIds);
      }
    } catch (err) {
      setStatus({
        kind: 'error',
        msg: err instanceof Error ? err.message : String(err),
      });
    }
  };

  if (internalMode === null) {
    return (
      <ContractPageShell title="나이스인프라">
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-8 text-center text-sm font-semibold text-slate-500">
          화면을 불러오는 중입니다...
        </div>
      </ContractPageShell>
    );
  }

  if (internalMode) {
    return (
      <ContractPageShell title="나이스인프라 2개 서류 자동 재발행">
        <NiceTwoPageAutoReissue />
      </ContractPageShell>
    );
  }

  return (
    <ContractPageShell title="나이스인프라 계약서 자동생성">
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-4 pb-2"
        >
          <Section title="사업구분">
            <RadioField label="계약 유형" hint="선택에 따라 생성되는 계약서 양식이 달라집니다 (입력 항목은 동일)">
              <Radio name="businessType" value="subsidy" register={register} label="보조금사업" />
              <Radio name="businessType" value="invest" register={register} label="자체투자" />
            </RadioField>
          </Section>

          <CustomerInfoSection register={register} errors={errors} watch={watch}>
            <Field label="사업자등록증상 대표자" required error={errors.custRepresentative?.message}>
              <input
                {...register('custRepresentative', { required: '대표자명은 필수입니다' })}
                className={inputCls}
                placeholder="예: 홍길동"
              />
            </Field>
          </CustomerInfoSection>

          <ContractInfoSection
            setValue={setValue}
            watch={watch}
            register={register}
            errors={errors}
            installQtyPlaceholder="3"
            contractTermLabels={{ seven: '7년 (84개월)', ten: '10년 (120개월)' }}
            contractTermHint={
              <p className="text-sm text-brand-700 bg-brand-50 border border-brand-200 rounded px-3 py-2">
                📣 특별 프로모션: <b>7년 계약</b> 선택 시 6개월 동안 149원 제공 /{' '}
                <b>10년 계약</b> 선택 시 6개월 동안 149원 + 6개월 동안 220원 제공
                <span className="block text-xs text-brand-600 mt-0.5">
                  선택한 계약기간에 따라 합의서 프로모션 문구가 자동 반영됩니다.
                </span>
              </p>
            }
            afterInstallAddr={
              <Field
                label="상세위치"
                required
                error={errors.installDetailLocation?.message as string | undefined}
              >
              <input
                {...register('installDetailLocation', { required: '필수' })}
                className={inputCls}
                placeholder="예: 지하 1층 06,12 기둥 옆"
              />
            </Field>
            }
          />

          <ConsultingSection
            register={register}
            errors={errors}
            buildingType={buildingType}
            dupFast={dupFast}
            dupSlow={dupSlow}
            dupDist={dupDist}
            dupOutlet={dupOutlet}
          />

          {/*
            「컨설팅결과서만」도 재발행 도구라 담당자 모드에서만 보입니다 —
            협력사·영업자에게는 이 화면이 기능 추가 이전과 똑같이 보입니다.
          */}
          <FormActions
            status={status}
            isSubmitting={isSubmitting}
            docScope={internalMode ? docScope : undefined}
          />
        </form>

    </ContractPageShell>
  );
}
