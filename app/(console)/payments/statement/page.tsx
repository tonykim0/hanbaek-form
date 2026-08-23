import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getRepository } from '@/lib/data';
import { actorOf, getSessionUser, viewerOf } from '@/lib/auth/session';
import { isHanbaek } from '@/lib/roles';
import { PAYOUT_KINDS } from '@/types/project';
import PrintButton from '@/components/settlement/PrintButton';
import StatementView from '@/components/settlement/StatementView';

export const metadata = { title: '거래명세서 — 한백 전기차사업관리' };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 거래명세서 — 업체 × 구분 × 지급일(배치) 한 장.
 *
 * kind(영업비/시공비)가 주소에 있으면 그 배치다 — 편집·세금계산서·확정이 그 단위로
 * 돈다(영업·시공은 계산서를 따로 끊는다, 한백 확인 2026-08-24). kind 없이 오면
 * (지급 내역의 옛 링크) 그 지급일의 전체를 읽기로만 보여준다 — 배치 단위가
 * 아니라서 고칠 수도, 계산서를 붙일 수도 없다.
 *
 * 지급은 매월 1~2회 배치로 나간다. 배치 하나에 나간 원장 줄들이 이 한 장이 된다 —
 * 줄을 손으로 다시 적지 않는다. 원장이 틀렸으면 원장을 고치고 이 장은 다시 뽑는다.
 * 관리자는 이 자리에서 원장을 고친다(항목 빼기 · 지급일 변경) — StatementView 가
 * 편집 자리를 print:hidden 으로 들고 있어 종이에는 명세서만 남는다.
 *
 * 세금계산서도 이 배치에 붙는다 — 협력사가 발행한 것을 보관하고 합계(공급가액)를
 * 대조한다. 목록은 /statements 에서 본다.
 *
 * ★협력사도 자기 것을 본다.★ org 는 한백만 고를 수 있고, 협력사는 파라미터와 무관하게
 * 자기 소속으로 고정된다 — listPayouts 가 애초에 자기 줄만 주지만, 주소를 바꿔 남의
 * 이름을 제목에 띄우는 것도 막는다.
 */
export default async function StatementPage({
  searchParams,
}: {
  searchParams: { org?: string; date?: string; kind?: string };
}) {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/payments');

  const date = searchParams.date ?? '';
  if (!DATE_RE.test(date)) redirect('/payments');

  // 남의 업체 명세서를 열 수 있는가 — 눈의 문제다(열람 전용도 전부 본다)
  const seesAll = isHanbaek(session.role);
  const org = seesAll ? searchParams.org ?? '' : session.org ?? '';
  if (!org) redirect('/payments');

  const kind = PAYOUT_KINDS.find((k) => k === searchParams.kind) ?? null;

  const rows = (await getRepository().listPayouts(viewerOf(session)))
    .filter((r) => r.paidAt === date && r.org === org && (kind === null || r.kind === kind))
    .sort((a, b) => a.projectName.localeCompare(b.projectName, 'ko') || a.kind.localeCompare(b.kind));

  // 세금계산서는 한백의 눈만 — 협력사 화면에는 섹션 자체가 없다
  const invoice = seesAll && kind
    ? (await getRepository().listTaxInvoices(actorOf(session))).find(
        (i) => i.org === org && i.kind === kind && i.payDate === date
      ) ?? null
    : null;
  // 확정 여부 — 계산서와 무관하게 제 테이블(batch_finals)에 산다. 협력사도 자기 것은 본다.
  const finalized = kind
    ? (await getRepository().listBatchFinals(actorOf(session))).some(
        (f) => f.org === org && f.kind === kind && f.payDate === date
      )
    : false;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex items-center gap-2 print:hidden">
        <Link
          href="/statements"
          className="text-small font-bold text-slate-500 transition hover:text-brand-800"
        >
          ← {seesAll ? '협력사 거래명세서' : '협력사 거래명세서 목록'}
        </Link>
        <span className="ml-auto" />
        <PrintButton />
      </div>

      <StatementView
        rows={rows}
        org={org}
        date={date}
        kind={kind}
        invoice={invoice}
        finalized={finalized}
        canEdit={session.role === 'admin' && kind !== null}
      />
    </div>
  );
}
