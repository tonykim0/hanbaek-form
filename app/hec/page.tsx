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
import { HecFormData } from '@/lib/schema-hec';

const defaultValues: Partial<HecFormData> = {
  contractYear: DEFAULT_YEAR,
  contractMonth: '',
  contractDay: '',
  contractTerm: '7',
  salesCompany: '㈜에스아이전기',
  salesName: '신상일',
  salesTel: '010-2794-0367',
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

      <NoticePanel
        sections={[
          {
            title: '자동 처리 항목',
            items: [
              <>별지5호: 결제방식 → <strong>후불청구(회원결제)</strong> (템플릿 고정)</>,
              <>개인정보 수집·이용 동의 → <strong>동의함</strong> (템플릿 고정)</>,
              <>수량공문 담당자 → <strong>관리소장</strong> (템플릿 고정)</>,
            ],
          },
          {
            title: 'Word에서 수동 확인 필요',
            items: [
              '운영계약서 급속충전기 관련 항목 (수량, 계약기간, 모델명)',
              '수량공문 CPO별 충전기 현황표',
            ],
          },
        ]}
      />
    </ContractPageShell>
  );
}
