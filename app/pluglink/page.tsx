'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  ConsultingSection,
  ContractInfoSection,
  CustomerInfoSection,
} from '@/components/contracts/ContractFormSections';
import { Radio, RadioField, Section } from '@/components/contracts/FormControls';
import CpoTwoPageAutoReissue from '@/components/contracts/NiceTwoPageAutoReissue';
import {
  ContractPageShell,
  FormActions,
  type SubmitStatus,
} from '@/components/contracts/PageChrome';
import { DEFAULT_YEAR, formatBasicSuccessMessage } from '@/lib/contract-form';
import { downloadBlob } from '@/lib/download';
import { ContractFormData } from '@/lib/schema';
import { useInternalModeState } from '@/lib/use-internal-mode';
import { useDocScope } from '@/lib/use-doc-scope';

const defaultValues: Partial<ContractFormData> = {
  businessType: 'subsidy',
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
};

export default function App() {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ContractFormData>({ defaultValues });

  const [status, setStatus] = useState<SubmitStatus | null>(null);
  // 플러그링크 템플릿에는 사진대지·체크리스트가 없어 토글을 감춥니다.
  const { finalize } = useDocScope();
  // 협력사 스캔본 판독은 담당자 전용 — ?import=1 일 때만 노출합니다.
  const internalMode = useInternalModeState();

  const buildingType = watch('buildingType');
  const dupFast = watch('dupFast');
  const dupSlow = watch('dupSlow');
  const dupDist = watch('dupDist');
  const dupOutlet = watch('dupOutlet');

  const onSubmit = async (data: ContractFormData) => {
    setStatus(null);
    try {
      const { fillContractTemplate } = await import('@/lib/fillDocx');
      const result = await fillContractTemplate(data);
      const output = await finalize(result.blob, {
        contractYear: data.contractYear,
        custName: data.custName,
        documentLabel: '계약서류',
      });
      downloadBlob(output.blob, output.filename);
      setStatus({
        kind: 'success',
        msg: formatBasicSuccessMessage(result, output.filename) + output.note,
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
      <ContractPageShell title="플러그링크">
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-8 text-center text-sm font-semibold text-slate-500">
          화면을 불러오는 중입니다...
        </div>
      </ContractPageShell>
    );
  }

  if (internalMode) {
    return (
      <ContractPageShell
        title="플러그링크 2개 서류 자동 재발행"
        footerText="한백 EV Infra Solutions · Internal Tool · v2"
      >
        <CpoTwoPageAutoReissue cpo="pluglink" />
      </ContractPageShell>
    );
  }

  return (
    <ContractPageShell
      title="플러그링크 계약서 자동생성"
      footerText="한백 EV Infra Solutions · Internal Tool · v2"
    >
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

          <CustomerInfoSection
            register={register}
            errors={errors}
            watch={watch}
            addressPlaceholder="광주광역시 광산구 비아로 23"
            telPlaceholder="062-954-1122"
          />

          <ContractInfoSection
            setValue={setValue}
            watch={watch}
            register={register}
            errors={errors}
            installQtyPlaceholder="7"
          />

          <ConsultingSection
            register={register}
            errors={errors}
            buildingType={buildingType}
            title=""
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
