'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  Checkbox,
  contractInputClass,
  DuplicateInstallFieldset,
  Field,
  Radio,
  RadioField,
  Section,
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
  PHONE_RE,
  YEAR_OPTIONS,
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
          <Section title="1. 고객사 정보">
            <Field label="사업자등록증상 법인명 (단체명)" required error={errors.custName?.message}>
              <input
                {...register('custName', { required: '법인명은 필수입니다' })}
                className={inputCls}
                placeholder="예: OO아파트 입주자대표회의"
              />
            </Field>
            <Field label="사업자등록증상 대표자" required error={errors.custRepresentative?.message}>
              <input
                {...register('custRepresentative', { required: '대표자명은 필수입니다' })}
                className={inputCls}
                placeholder="예: 홍길동"
              />
            </Field>
            <Field label="사업자등록번호" required error={errors.custBizId?.message}>
              <input
                {...register('custBizId', {
                  required: '필수',
                  pattern: {
                    value: /^\d{3}-\d{2}-\d{5}$/,
                    message: '형식: XXX-XX-XXXXX',
                  },
                })}
                className={inputCls}
                placeholder="123-45-67890"
              />
            </Field>
            <Field label="주소 (도로명)" required error={errors.custAddr?.message}>
              <input
                {...register('custAddr', { required: '필수' })}
                className={inputCls}
                placeholder="예: 서울특별시 강남구 테헤란로 1"
              />
            </Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="대표 전화번호" required error={errors.custTel?.message}>
                <input
                  {...register('custTel', {
                    required: '필수',
                    pattern: {
                      value: PHONE_RE,
                      message: '형식: 010-1234-5678 / 02-1234-5678 / 1533-0702',
                    },
                  })}
                  className={inputCls}
                  placeholder="02-1234-5678"
                />
              </Field>
              <Field label="이메일" required error={errors.custEmail?.message}>
                <input
                  type="email"
                  {...register('custEmail', { required: '필수' })}
                  className={inputCls}
                  placeholder="contact@example.com"
                />
              </Field>
            </div>
          </Section>

          <Section title="2. 계약 정보">
            <Field label="설치장소 주소">
              <input
                {...register('installAddr')}
                className={inputCls}
                placeholder="고객사 주소와 같으면 비워두세요"
              />
            </Field>
            <Field label="상세위치">
              <input
                {...register('installDetailLocation')}
                className={inputCls}
                placeholder="예: 지하 1층 06,12 기둥 옆"
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="설치수량 (대)" required error={errors.installQty?.message}>
                <input
                  {...register('installQty', { required: '필수' })}
                  className={inputCls}
                  type="number"
                  min="1"
                  placeholder="3"
                />
              </Field>
              <Field label="계약기간" required>
                <select {...register('contractTerm')} className={inputCls}>
                  <option value="7">7년 (84개월)</option>
                  <option value="10">10년 (120개월)</option>
                </select>
              </Field>
            </div>
            <Field label="계약일 / 조사일">
              <div className="flex gap-2 items-center">
                <select
                  {...register('contractYear')}
                  className={`${inputCls} w-24`}
                >
                  {YEAR_OPTIONS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                <span className="text-gray-700">년</span>
                <input
                  {...register('contractMonth')}
                  className={`${inputCls} w-20`}
                  type="number"
                  min="1"
                  max="12"
                  placeholder=""
                />
                <span className="text-gray-700">월</span>
                <input
                  {...register('contractDay')}
                  className={`${inputCls} w-20`}
                  type="number"
                  min="1"
                  max="31"
                  placeholder=""
                />
                <span className="text-gray-700">일</span>
              </div>
            </Field>
          </Section>

          <Section title="3. 사전 현장 컨설팅 결과서 (별지7호)">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="외주모집대행사">
                <input {...register('salesCompany')} className={inputCls} />
              </Field>
              <Field label="담당자명">
                <input {...register('salesName')} className={inputCls} />
              </Field>
              <Field label="연락처">
                <input {...register('salesTel')} className={inputCls} />
              </Field>
            </div>

            <Field
              label="보유 주차면수 (면)"
              required
              error={errors.parkingLotCount?.message}
            >
              <input
                {...register('parkingLotCount', { required: '필수' })}
                className={inputCls}
                type="number"
                placeholder="545"
              />
            </Field>

            <RadioField label="건물형태" required>
              <Radio name="buildingType" value="apartment" register={register} label="아파트" />
              <Radio name="buildingType" value="commercial" register={register} label="상업시설" />
              <Radio name="buildingType" value="etc" register={register} label="기타" />
            </RadioField>

            <RadioField label="설치위치">
              <Radio name="installLocation" value="indoor" register={register} label="실내·지하" />
              <Radio name="installLocation" value="outdoor" register={register} label="실외·노상" />
            </RadioField>

            <RadioField label="소유여부">
              <Radio name="ownership" value="own" register={register} label="소유" />
              <Radio name="ownership" value="rent" register={register} label="임대" />
            </RadioField>

            <RadioField label="소유주와의 관계">
              <Radio name="ownerRelation" value="self" register={register} label="본인" />
              <Radio name="ownerRelation" value="family" register={register} label="가족" />
              <Radio name="ownerRelation" value="friend" register={register} label="지인" />
              <Radio name="ownerRelation" value="employee" register={register} label="직원" />
              <Radio name="ownerRelation" value="none" register={register} label="무관" />
            </RadioField>

            <RadioField label="전력인입">
              <Radio name="powerSupply" value="moja" register={register} label="모자분할" />
              <Radio name="powerSupply" value="hanjeon" register={register} label="한전불입" />
            </RadioField>

            <RadioField label="설치타입" hint="중복 선택 가능">
              <Checkbox register={register} name="installTypeWall" label="벽부형" />
              <Checkbox register={register} name="installTypeStand" label="스탠드" />
            </RadioField>

            <DuplicateInstallFieldset
              register={register}
              dupFast={dupFast}
              dupSlow={dupSlow}
              dupDist={dupDist}
              dupOutlet={dupOutlet}
            />
          </Section>

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
