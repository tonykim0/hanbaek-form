'use client';

import type {
  FieldErrors,
  FieldValues,
  Path,
  UseFormRegister,
  UseFormWatch,
} from 'react-hook-form';
import {
  ChoiceGroup,
  contractInputClass,
  DuplicateInstallFieldset,
  Field,
  PhoneInput,
  PillCheckbox,
  PillRadio,
  Section,
  SubGroup,
} from '@/components/contracts/FormControls';
import { YEAR_OPTIONS } from '@/lib/contract-form';
import { isBizIdComplete, isValidKoreanBizId } from '@/lib/bizid';

type CommonContractFields = FieldValues & {
  custName: string;
  custBizId: string;
  custAddr: string;
  custTel: string;
  custEmail: string;
  installAddr: string;
  installQty: string;
  contractTerm: '7' | '10';
  contractYear: string;
  contractMonth: string;
  contractDay: string;
  salesCompany: string;
  salesName: string;
  salesTel: string;
  parkingLotCount: string;
  buildingType: string;
  buildingTypeEtc: string;
  installLocIndoor: boolean;
  installLocOutdoor: boolean;
  ownership: string;
  ownerRelation: string;
  powerMoja: boolean;
  powerHanjeon: boolean;
  installTypeWall: boolean;
  installTypeStand: boolean;
  dupFast: boolean;
  dupFastQty: string;
  dupSlow: boolean;
  dupSlowQty: string;
  dupDist: boolean;
  dupDistQty: string;
  dupOutlet: boolean;
  dupOutletQty: string;
  dupKiosk: boolean;
};

const inputCls = contractInputClass;

function fieldError<TFieldValues extends FieldValues>(
  errors: FieldErrors<TFieldValues>,
  name: Path<TFieldValues>
): string | undefined {
  const error = errors[name];
  return typeof error?.message === 'string' ? error.message : undefined;
}

export function CustomerInfoSection<TFieldValues extends CommonContractFields>({
  register,
  errors,
  watch,
  addressPlaceholder = '예: 서울특별시 강남구 테헤란로 1',
  telPlaceholder = '02-1234-5678',
  children,
  afterContact,
}: {
  register: UseFormRegister<TFieldValues>;
  errors: FieldErrors<TFieldValues>;
  watch?: UseFormWatch<TFieldValues>;
  addressPlaceholder?: string;
  telPlaceholder?: string;
  children?: React.ReactNode;
  afterContact?: React.ReactNode;
}) {
  const bizIdValue = watch
    ? (watch('custBizId' as Path<TFieldValues>) as unknown as string)
    : undefined;
  const bizIdChecksumWarning =
    bizIdValue && isBizIdComplete(bizIdValue) && !isValidKoreanBizId(bizIdValue)
      ? '⚠ 체크섬 불일치 — 사업자등록번호 오타 여부를 확인해주세요'
      : undefined;
  // 법인명은 대표자(children)가 있으면 한 줄에 나란히, 없으면(플러그링크) 단독 전체폭
  const legalNameField = (
    <Field
      label="사업자등록증상 법인명 (단체명)"
      required
      error={fieldError(errors, 'custName' as Path<TFieldValues>)}
    >
      <input
        {...register('custName' as Path<TFieldValues>, {
          required: '법인명은 필수입니다',
        })}
        className={inputCls}
        placeholder="예: OO아파트 입주자대표회의"
      />
    </Field>
  );
  return (
    <Section title="1. 고객사 정보">
      {children ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {legalNameField}
          {children}
        </div>
      ) : (
        legalNameField
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field
          label="사업자등록번호"
          required
          error={fieldError(errors, 'custBizId' as Path<TFieldValues>)}
          warning={bizIdChecksumWarning}
        >
          <input
            {...register('custBizId' as Path<TFieldValues>, {
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
        <Field
          label="주소 (도로명)"
          required
          error={fieldError(errors, 'custAddr' as Path<TFieldValues>)}
        >
          <input
            {...register('custAddr' as Path<TFieldValues>, { required: '필수' })}
            className={inputCls}
            placeholder={addressPlaceholder}
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field
          label="대표 전화번호"
          required
          error={fieldError(errors, 'custTel' as Path<TFieldValues>)}
        >
          <PhoneInput
            register={register}
            name={'custTel' as Path<TFieldValues>}
            required
            placeholder={telPlaceholder}
          />
        </Field>
        <Field
          label="이메일"
          required
          error={fieldError(errors, 'custEmail' as Path<TFieldValues>)}
        >
          <input
            type="email"
            {...register('custEmail' as Path<TFieldValues>, { required: '필수' })}
            className={inputCls}
            placeholder="contact@example.com"
          />
        </Field>
      </div>
      {afterContact}
    </Section>
  );
}

export function ContractInfoSection<TFieldValues extends CommonContractFields>({
  register,
  errors,
  installQtyPlaceholder,
  contractTermLabels = { seven: '7년', ten: '10년' },
  gridClassName = 'grid grid-cols-2 gap-4',
  afterInstallAddr,
  extraGridFields,
  contractTermHint,
}: {
  register: UseFormRegister<TFieldValues>;
  errors: FieldErrors<TFieldValues>;
  installQtyPlaceholder: string;
  contractTermLabels?: { seven: string; ten: string };
  gridClassName?: string;
  afterInstallAddr?: React.ReactNode;
  extraGridFields?: React.ReactNode;
  contractTermHint?: React.ReactNode;
}) {
  return (
    <Section title="2. 계약 정보">
      <Field
        label={
          <>
            설치장소 주소{' '}
            <span className="text-red-600 font-normal">
              (신청자 주소와 실제 설치주소 구분을 꼭 해주세요)
            </span>
          </>
        }
      >
        <input
          {...register('installAddr' as Path<TFieldValues>)}
          className={inputCls}
          placeholder="고객사 주소와 같으면 비워두세요"
        />
      </Field>
      {afterInstallAddr}
      <div className={gridClassName}>
        <Field
          label="설치수량 (대)"
          required
          error={fieldError(errors, 'installQty' as Path<TFieldValues>)}
        >
          <input
            {...register('installQty' as Path<TFieldValues>, { required: '필수' })}
            className={inputCls}
            type="number"
            min="1"
            placeholder={installQtyPlaceholder}
          />
        </Field>
        <Field label="계약기간" required>
          <select {...register('contractTerm' as Path<TFieldValues>)} className={inputCls}>
            <option value="7">{contractTermLabels.seven}</option>
            <option value="10">{contractTermLabels.ten}</option>
          </select>
        </Field>
        {extraGridFields}
      </div>
      {contractTermHint}
      <Field label="계약일 / 조사일">
        <div className="flex gap-2 items-center">
          <select
            {...register('contractYear' as Path<TFieldValues>)}
            className={`${inputCls} w-24`}
          >
            {YEAR_OPTIONS.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
          <span className="text-gray-700">년</span>
          <input
            {...register('contractMonth' as Path<TFieldValues>)}
            className={`${inputCls} w-20`}
            type="number"
            min="1"
            max="12"
            placeholder=""
          />
          <span className="text-gray-700">월</span>
          <input
            {...register('contractDay' as Path<TFieldValues>)}
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
  );
}

export function ConsultingSection<TFieldValues extends CommonContractFields>({
  register,
  errors,
  title = '3. 사전 현장 컨설팅 결과서 (별지7호)',
  buildingType,
  dupFast,
  dupSlow,
  dupDist,
  dupOutlet,
}: {
  register: UseFormRegister<TFieldValues>;
  errors: FieldErrors<TFieldValues>;
  title?: string;
  buildingType: string;
  dupFast: boolean;
  dupSlow: boolean;
  dupDist: boolean;
  dupOutlet: boolean;
}) {
  return (
    <Section title={title}>
      <SubGroup label="모집 대행">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="외주모집대행사">
            <input {...register('salesCompany' as Path<TFieldValues>)} className={inputCls} />
          </Field>
          <Field label="담당자명">
            <input {...register('salesName' as Path<TFieldValues>)} className={inputCls} />
          </Field>
          <Field label="연락처">
            <PhoneInput register={register} name={'salesTel' as Path<TFieldValues>} />
          </Field>
        </div>
      </SubGroup>

      <SubGroup label="현장 개요">
        <Field
          label="보유 주차면수 (면)"
          required
          error={fieldError(errors, 'parkingLotCount' as Path<TFieldValues>)}
        >
          <input
            {...register('parkingLotCount' as Path<TFieldValues>, { required: '필수' })}
            className={`${inputCls} md:max-w-xs`}
            type="number"
            placeholder="545"
          />
        </Field>

        <ChoiceGroup
          label="건물형태"
          required
          hint="해당사항 없을 경우 직접 입력"
          hintTone="danger"
        >
          <PillRadio name={'buildingType' as Path<TFieldValues>} value="apartment" register={register} label="공동주택" />
          <PillRadio name={'buildingType' as Path<TFieldValues>} value="yeonlip" register={register} label="연립주택" />
          <PillRadio name={'buildingType' as Path<TFieldValues>} value="sangga" register={register} label="상가" />
          <PillRadio name={'buildingType' as Path<TFieldValues>} value="etc_officetel" register={register} label="기타 (오피스텔)" />
          <PillRadio name={'buildingType' as Path<TFieldValues>} value="etc_knowledge" register={register} label="기타 (지식산업센터)" />
          <PillRadio name={'buildingType' as Path<TFieldValues>} value="etc_government" register={register} label="기타 (관공서)" />
          <PillRadio name={'buildingType' as Path<TFieldValues>} value="etc_custom" register={register} label="기타 (직접 입력)" />
        </ChoiceGroup>

        {buildingType === 'etc_custom' && (
          <Field
            label="건물형태 직접 입력"
            required
            error={fieldError(errors, 'buildingTypeEtc' as Path<TFieldValues>)}
          >
            <input
              {...register('buildingTypeEtc' as Path<TFieldValues>, {
                validate: (v) =>
                  (typeof v === 'string' && v.trim().length > 0) || '건물형태를 입력해주세요',
              })}
              className={`${inputCls} md:max-w-xs`}
              placeholder="예: 대학교, 병원"
            />
          </Field>
        )}
      </SubGroup>

      <SubGroup label="소유 정보">
        <ChoiceGroup label="소유여부" inline>
          <PillRadio name={'ownership' as Path<TFieldValues>} value="own" register={register} label="소유" />
          <PillRadio name={'ownership' as Path<TFieldValues>} value="rent" register={register} label="임대" />
        </ChoiceGroup>

        <ChoiceGroup label="소유주와의 관계" inline>
          <PillRadio name={'ownerRelation' as Path<TFieldValues>} value="self" register={register} label="본인" />
          <PillRadio name={'ownerRelation' as Path<TFieldValues>} value="none" register={register} label="무관" />
          <PillRadio name={'ownerRelation' as Path<TFieldValues>} value="employee" register={register} label="직원" />
        </ChoiceGroup>
      </SubGroup>

      <SubGroup label="설치 조건">
        <ChoiceGroup label="설치위치" hint="중복 선택 가능" inline>
          <PillCheckbox register={register} name={'installLocIndoor' as Path<TFieldValues>} label="실내·지하" />
          <PillCheckbox register={register} name={'installLocOutdoor' as Path<TFieldValues>} label="실외·노상" />
        </ChoiceGroup>

        <ChoiceGroup label="전력인입" hint="중복 선택 가능" inline>
          <PillCheckbox register={register} name={'powerMoja' as Path<TFieldValues>} label="모자분할" />
          <PillCheckbox register={register} name={'powerHanjeon' as Path<TFieldValues>} label="한전불입" />
        </ChoiceGroup>

        <ChoiceGroup label="설치타입" hint="중복 선택 가능" inline>
          <PillCheckbox register={register} name={'installTypeWall' as Path<TFieldValues>} label="벽부형" />
          <PillCheckbox register={register} name={'installTypeStand' as Path<TFieldValues>} label="스탠드" />
        </ChoiceGroup>

        <DuplicateInstallFieldset
          register={register}
          dupFast={dupFast}
          dupSlow={dupSlow}
          dupDist={dupDist}
          dupOutlet={dupOutlet}
        />
      </SubGroup>
    </Section>
  );
}
