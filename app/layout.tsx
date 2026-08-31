import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/react';
import './globals.css';

/*
 * ★이름은 한 곳에서만 정한다 (한백 2026-08-31).★ 링크 미리보기에 「로그인 - 한백EV콘솔」이
 * 떴는데, 세어 보니 꼬리표가 네 꼴이었다: 「한백 EV 콘솔」·「한백 전기차사업관리」·
 * 「한백 전기차충전사업」·「| 한백 전기차충전사업」. 같은 시스템을 네 이름으로 부르면
 * 링크를 받은 사람은 그것이 같은 것인지 알 수 없다.
 *
 * 콘솔의 이름은 ★한백 전기차사업관리시스템★ 하나다. 여기 title 은 제 제목을 안 정한
 * 화면의 기본값이라, 콘솔 이름으로 둔다 — 새 콘솔 화면이 제목을 깜빡해도 남의 이름을
 * 달지 않는다. 포털은 협력사가 보는 다른 얼굴이라 「한백 전기차충전사업」 그대로고,
 * 그래서 포털 첫 화면은 제 제목을 따로 적는다(app/(portal)/page.tsx).
 */
export const metadata: Metadata = {
  title: '한백 전기차사업관리시스템',
  description: '한백 EV 인프라 사업 관리',
  icons: { icon: '/logo.png', apple: '/logo.png' },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
