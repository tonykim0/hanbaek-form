/**
 * 콘솔 화면이 오는 동안 — 골격만 그린다.
 *
 * ★왜 필요한가★
 * 이 파일이 없으면 화면을 옮길 때 브라우저 탭의 로딩바만 돌고 본문은 이전 화면에
 * 그대로 머문다. 2026-08-21 에 그 상태로 조회가 고착해서, 사용자에게는 「누른 게
 * 먹었는지」조차 알 수 없었다. Next 는 이 파일을 Suspense 경계로 써서 서버가 화면을
 * 만드는 동안 즉시 이것을 보여준다 — 누른 것이 먹었다는 신호다.
 *
 * 진짜 자료의 자리를 흉내내지 않는다(숫자·이름을 가짜로 채우지 않는다) — 회색 띠로
 * 「오는 중」만 말한다. 가짜 값이 잠깐 보이면 그것을 읽고 판단하는 사람이 생긴다.
 */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="animate-pulse">
      <span className="sr-only">불러오는 중</span>
      <div className="h-8 w-48 rounded-ctl bg-slate-200" />
      <div className="mt-6 flex flex-col gap-2.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-14 rounded-box border border-slate-200 bg-white" />
        ))}
      </div>
    </div>
  );
}
