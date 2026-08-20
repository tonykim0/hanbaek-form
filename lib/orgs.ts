/**
 * 업체 이름 후보.
 *
 * 영업사·시공사 칸은 자유 입력인데, 이 문자열은 협력사가 자기 현장을 보는 판정에 그대로
 * 쓰인다(문자열 일치). 그래서 손으로 적게 두면 「에코일렉」과 「에코일렉 」이 갈린다.
 *
 * ★계정의 소속을 먼저 올린다.★ 실제로 그 현장을 볼 수 있는 이름은 계정에 적힌 것뿐이다.
 * 현장에 적힌 이름을 후보로 먼저 내보내면, 오타 난 이름이 후보가 되고 그것이 다시
 * 다음 현장·계정으로 번진다.
 *
 * 뒤에는 이미 현장에 쓰인 이름을 붙인다 — 계정 없는 업체(한백이 대신 접수한 건)를
 * 같은 이름으로 이어 붙이려면 그 목록도 필요하다.
 *
 * 서버 전용.
 */
import { userStore } from '@/lib/auth/users';
import { getRepository } from '@/lib/data';
import type { Viewer } from '@/lib/auth/types';

export async function knownOrgs(viewer: Viewer): Promise<string[]> {
  const [accounts, projects] = await Promise.all([
    userStore.list().catch(() => []),
    getRepository().listProjects(viewer),
  ]);

  const fromAccounts = accounts.map((a) => a.org).filter(Boolean) as string[];
  const fromProjects = projects.flatMap((p) => [p.salesOrg, p.gcOrg].filter(Boolean) as string[]);

  const out: string[] = [];
  for (const name of [...fromAccounts, ...fromProjects]) {
    if (!out.includes(name)) out.push(name);
  }
  return out;
}
