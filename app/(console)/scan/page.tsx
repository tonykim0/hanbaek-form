import type { Metadata } from 'next';
import PhotoScanner from '@/components/PhotoScanner';

export const metadata: Metadata = {
  title: '사진 → 스캔본 — 한백 전기차사업관리시스템',
  robots: { index: false, follow: false },
};

/**
 * 사진 → 스캔본 — 휴대폰으로 찍은 서류를 스캐너로 민 것처럼 만든다.
 *
 * 접수에서 「휴대폰 사진으로 보임」을 짚어 반려하게 만들었는데(lib/photo-check, 2026-08-31),
 * 반려당한 사람이 할 수 있는 일이 없었다 — 스캐너를 다시 찾아가는 것뿐이다. 짚기만 하고
 * 고칠 길을 안 주면 그 표는 잔소리가 된다(한백 지시 2026-08-31). 이 화면이 그 길이다.
 *
 * ★서버가 하는 일이 없다.★ 전부 브라우저에서 돈다 — 원본 사진이 우리 저장소로 갈 이유가
 * 없고(책상·손이 같이 찍힌다), 판독 비용도 안 나간다. 그래서 /split 과 달리 「부를 때마다
 * 비용이 나가는 일」이 아니지만, 자리는 같이 둔다 — 서류를 손질하는 일끼리 모여 있어야 찾는다.
 */
export default function ScanPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="mb-4 text-h2 font-black tracking-[-0.02em] text-slate-900">사진 → 스캔본</h1>
      <PhotoScanner />
    </div>
  );
}
