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
import { NiceFormData } from '@/lib/schema-nice';

const defaultValues: Partial<NiceFormData> = {
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

  const dupFast = watch('dupFast');
  const dupSlow = watch('dupSlow');
  const dupDist = watch('dupDist');
  const dupOutlet = watch('dupOutlet');

  const onSubmit = async (data: NiceFormData) => {
    setStatus(null);
    try {
      const { fillNiceTemplate } = await import('@/lib/fillDocx-nice');
      const result = await fillNiceTemplate(data);
      const filename = buildContractFilename(data.contractYear, '계약서류_NICE', data.custName);
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
          className="space-y-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6"
        >
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
              <p className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded px-3 py-2">
                📣 특별 프로모션: <b>7년 계약</b> 선택 시 6개월 동안 149원 제공 /{' '}
                <b>10년 계약</b> 선택 시 6개월 동안 149원 + 6개월 동안 220원 제공
                <span className="block text-xs text-blue-600 mt-0.5">
                  선택한 계약기간에 따라 합의서 프로모션 문구가 자동 반영됩니다.
                </span>
              </p>
            }
            afterInstallAddr={
              <Field label="상세위치">
              <input
                {...register('installDetailLocation')}
                className={inputCls}
                placeholder="예: 지하 1층 06,12 기둥 옆"
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
              <>단가 → <strong>3,600,000원</strong> × 수량 = 계약금액 자동 계산</>,
              <>충전기 모델명 → <strong>공란</strong> (Word에서 수동 입력)</>,
              <>별지5호 결제방식 → <strong>후불청구(회원결제)</strong> (템플릿 고정)</>,
              <>개인정보 수집·이용 동의 → <strong>동의함</strong> (템플릿 고정)</>,
            ],
          },
        ]}
      />
    </ContractPageShell>
  );
}
