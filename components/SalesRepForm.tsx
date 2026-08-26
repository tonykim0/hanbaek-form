'use client';
import { FIELD } from '@/components/ui';

import { useEffect } from 'react';

const LS_KEY = 'intake_salesRep';

interface SalesRepFormProps {
  name: string;
  company: string;
  onNameChange: (v: string) => void;
  onCompanyChange: (v: string) => void;
}

export default function SalesRepForm({
  name,
  company,
  onNameChange,
  onCompanyChange,
}: SalesRepFormProps) {
  useEffect(() => {
    try {
      localStorage.removeItem(LS_KEY);
    } catch { /* 무시 */ }
  }, []);

  /* 입력칸 모양은 부품이 쥔다 — 여기서 클래스를 적으면 테두리·모서리·포커스가 갈린다 */
  const inputCls = FIELD;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          소속 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={company}
          onChange={(e) => onCompanyChange(e.target.value)}
          placeholder=""
          className={inputCls}
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          이름 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder=""
          className={inputCls}
          required
        />
      </div>
    </div>
  );
}
