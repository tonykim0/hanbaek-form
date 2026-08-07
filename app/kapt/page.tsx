import type { Metadata } from 'next';
import SiteHeader from '@/components/SiteHeader';
import KaptApartmentExplorer from '@/components/KaptApartmentExplorer';

export const metadata: Metadata = {
  title: '아파트 정보 조회 | 한백 전기차충전사업',
  description: '아파트명이나 주소로 K-apt 기본정보와 전기차 관리시설정보를 확인합니다.',
};

export default function KaptPage() {
  return (
    <div className="min-h-screen bg-[#f7f8f4] text-slate-900">
      <SiteHeader active="kapt" />
      <KaptApartmentExplorer />
    </div>
  );
}
