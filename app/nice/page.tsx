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
import {
  ContractPageShell,
  FormActions,
  type SubmitStatus,
} from '@/components/contracts/PageChrome';
import {
  buildContractFilename,
  DEFAULT_YEAR,
  formatAdvancedSuccessMessage,
} from '@/lib/contract-form';
import { downloadBlob } from '@/lib/download';
import { NiceFormData } from '@/lib/schema-nice';

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
    formState: { errors, isSubmitting },
  } = useForm<NiceFormData>({ defaultValues });

  const [status, setStatus] = useState<SubmitStatus | null>(null);

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
      const filename = buildContractFilename(
        data.contractYear,
        data.businessType === 'invest' ? '계약서류_NICE자체투자' : '계약서류_NICE',
        data.custName,
      );
      downloadBlob(result.blob, filename);
      setStatus({
        kind: 'success',
        msg: formatAdvancedSuccessMessage(result, filename),
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

          <FormActions status={status} isSubmitting={isSubmitting} />
        </form>

    </ContractPageShell>
  );
}
