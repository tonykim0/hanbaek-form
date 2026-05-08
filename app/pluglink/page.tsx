'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  ConsultingSection,
  ContractInfoSection,
  CustomerInfoSection,
} from '@/components/contracts/ContractFormSections';
import {
  ContractPageShell,
  FormActions,
  NoticePanel,
  type SubmitStatus,
} from '@/components/contracts/PageChrome';
import {
  buildContractFilename,
  DEFAULT_YEAR,
  formatBasicSuccessMessage,
} from '@/lib/contract-form';
import { downloadBlob } from '@/lib/download';
import { ContractFormData } from '@/lib/schema';

const defaultValues: Partial<ContractFormData> = {
  contractYear: DEFAULT_YEAR,
  contractMonth: '',
  contractDay: '',
  contractTerm: '7',
  salesCompany: '한비',
  salesName: '김종혁',
  salesTel: '010-3627-7047',
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
};

export default function App() {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ContractFormData>({ defaultValues });

  const [status, setStatus] = useState<SubmitStatus | null>(null);

  const dupFast = watch('dupFast');
  const dupSlow = watch('dupSlow');
  const dupDist = watch('dupDist');
  const dupOutlet = watch('dupOutlet');

  const onSubmit = async (data: ContractFormData) => {
    setStatus(null);
    try {
      const { fillContractTemplate } = await import('@/lib/fillDocx');
      const result = await fillContractTemplate(data);
      const filename = buildContractFilename(data.contractYear, '계약서류', data.custName);
      downloadBlob(result.blob, filename);
      setStatus({
        kind: 'success',
        msg: formatBasicSuccessMessage(result, filename),
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
    <ContractPageShell
      title="플러그링크 계약서 자동생성"
      footerText="한백 EV Infra Solutions · Internal Tool · v2"
    >
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6"
        >
          <CustomerInfoSection
            register={register}
            errors={errors}
            addressPlaceholder="광주광역시 광산구 비아로 23"
            telPlaceholder="062-954-1122"
          />

          <ContractInfoSection
            register={register}
            errors={errors}
            installQtyPlaceholder="7"
          />

          <ConsultingSection
            register={register}
            errors={errors}
            title=""
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
            title: 'ℹ️ 자동 처리되는 항목 (별지5호)',
            items: [
              <>결제방식 → <strong>후불청구(회원결제)</strong> (템플릿 고정)</>,
              <>개인정보 수집·이용 동의 → <strong>동의함</strong> (템플릿 고정)</>,
              <>개인정보 제3자 위탁·제공 동의 → <strong>동의함</strong> (템플릿 고정)</>,
            ],
          },
          {
            title: '⚠️ Word에서 수동 확인 필요',
            items: ['별지5호 시설 종류 (공동주택/사업장/소상공인/기타) — 단지마다 거의 동일'],
          },
        ]}
      />
    </ContractPageShell>
  );
}
