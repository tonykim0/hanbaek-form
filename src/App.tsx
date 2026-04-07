import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ContractFormData } from './lib/schema';
import { fillContractTemplate, downloadBlob } from './lib/fillDocx';

const today = new Date();
const todayMonth = String(today.getMonth() + 1);
const todayDay = String(today.getDate());
const todayYear = today.getFullYear();
const todayStr = `${todayYear}년 ${todayMonth}월 ${todayDay}일`;

const env = import.meta.env;

const defaultValues: Partial<ContractFormData> = {
  contractMonth: todayMonth,
  contractDay: todayDay,
  contractTerm: '7',
  surveyDate: todayStr,
  // Pre-fill from env vars (set on Vercel)
  salesCompany: env.VITE_DEFAULT_SALES_COMPANY ?? '한백',
  salesName: env.VITE_DEFAULT_SALES_NAME ?? '',
  salesTel: env.VITE_DEFAULT_SALES_TEL ?? '',
  surveyorCompany: env.VITE_DEFAULT_SURVEYOR_COMPANY ?? '한백',
  surveyorName: env.VITE_DEFAULT_SURVEYOR_NAME ?? '',
  surveyorTel: env.VITE_DEFAULT_SURVEYOR_TEL ?? '',
};

type StatusKind = 'success' | 'error' | null;

export default function App() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ContractFormData>({ defaultValues });

  const [status, setStatus] = useState<{ kind: StatusKind; msg: string } | null>(null);

  const onSubmit = async (data: ContractFormData) => {
    setStatus(null);
    try {
      const result = await fillContractTemplate(data);
      const safeName = data.custName.replace(/[^\w가-힣]+/g, '_');
      const filename = `${todayYear}년_계약서류_${safeName}.docx`;
      downloadBlob(result.blob, filename);
      setStatus({
        kind: 'success',
        msg: `생성 완료: ${result.filledCount}개 필드 채움 → ${filename}`,
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
          <h1 className="text-3xl font-bold text-gray-900">한백 EV 충전기 계약서 자동생성</h1>
          <p className="text-gray-600 mt-2">
            고객 정보를 한 번만 입력하면 6개 문서가 자동으로 채워집니다.
          </p>
        </header>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6"
        >
          <Section title="1. 고객사 정보">
            <Field label="상호명" required error={errors.custName?.message}>
              <input
                {...register('custName', { required: '상호명은 필수입니다' })}
                className={inputCls}
                placeholder="예: 이스턴시티 관리단"
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
                placeholder="128-80-23680"
              />
            </Field>
            <Field label="주소 (도로명)" required error={errors.custAddr?.message}>
              <input
                {...register('custAddr', { required: '필수' })}
                className={inputCls}
                placeholder="경기도 고양시 일산동구 정발산로 38"
              />
            </Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="대표 전화번호" required error={errors.custTel?.message}>
                <input
                  {...register('custTel', { required: '필수' })}
                  className={inputCls}
                  placeholder="031-903-1370"
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
            <Field label="설치 위치 상세">
              <input
                {...register('installLocation')}
                className={inputCls}
                placeholder="예: 지하주차장 B1"
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
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
            </div>
            <Field label="계약일" required>
              <div className="flex gap-2 items-center">
                <span className="text-gray-700">{todayYear}년</span>
                <input
                  {...register('contractMonth', { required: true })}
                  className={`${inputCls} w-20`}
                  type="number"
                  min="1"
                  max="12"
                />
                <span className="text-gray-700">월</span>
                <input
                  {...register('contractDay', { required: true })}
                  className={`${inputCls} w-20`}
                  type="number"
                  min="1"
                  max="31"
                />
                <span className="text-gray-700">일</span>
              </div>
            </Field>
          </Section>

          <Section title="3. 환경공단 신청서 정보">
            <div className="grid grid-cols-2 gap-4">
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
              <Field label="스마트 충전기 7~11kW 수량">
                <input
                  {...register('smartChargerQty')}
                  className={inputCls}
                  type="number"
                  placeholder="비우면 설치수량과 동일"
                />
              </Field>
            </div>
          </Section>

          <Section title="4. 모집대행사 / 조사자">
            <p className="text-sm text-gray-500 -mt-1 mb-2">
              한백 정보가 기본값입니다. 다른 대행사일 경우 수정하세요.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="회사명">
                <input {...register('salesCompany')} className={inputCls} />
              </Field>
              <Field label="담당자명">
                <input {...register('salesName')} className={inputCls} />
              </Field>
              <Field label="연락처">
                <input {...register('salesTel')} className={inputCls} />
              </Field>
            </div>
            <Field label="조사일">
              <input
                {...register('surveyDate')}
                className={inputCls}
                placeholder={todayStr}
              />
            </Field>
          </Section>

          <Section title="5. 관리소장 정보 (선택)">
            <p className="text-sm text-gray-500 -mt-1 mb-2">
              의무관리 공동주택 (150세대+ 승강기/중앙난방, 또는 300세대+) 인 경우만 입력하세요.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="단지명">
                <input
                  {...register('apartmentName')}
                  className={inputCls}
                  placeholder="비우면 상호명 사용"
                />
              </Field>
              <Field label="관리사무소 전화번호">
                <input {...register('managerTel')} className={inputCls} />
              </Field>
              <Field label="관리소장 성명">
                <input {...register('managerName')} className={inputCls} />
              </Field>
              <Field label="관리소장 생년월일">
                <input
                  {...register('managerBirth')}
                  className={inputCls}
                  placeholder="YYYY-MM-DD"
                />
              </Field>
            </div>
          </Section>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pt-4 border-t">
            <div className="text-sm">
              {status && (
                <p
                  className={
                    status.kind === 'success'
                      ? 'text-green-700'
                      : 'text-red-600 font-medium'
                  }
                >
                  {status.kind === 'success' ? '✅ ' : '❌ '}
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
          <p className="font-semibold mb-1">⚠️ 워드에서 수동 확인 필요한 항목</p>
          <ul className="list-disc ml-5 space-y-1">
            <li>체크박스 (건물형태, 설치위치, 결제방식 등) — ☐ ↔ ■ 토글</li>
            <li>중복설치 여부 (별지7호 6번)</li>
            <li>시설명 (공동주택이면 placeholder 제거)</li>
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
      <h2 className="text-lg font-semibold text-gray-800 border-b border-gray-200 pb-2 mb-4">
        {title}
      </h2>
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
