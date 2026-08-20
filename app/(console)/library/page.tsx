import { Note } from '@/components/ui';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import MaterialsBrowser from '@/components/MaterialsBrowser';
import { getMaterials } from '@/lib/materials';

export const metadata = { title: '자료실 — 한백 전기차사업관리' };
// 자료를 올리면 배포 없이 바로 보이도록 매 요청마다 목록을 읽는다
export const dynamic = 'force-dynamic';

/**
 * 자료실 — 콘솔 안에서 본다.
 *
 * 포털의 /materials 와 같은 컴포넌트를 쓴다. 주소를 다르게 둔 이유는 route group 이
 * URL 에 안 들어가서 /materials 하나를 두 곳이 가질 수 없기 때문이다(Next 가 라우트를
 * 못 고른다). 포털 쪽은 운영 중이라 그대로 두고 콘솔에 자리를 하나 더 만든다.
 *
 * 바깥 링크로 두지 않는다 — 로그인해서 들어온 사람을 남의 사이트로 보내면 돌아올 길이 없다.
 */
export default async function LibraryPage() {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/library');

  const { groups, fileCount, lastUpdated, storageMissing, error } = await getMaterials();

  return (
    <div className="max-w-[880px]">
      <div className="mb-6">
        <h1 className="text-h1 font-black text-slate-900">자료실</h1>
        <p className="mt-1.5 text-base text-slate-500">
          운영사별 영업자료 · 시방서 {fileCount}건
          {lastUpdated && ` · 마지막 업데이트 ${lastUpdated}`}
        </p>
      </div>

      {storageMissing && (
        <Note tone="warn" className="mb-4">
          파일 저장소가 연결되지 않아 목록이 비어 있습니다.
        </Note>
      )}
      {error && (
        <Note tone="stop" className="mb-4">
          목록을 불러오지 못했습니다 — {error}
        </Note>
      )}

      <MaterialsBrowser groups={groups} />
    </div>
  );
}
