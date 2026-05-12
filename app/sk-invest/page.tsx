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
  NoticePanel,
  type SubmitStatus,
} from '@/components/contracts/PageChrome';
import {
  buildContractFilename,
  DEFAULT_YEAR,
  formatAdvancedSuccessMessage,
} from '@/lib/contract-form';
import { downloadBlob } from '@/lib/download';
import { SkInvestFormData } from '@/lib/schema-sk-invest';

const defaultValues: Partial<SkInvestFormData> = {
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
  installLocation: '',
  ownership: 'own',
  ownerRelation: 'self',
  powerSupply: '',
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

export default function SkInvestPage() {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SkInvestFormData>({ defaultValues });

  const [status, setStatus] = useState<SubmitStatus | null>(null);

  const dupFast = watch('dupFast');
  const dupSlow = watch('dupSlow');
  const dupDist = watch('dupDist');
  const dupOutlet = watch('dupOutlet');

  const onSubmit = async (data: SkInvestFormData) => {
    setStatus(null);
    try {
      const { fillSkInvestTemplate } = await import('@/lib/fillDocx-sk-invest');
      const result = await fillSkInvestTemplate(data);
      const filename = buildContractFilename(data.contractYear, '계약서류_SK자체투자', data.custName);
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
    <ContractPageShell title="SK일렉링크 자체투자 계약서 자동생성">
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6"
        >
          <CustomerInfoSection register={register} errors={errors}>
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

      <NoticePanel
        sections={[
          {
            title: '자동 처리 항목',
            items: [
              <>충전기 종류 → <strong>BAS1007.D1.1</strong> 자동 체크</>,
            ],
          },
        ]}
      />
    </ContractPageShell>
  );
}
