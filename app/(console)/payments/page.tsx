import { redirect } from 'next/navigation';

/**
 * 옛 지급 내역 — 거래명세서로 합쳐졌다 (한백 2026-08-28).
 *
 * 두 화면이 같은 원장(payout_entries)을 각자 읽고 있었다. 묶는 축만 달랐을 뿐
 * 같은 줄이었고, 그래서 한쪽은 「나간 지급」이라 부르고 다른 쪽은 「확정 누락」이라
 * 불렀다 — 같은 값이 두 곳에 있으면 갈린다(화면 규칙 5).
 *
 * 월별 그래프는 /statements 맨 위로 올렸고, 줄 단위 명세는 원래 자리인 명세서 장
 * (/payments/statement)이 그대로 갖고 있다. 이 주소는 북마크가 죽지 않게 남긴다 —
 * 아래 statement 는 이 경로 밑에 그대로 있다.
 */
export default function OldPaymentsPage() {
  redirect('/statements');
}
