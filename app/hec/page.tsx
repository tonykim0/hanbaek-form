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
import { HecFormData } from '@/lib/schema-hec';

const defaultValues: Partial<HecFormData> = {
  contractYear: DEFAULT_YEAR,
  contractMonth: '',
  contractDay: '',
  contractTerm: '7',
  salesCompany: '(주) 우원',
  salesName: '정용주',
  salesTel: '010-3124-0341',
  surveyorCompany: '한백',
  surveyorName: '',
  surveyorTel: '',
  buildingType: 'apartment',
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
  siteManager: '관리소장',
  parkingSlotsSlow: '',
  evCount: '',
};

const inputCls = contractInputClass;

export default function HecPage() {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<HecFormData>({ defaultValues });

  const [status, setStatus] = useState<SubmitStatus | null>(null);

  const dupFast = watch('dupFast');
  const dupSlow = watch('dupSlow');
  const dupDist = watch('dupDist');
  const dupOutlet = watch('dupOutlet');

  const onSubmit = async (data: HecFormData) => {
    setStatus(null);
    try {
      const { fillHecTemplate } = await import('@/lib/fillDocx-hec');
      const result = await fillHecTemplate(data);
      const filename = buildContractFilename(data.contractYear, '계약서류_HEC', data.custName);
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
    <ContractPageShell title="현대엔지니어링 계약서 자동생성">
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6"
        >
          <CustomerInfoSection
            register={register}
            errors={errors}
            watch={watch}
            afterContact={
              <Field label="현장 담당자">
                <input
                  {...register('siteManager')}
                  className={inputCls}
                  placeholder="관리소장"
                />
              </Field>
            }
          >
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
            installQtyPlaceholder="7"
            gridClassName="grid grid-cols-2 md:grid-cols-3 gap-4"
            extraGridFields={
              <Field label="전기차 등록대수" required error={errors.evCount?.message}>
                <input
                  {...register('evCount', { required: '필수' })}
                  className={inputCls}
                  type="number"
                  min="1"
                  placeholder="6"
                />
              </Field>
            }
          />

          <ConsultingSection
            register={register}
            errors={errors}
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
