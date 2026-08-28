import { redirect } from 'next/navigation';

/**
 * 옛 주소 — 재발행은 관리자 전용이 아니게 됐다 (한백 2026-08-28).
 *
 * 협력사도 쓰는 자리가 되어 /reissue 로 옮겼다. 이 주소는 한백이 북마크해 둔 것이
 * 죽지 않게 남긴다 — 여기는 (write) 안이라 협력사가 와도 어차피 문에서 걸린다.
 */
export default function OldReissuePage() {
  redirect('/reissue');
}
