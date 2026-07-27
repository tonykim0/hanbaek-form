import { redirect } from 'next/navigation';

// SK 자체투자는 /sk 페이지의 "사업구분" 토글로 통합됨.
// 기존 링크 보존을 위해 /sk 로 리다이렉트한다.
export default function SkInvestRedirect() {
  redirect('/sk');
}
