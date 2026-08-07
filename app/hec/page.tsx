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
import type { Path, UseFormRegister } from 'react-hook-form';
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
  businessType: 'subsidy',
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
  siteManager: '관리소장',
  parkingSlotsSlow: '',
  evCount: '',
  siteTotalSlow: '',
  siteTotalFast: '',
};

const inputCls = contractInputClass;

/** 완속/급속 설치대수 한 쌍 입력 (별지1·별지2 사진대지/체크리스트용) */
function QtyPair({
  label,
  slowName,
  fastName,
  register,
}: {
  label: string;
  slowName: Path<HecFormData>;
  fastName: Path<HecFormData>;
  register: UseFormRegister<HecFormData>;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="w-32 text-sm font-medium text-gray-700">{label}</span>
      <span className="text-xs text-gray-500">완속</span>
      <input
        {...register(slowName)}
        type="number"
        min="0"
        placeholder="0"
        className="border border-gray-300 rounded px-2 py-1 w-20 text-sm"
      />
      <span className="text-xs text-gray-500 ml-1">급속</span>
      <input
        {...register(fastName)}
        type="number"
        min="0"
        placeholder="0"
        className="border border-gray-300 rounded px-2 py-1 w-20 text-sm"
      />
      <span className="text-xs text-gray-500">기</span>
    </div>
  );
}

export default function HecPage() {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<HecFormData>({ defaultValues });

  const [status, setStatus] = useState<SubmitStatus | null>(null);

  const buildingType = watch('buildingType');
  const dupFast = watch('dupFast');
  const dupSlow = watch('dupSlow');
  const dupDist = watch('dupDist');
  const dupOutlet = watch('dupOutlet');

  const onSubmit = async (data: HecFormData) => {
    setStatus(null);
    try {
      const { fillHecTemplate } = await import('@/lib/fillDocx-hec');
      const result = await fillHecTemplate(data);
      const filename = buildContractFilename(
        data.contractYear,
        data.businessType === 'invest' ? '계약서류_HEC자체투자' : '계약서류_HEC',
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
    <ContractPageShell title="현대엔지니어링 계약서 자동생성">
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
            setValue={setValue}
            watch={watch}
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
            buildingType={buildingType}
            dupFast={dupFast}
            dupSlow={dupSlow}
            dupDist={dupDist}
            dupOutlet={dupOutlet}
          />

          <Section title="4. 사전 체크리스트 설치대수 (별지2)">
            <p className="text-xs text-gray-500 -mt-1">
              충전시설 총 설치대수를 입력하면 사전 체크리스트([별지2]) 헤더에 자동 반영됩니다.
              조사일·현장명은 위 입력값이 자동 사용됩니다. (사진대지[별지1]는 Word에서 직접 작성)
            </p>
            <div className="space-y-3">
              <QtyPair label="충전시설 총 설치대수" slowName="siteTotalSlow" fastName="siteTotalFast" register={register} />
            </div>
          </Section>

          <FormActions status={status} isSubmitting={isSubmitting} />
        </form>

    </ContractPageShell>
  );
}
