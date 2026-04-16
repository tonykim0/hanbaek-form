'use client';

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
  // 마운트 시 localStorage에서 복원
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved) {
        const { name: n, company: c } = JSON.parse(saved);
        if (n) onNameChange(n);
        if (c) onCompanyChange(c);
      }
    } catch { /* 무시 */ }
  // 최초 1회만 실행
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 값 변경 시 localStorage 저장
  useEffect(() => {
    if (name || company) {
      localStorage.setItem(LS_KEY, JSON.stringify({ name, company }));
    }
  }, [name, company]);

  const inputCls =
    'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          이름 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="홍길동"
          className={inputCls}
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          소속 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={company}
          onChange={(e) => onCompanyChange(e.target.value)}
          placeholder="에코일렉"
          className={inputCls}
          required
        />
      </div>
    </div>
  );
}
