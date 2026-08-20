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
import CpoTwoPageAutoReissue from '@/components/contracts/NiceTwoPageAutoReissue';
import {
  ContractPageShell,
  FormActions,
  type SubmitStatus,
} from '@/components/contracts/PageChrome';
import { DEFAULT_YEAR, formatAdvancedSuccessMessage } from '@/lib/contract-form';
import { downloadBlob } from '@/lib/download';
import { SkFormData } from '@/lib/schema-sk';
import { useInternalModeState } from '@/lib/use-internal-mode';
import { useDocScope } from '@/lib/use-doc-scope';

const defaultValues: Partial<SkFormData> = {
  businessType: 'subsidy',
  contractYear: DEFAULT_YEAR,
  contractMonth: '',
  contractDay: '',
  contractTerm: '10',
  salesCompany: '한백이엔씨',
  salesName: '류승종',
  salesTel: '010-8696-0898',
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
};

const inputCls = contractInputClass;

export default function SkPage() {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SkFormData>({ defaultValues });

  const [status, setStatus] = useState<SubmitStatus | null>(null);
  // SK 템플릿에는 사진대지·체크리스트가 없어 토글을 감춥니다.
  const { finalize } = useDocScope();
  // 협력사 스캔본 판독은 담당자 전용 — ?import=1 일 때만 노출합니다.
  const internalMode = useInternalModeState();

  const buildingType = watch('buildingType');
  const dupFast = watch('dupFast');
  const dupSlow = watch('dupSlow');
  const dupDist = watch('dupDist');
  const dupOutlet = watch('dupOutlet');

  const onSubmit = async (data: SkFormData) => {
    setStatus(null);
    try {
      const { fillSkTemplate } = await import('@/lib/fillDocx-sk');
      const result = await fillSkTemplate(data);
      const output = await finalize(result.blob, {
        contractYear: data.contractYear,
        custName: data.custName,
        documentLabel:
          data.businessType === 'invest' ? '계약서류_SK자체투자' : '계약서류_SK',
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
      <ContractPageShell title="SK일렉링크">
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-8 text-center text-sm font-semibold text-slate-500">
          화면을 불러오는 중입니다...
        </div>
      </ContractPageShell>
    );
  }

  if (internalMode) {
    return (
      <ContractPageShell title="SK일렉링크 2개 서류 자동 재발행">
        <CpoTwoPageAutoReissue cpo="sk" />
      </ContractPageShell>
    );
  }

  return (
    <ContractPageShell title="SK일렉링크 계약서 자동생성">
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

          <FormActions
            status={status}
            isSubmitting={isSubmitting}
          />
        </form>

    </ContractPageShell>
  );
}
