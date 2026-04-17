'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { HecFormData } from '@/lib/schema-hec';
import { fillHecTemplate } from '@/lib/fillDocx-hec';
import { downloadBlob } from '@/lib/fillDocx';

const today = new Date();
const todayMonth = String(today.getMonth() + 1);
const todayDay = String(today.getDate());

const YEAR_OPTIONS = ['2025', '2026', '2027'];
const DEFAULT_YEAR = '2026';

const PHONE_RE = /^(0\d{1,2}-\d{3,4}-\d{4}|1[5-9]\d{2}-\d{4})$/;

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

type StatusKind = 'success' | 'error' | null;

export default function HecPage() {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<HecFormData>({ defaultValues });

  const [status, setStatus] = useState<{ kind: StatusKind; msg: string } | null>(null);

  const dupFast = watch('dupFast');
  const dupSlow = watch('dupSlow');
  const dupDist = watch('dupDist');
  const dupOutlet = watch('dupOutlet');

  const onSubmit = async (data: HecFormData) => {
    setStatus(null);
    try {
      const result = await fillHecTemplate(data);
      const safeName = data.custName.replace(/[^\w가-힣]+/g, '_');
      const filename = `${data.contractYear}년_계약서류_HEC_${safeName}.docx`;
      downloadBlob(result.blob, filename);
      setStatus({
        kind: 'success',
        msg: `생성 완료: SDT ${result.filledSdtText + result.filledSdtCheckbox}개 + 텍스트 ${result.filledTextReplace}개 + 헤더 ${result.filledHeaderCells}개 → ${filename}`,
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
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <header className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">현대엔지니어링 계약서 자동생성</h1>
        </header>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6"
        >
          {/* ───────────────── 1. 고객사 정보 ───────────────── */}
          <Section title="1. 고객사 정보">
            <Field label="상호명 (관리사무소)" required error={errors.custName?.message}>
              <input
                {...register('custName', { required: '상호명은 필수입니다' })}
                className={inputCls}
                placeholder="예: OO아파트 관리사무소"
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
            <Field label="현장 담당자">
              <input
                {...register('siteManager')}
                className={inputCls}
                placeholder="관리소장"
              />
            </Field>
          </Section>

          {/* ───────────────── 2. 계약 정보 ───────────────── */}
          <Section title="2. 계약 정보">
            <Field label="설치장소 주소">
              <input
                {...register('installAddr')}
                className={inputCls}
                placeholder="고객사 주소와 같으면 비워두세요"
              />
            </Field>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Field label="설치수량 (대)" required error={errors.installQty?.message}>
                <input
                  {...register('installQty', { required: '필수' })}
                  className={inputCls}
                  type="number"
                  min="1"
                  placeholder="7"
                />
              </Field>
              <Field label="계약기간" required>
                <select {...register('contractTerm')} className={inputCls}>
                  <option value="7">7년</option>
                  <option value="10">10년</option>
                </select>
              </Field>
              <Field label="전기차 등록대수" required error={errors.evCount?.message}>
                <input
                  {...register('evCount', { required: '필수' })}
                  className={inputCls}
                  type="number"
                  min="1"
                  placeholder="6"
                />
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

          {/* ───────────────── 3. 사전 현장 컨설팅 결과서 ───────────────── */}
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                중복설치 여부{' '}
                <span className="text-gray-400 font-normal">
                  (미체크 시 &quot;해당사항 없음&quot; 자동 체크)
                </span>
              </label>
              <div className="space-y-2 border border-gray-200 rounded p-3 bg-gray-50">
                <DupRow
                  register={register}
                  checkboxName="dupFast"
                  qtyName="dupFastQty"
                  label="급속충전기"
                  qtyEnabled={dupFast}
                />
                <DupRow
                  register={register}
                  checkboxName="dupSlow"
                  qtyName="dupSlowQty"
                  label="완속충전기"
                  qtyEnabled={dupSlow}
                />
                <DupRow
                  register={register}
                  checkboxName="dupDist"
                  qtyName="dupDistQty"
                  label="전력분배형 충전기"
                  qtyEnabled={dupDist}
                />
                <DupRow
                  register={register}
                  checkboxName="dupOutlet"
                  qtyName="dupOutletQty"
                  label="과금형 콘센트"
                  qtyEnabled={dupOutlet}
                />
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    {...register('dupKiosk')}
                    className="h-4 w-4 text-blue-600 rounded"
                  />
                  <span className="text-sm text-gray-700">키오스크</span>
                  <span className="text-xs text-gray-400">(수량란 없음)</span>
                </div>
              </div>
            </div>
          </Section>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pt-4 border-t">
            <div className="text-sm">
              {status && (
                <p
                  className={
                    status.kind === 'success' ? 'text-green-700' : 'text-red-600 font-medium'
                  }
                >
                  {status.kind === 'success' ? 'V ' : 'X '}
                  {status.msg}
                </p>
              )}
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold px-6 py-3 rounded-lg shadow transition"
            >
              {isSubmitting ? '생성 중...' : '계약서 생성 및 다운로드'}
            </button>
          </div>
        </form>

        <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded text-sm text-amber-900">
          <p className="font-semibold mb-1">자동 처리 항목</p>
          <ul className="list-disc ml-5 space-y-1">
            <li>별지5호: 결제방식 → <strong>후불청구(회원결제)</strong> (템플릿 고정)</li>
            <li>개인정보 수집·이용 동의 → <strong>동의함</strong> (템플릿 고정)</li>
            <li>수량공문 담당자 → <strong>관리소장</strong> (템플릿 고정)</li>
          </ul>
          <p className="mt-3 font-semibold mb-1">Word에서 수동 확인 필요</p>
          <ul className="list-disc ml-5 space-y-1">
            <li>운영계약서 급속충전기 관련 항목 (수량, 계약기간, 모델명)</li>
            <li>수량공문 CPO별 충전기 현황표</li>
          </ul>
        </div>

        <footer className="mt-6 text-center text-xs text-gray-400">
          <p>한백 EV Infra Solutions · Internal Tool</p>
        </footer>
      </div>
    </div>
  );
}

const inputCls =
  'w-full border border-gray-300 rounded px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      {title && (
        <h2 className="text-lg font-semibold text-gray-800 border-b border-gray-200 pb-2 mb-4">
          {title}
        </h2>
      )}
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {children}
      {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
    </div>
  );
}

function RadioField({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {hint && <p className="text-xs text-gray-500 mb-1">{hint}</p>}
      <div className="flex flex-wrap gap-x-4 gap-y-1">{children}</div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Radio({ name, value, register, label }: { name: any; value: string; register: any; label: string }) {
  return (
    <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
      <input type="radio" value={value} {...register(name)} className="h-4 w-4 text-blue-600" />
      {label}
    </label>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Checkbox({ register, name, label }: { register: any; name: any; label: string }) {
  return (
    <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
      <input type="checkbox" {...register(name)} className="h-4 w-4 text-blue-600 rounded" />
      {label}
    </label>
  );
}

function DupRow({
  register,
  checkboxName,
  qtyName,
  label,
  qtyEnabled,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  checkboxName: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  qtyName: any;
  label: string;
  qtyEnabled: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="checkbox"
        {...register(checkboxName)}
        className="h-4 w-4 text-blue-600 rounded"
      />
      <span className="text-sm text-gray-700 w-32">{label}</span>
      <input
        type="number"
        min="0"
        {...register(qtyName)}
        disabled={!qtyEnabled}
        placeholder={qtyEnabled ? '수량' : '—'}
        className={`border border-gray-300 rounded px-2 py-1 w-24 text-sm ${
          !qtyEnabled ? 'bg-gray-100 text-gray-400' : ''
        }`}
      />
      <span className="text-sm text-gray-500">기</span>
    </div>
  );
}
