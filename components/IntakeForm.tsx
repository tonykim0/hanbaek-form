'use client';

/**
 * 접수 폼 — 현장을 만든다.
 *
 * 소속은 화면에 없다. 서버가 접수자의 계정에서 가져다 쓴다(createProject) — 협력사가
 * 자기 회사 이름을 적을 자리를 두면 「에코일렉」과 「에코일렉 」이 갈리고, 그 현장이
 * 자기 목록에서 사라진다. 적을 자리가 없으면 그 사고가 아예 안 난다.
 *
 * ZIP 을 올리면 여기 대부분이 자동으로 채워진다(/api/projects/intake-zip). 자동으로 채운 값은
 * 표시가 붙고 사람이 고칠 수 있다 — 판독은 참고값이라 스캔 품질에 따라 틀린다. 고친 값을
 * 다시 덮지 않으려고 「어떤 칸을 사람이 만졌는가」를 따로 들고 있다.
 *
 * ★파일은 고르는 순간 올라간다.★
 * 현장 번호가 없으면 파일이 앉을 자리(projects/{현장}/…)가 정해지지 않으므로, 우선 임시
 * 자리에 올려둔다(lib/intake-stage). 그래서 접수 버튼이 하는 일은 현장을 만들고 그 주소들을
 * 넘기는 것뿐이다 — 접수가 스캔본 업로드를 기다리지 않는다.
 *
 * 필요한 서류는 고정 목록이 아니다. 운영사·계약주체·수전방식에 따라 바뀌므로
 * 고르는 대로 아래 목록이 다시 계산된다(lib/doc-rules.ts). 접수 뒤에 「그 서류도
 * 필요합니다」를 듣는 것보다 여기서 보이는 편이 낫다.
 */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  BizType, BuildingType, ContractParty, CpoName, IntakeDraft, PowerType, PreInstall, ReplType,
} from '@/types/project';
import { bizTypeOfRepl } from '@/types/project';
import { buildDocContext, evaluateDocs } from '@/lib/doc-rules';
import { checkDraft } from '@/lib/intake-validate';
import { regionPrefixOf, withRegionPrefix } from '@/lib/region';
import type { DocFinding, DocReview, AutoIntakeResult } from '@/types/intake-auto';

const CPOS: CpoName[] = ['플러그링크', '나이스인프라', '현대엔지니어링', 'SK일렉링크', '에버온'];
const BLDG: BuildingType[] = ['공동주택', '상업시설'];
const PARTIES: ContractParty[] = ['입주자대표회의', '관리단', '건설사'];
const POWERS: PowerType[] = ['한전불입', '모자분리', '한전불입+모자분리'];
const BIZ: BizType[] = ['환경부', '자체투자'];
const PRE: PreInstall[] = ['없음', '있음'];
const TERMS = [5, 7, 10];

/**
 * 서류를 세 묶음으로 나눈다.
 *
 * 필수만 접수를 막는다. 한 그리드에 16칸을 늘어놓으면 무엇이 접수를 막는지 배지를
 * 하나씩 읽어야 알 수 있어서, 막는 것과 아닌 것을 자리로 갈랐다.
 */
const DOC_SECTIONS = [
  { req: 'm' as const, label: '필수', rule: 'bg-red-400', note: '없으면 접수되지 않습니다' },
  { req: 'c' as const, label: '조건부', rule: 'bg-amber-400', note: '해당되면 냅니다' },
  { req: 'o' as const, label: '선택', rule: 'bg-slate-300', note: '있으면 함께 냅니다' },
];

/** 필수 → 조건부 → 선택 순으로 세운다 */
const REQ_ORDER: Record<'m' | 'c' | 'o', number> = { m: 0, c: 1, o: 2 };
const REQ_LABEL: Record<'m' | 'c' | 'o', string> = { m: '필수', c: '조건부', o: '선택' };
const REQ_STYLE: Record<'m' | 'c' | 'o', string> = {
  m: 'bg-slate-800 text-white',
  c: 'bg-amber-100 text-amber-900',
  o: 'bg-slate-100 text-slate-500',
};

interface Line {
  termYears: number;
  qty: number;
  powerType: Exclude<PowerType, '한전불입+모자분리'> | null;
  replType: ReplType | null;
  memo: string | null;
}

/** 자체투자 현장에서 갈리는 교체유형 두 가지 */
const SELF_REPLS = ['자체투자 (제자리교체)', '자체투자 (신규위치)'] as const satisfies readonly ReplType[];

export default function IntakeForm({ org, isAdmin = false, knownOrgs = [] }: {
  /** 세션의 소속. 협력사는 화면에 적지 않는다 — 서버가 접수자의 소속으로 현장을 만든다. */
  org: string | null;
  /**
   * 한백이 대신 접수하는 중인가.
   *
   * 계정 없는 업체의 건을 간혹 한백이 받는다. 그때만 업체 이름을 적는 칸이 나온다 —
   * 협력사에게는 그 칸이 없다(자기 소속으로 자동이고, 남의 이름을 적을 자리를 두면 안 된다).
   */
  isAdmin?: boolean;
  /**
   * 이미 쓰이고 있는 업체 이름 (계정의 소속이 먼저 온다).
   *
   * 손으로 적으면 「에코일렉」과 「에코일렉 」이 갈리고, 그 현장이 그 업체에게 영구히
   * 안 보인다 — 접근 판정이 이 문자열의 일치다. 그래서 눌러 넣는 길을 둔다.
   */
  knownOrgs?: string[];
}) {
  const router = useRouter();

  const [cpo, setCpo] = useState<CpoName>('플러그링크');
  const [name, setName] = useState('');
  const [addr, setAddr] = useState('');
  const [bldgType, setBldgType] = useState<BuildingType | null>('공동주택');
  const [contractParty, setContractParty] = useState<ContractParty | null>(null);
  const [powerType, setPowerType] = useState<PowerType | null>(null);
  /**
   * 사업구분이 위에 있고 교체유형이 그 아래로 갈린다.
   *   환경부   → 신규 하나뿐이다
   *   자체투자 → 제자리교체와 신규위치가 섞인다. 몇 기씩인지 따로 받는다.
   */
  const [bizType, setBizType] = useState<BizType | null>('환경부');
  const [preInstall, setPreInstall] = useState<PreInstall>('없음');
  const [preNote, setPreNote] = useState('');
  const [parkTotal, setParkTotal] = useState('');
  /*
   * 현장 담당자는 화면에 칸이 없다. 계약서에서 판독으로 나오는 값이라 사람이 적을 일이
   * 없고, 접수 화면을 길게 만들 이유도 없다 — 읽힌 값은 그대로 실어 보내고, 틀렸으면
   * 현장 상세에서 고친다.
   */
  const [mgr, setMgr] = useState('');
  const [tel, setTel] = useState('');
  const [mail, setMail] = useState('');
  const [note, setNote] = useState('');
  /** 한백이 대신 접수할 때 적는 업체 이름. 협력사 접수에서는 쓰지 않는다. */
  const [salesOrg, setSalesOrg] = useState('');
  const [gcOrg, setGcOrg] = useState('');
  const [termYears, setTermYears] = useState(10);
  /*
   * 대수를 수전방식별로 받는다.
   *
   * 한전불입과 모자분리가 섞인 현장은 계약을 둘로 쪼개야 한다 — 단가 케이스가 수전방식별로
   * 갈리기 때문이다(lib/pricing-match.ts). 한 칸에 「7대」로 받아두면 그 7대에 어느 케이스를
   * 붙여야 하는지 알 수 없고, 나중에 사람이 기억으로 쪼개게 된다.
   */
  /**
   * 대수는 (교체유형 × 수전방식) 칸별로 받는다.
   *
   * 두 축이 다 갈리는 현장이 있다 — 자체투자로 일부는 제자리, 일부는 신규위치이고
   * 그 안에서 한전불입과 모자분리가 또 갈린다. 총 대수 하나로 받으면 어느 대수에
   * 어느 단가를 붙일지 알 수 없다. 축이 하나뿐인 현장은 칸도 하나만 나온다.
   *
   * 키: `${replType}|${powerType}`
   */
  const [qty, setQty] = useState<Record<string, number>>({});
  /*
   * 고른 파일은 들고 있지 않는다 — 고르는 순간 임시 자리에 올려 staged 에 넣는다.
   * 여기 남는 것은 「지금 올라가는 중인 칸」의 진행률뿐이다.
   */
  const [picking, setPicking] = useState<Record<string, number>>({});

  /** ZIP 에서 나온 파일 — 이미 Blob 에 있어서 다시 올리지 않는다 */
  const [staged, setStaged] = useState<Record<string, { filename: string; blobUrl: string }>>({});
  /** 자동으로 채운 칸. 사람이 고치면 여기서 빠진다. */
  const [auto, setAuto] = useState<Set<string>>(new Set());
  const [review, setReview] = useState<DocReview | null>(null);
  const [notes, setNotes] = useState<string[]>([]);

  const [busy, setBusy] = useState<string | null>(null);
  /** 이미 만든 현장 번호 — 서류 붙이기가 끊겨 다시 누를 때 현장을 또 만들지 않는다 */
  const [madeId, setMadeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** 자동으로 채운 뒤 사람이 만진 칸을 표시에서 뺀다 */
  const touched = (key: string) => setAuto((a) => {
    if (!a.has(key)) return a;
    const next = new Set(a);
    next.delete(key);
    return next;
  });

  async function applyZip(zip: File) {
    setError(null);
    setNotes([]);
    try {
      /*
       * 서버를 거치지 않고 Blob 에 직접 올린다 — 서버리스 본문 한도가 4.5MB 인데
       * 계약서 묶음은 스캔본이라 그보다 크다. 올린 뒤 주소만 서버에 알려준다.
       */
      setBusy('올리는 중 0%');
      const tokenRes = await fetch('/api/projects/intake-zip?step=token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const tokenBody = (await tokenRes.json().catch(() => ({}))) as
        { token?: string; pathname?: string; error?: string };
      if (!tokenRes.ok || !tokenBody.token || !tokenBody.pathname) {
        throw new Error(tokenBody.error ?? '업로드 준비에 실패했습니다.');
      }

      // 서버가 준 경로 그대로 올린다 — 토큰이 그 경로 하나에만 유효하다
      const { put } = await import('@vercel/blob/client');
      const blob = await put(tokenBody.pathname, zip, {
        access: 'public',
        token: tokenBody.token,
        contentType: zip.type || 'application/zip',
        onUploadProgress: ({ percentage }) => setBusy(`올리는 중 ${Math.round(percentage)}%`),
      });

      /*
       * 서버가 단계를 흘려보낸다(SSE). 30초쯤 걸리는 일이라 어디까지 왔는지 보여야 한다.
       * 마지막 줄이 결과다 — 그 줄이 안 오면 실패로 본다.
       */
      setBusy('읽기 시작…');
      const res = await fetch('/api/projects/intake-zip', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ blobUrl: blob.url }),
      });
      if (!res.ok || !res.body) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? '읽지 못했습니다.');
      }

      let data: AutoIntakeResult | null = null;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (!data) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        // 줄 단위로 온다. 반쪽 줄이 남으면 다음 덩어리와 이어 붙인다.
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const ev = JSON.parse(line.slice(6)) as {
            phase: string; message?: string; done?: number; total?: number;
            result?: AutoIntakeResult; error?: string;
          };
          if (ev.phase === 'error') throw new Error(ev.error ?? '읽지 못했습니다.');
          if (ev.phase === 'done' && ev.result) { data = ev.result; break; }
          setBusy(
            ev.total ? `${ev.message} (${(ev.done ?? 0) + 1}/${ev.total})` : (ev.message ?? '읽는 중…')
          );
        }
      }
      if (!data) throw new Error('읽는 중에 연결이 끊겼습니다. 다시 올려주세요.');

      const filled = new Set<string>();
      const fill = <T,>(key: string, v: T | null, set: (v: T) => void) => {
        if (v === null || v === undefined || v === '') return;
        set(v);
        filled.add(key);
      };
      const f = data.fields;
      fill('cpo', f.cpo, setCpo);
      fill('name', f.name, setName);
      fill('addr', f.addr, setAddr);
      fill('bldgType', f.bldgType, setBldgType);
      fill('contractParty', f.contractParty, setContractParty);
      fill('powerType', f.powerType, setPowerType);
      fill('parkTotal', f.parkTotal, (v) => setParkTotal(String(v)));
      fill('mgr', f.mgr, setMgr);
      fill('tel', f.tel, setTel);
      fill('mail', f.mail, setMail);
      // 비고는 채우지 않는다 — 사람이 쓰는 칸이다(영업비 차감·프로모션 조건)
      /*
       * 기설치는 화면에 칸이 없다 — 서류가 있으면 「있음」이라 사람이 고를 값이 아니다.
       * ★「있음」인데 현황이 비면 접수가 영구히 막힌다★(checkDraft 가 사유를 요구한다).
       * 채울 칸이 없으니 판독의 근거를 그대로 적어 둔다.
       */
      if (f.preInstall) {
        setPreInstall(f.preInstall);
        if (f.preInstall === '있음') setPreNote('기설치 증빙자료가 첨부되어 있습니다.');
      }
      // 사업구분은 판독으로 나온다. 자체투자면 교체유형이 갈리므로 대수는 사람이 나눈다.
      if (f.bizType) {
        setBizType(f.bizType);
        filled.add('bizType');
      }
      if (f.termYears) {
        setTermYears(f.termYears);
        filled.add('termYears');
      }
      /*
       * 대수를 칸에 넣는 것은 축이 하나뿐일 때만 한다.
       *
       * 판독은 총 대수 하나만 준다(ExtractedMetadata.계약대수). 수전방식이 섞였거나
       * 자체투자(교체유형 둘)면 어느 칸에 몇 기인지 알 수 없다. 한 칸에 몰아넣으면
       * 화면이 계약서와 다른 말을 하고, 그대로 접수되면 단가가 통째로 틀어진다.
       */
      const oneRepl = f.bizType !== '자체투자';
      const onePower = f.powerType !== '한전불입+모자분리';
      if (f.qty && oneRepl && onePower) {
        const col = f.powerType === '모자분리' || f.powerType === '한전불입' ? f.powerType : null;
        setQty({ [`환경부 신규|${col ?? ''}`]: f.qty });
        filled.add('qty');
      } else {
        setQty({});
      }

      setStaged(Object.fromEntries(
        data.docs.map((d) => [d.kind, { filename: d.filename, blobUrl: d.blobUrl }])
      ));
      setAuto(filled);
      setReview(data.review);
      setNotes(data.warnings);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  /*
   * 주소에 지역이 있고 이름에 그것이 없으면, 붙인 이름. 붙일 것이 없으면 null.
   * 판독이 채웠으면 이미 붙어 있어서 저절로 사라진다.
   */
  const namedRegion = (() => {
    const next = withRegionPrefix(name, addr);
    return next && next !== name.trim() ? next : null;
  })();

  /**
   * 파일을 고르면 그 자리에서 임시 자리에 올린다.
   *
   * 접수 버튼을 누른 뒤에 올리면, 접수가 스캔본 업로드를 기다리는 단계가 된다.
   * 고른 시점부터 접수까지는 어차피 화면을 채우는 시간이 있으니 그 사이에 올려둔다.
   */
  async function pick(kind: string, file: File) {
    setError(null);
    setPicking((p) => ({ ...p, [kind]: 0 }));
    try {
      const ext = (file.name.split('.').pop() ?? 'pdf').toLowerCase();
      const tokenRes = await fetch('/api/projects/intake-file', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, ext }),
      });
      const tb = (await tokenRes.json().catch(() => ({}))) as
        { token?: string; pathname?: string; error?: string };
      if (!tokenRes.ok || !tb.token || !tb.pathname) {
        throw new Error(tb.error ?? '업로드 준비에 실패했습니다.');
      }

      const { put } = await import('@vercel/blob/client');
      const blob = await put(tb.pathname, file, {
        access: 'public',
        token: tb.token,
        contentType: file.type || undefined,
        onUploadProgress: ({ percentage }) =>
          setPicking((p) => ({ ...p, [kind]: Math.round(percentage) })),
      });
      // 이름은 사람이 고른 그 이름을 쓴다 — 경로는 우리가 지었으므로 알아볼 수 없다
      setStaged((st) => ({ ...st, [kind]: { filename: file.name, blobUrl: blob.url } }));
    } catch (err) {
      setError(`${labelOf(kind)}: ${(err as Error).message}`);
    } finally {
      setPicking((p) => {
        const next = { ...p };
        delete next[kind];
        return next;
      });
    }
  }

  const mixed = powerType === '한전불입+모자분리';
  /** 대수 칸의 행 — 사업구분이 정한다 */
  const replRows: ReplType[] = bizType === '자체투자' ? [...SELF_REPLS] : ['환경부 신규'];
  /** 대수 칸의 열 — 수전방식이 정한다 */
  const powerCols: Array<Exclude<PowerType, '한전불입+모자분리'> | null> = mixed
    ? ['한전불입', '모자분리']
    : [(powerType as Exclude<PowerType, '한전불입+모자분리'> | null) ?? null];

  const cellKey = (r: ReplType, p: string | null) => `${r}|${p ?? ''}`;

  /** 대수가 들어간 칸만 계약 라인이 된다 */
  const lines: Line[] = useMemo(
    () =>
      replRows.flatMap((r) =>
        powerCols
          .map((p) => ({ r, p, n: qty[cellKey(r, p)] ?? 0 }))
          .filter((c) => c.n > 0)
          .map((c) => ({ termYears, qty: c.n, powerType: c.p, replType: c.r, memo: null }))
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bizType, powerType, termYears, qty]
  );

  /*
   * 현장 대표 교체유형은 라인이 전부 같을 때만 채운다.
   * 섞인 현장에 하나를 골라 넣으면 그 값이 절반의 라인에 대해 거짓이 된다.
   */
  const projectRepl: ReplType | null =
    lines.length > 0 && lines.every((l) => l.replType === lines[0].replType)
      ? lines[0].replType
      : null;

  const docs = useMemo(
    () =>
      evaluateDocs(
        buildDocContext({
          cpo, contractParty, bldgType, projectPowerType: powerType,
          linePowerTypes: lines.map((l) => l.powerType), preInstall,
        })
      ),
    [cpo, contractParty, bldgType, powerType, lines, preInstall]
  );

  const draft: IntakeDraft = useMemo(
    () => ({
      cpo, name, addr: addr || null, bldgType, contractParty,
      // 협력사가 보내도 서버가 무시한다 — 실제로 쓰이는 것은 한백이 접수할 때뿐이다
      salesOrg: isAdmin ? salesOrg.trim() || null : null,
      gcOrg: isAdmin ? gcOrg.trim() || null : null,
      parkTotal: parkTotal ? Number(parkTotal) : null,
      mgr: mgr || null, tel: tel || null, mail: mail || null,
      preInstall, preNote: preNote || null,
      powerType, replType: projectRepl, bizType, note: note || null,
      lines,
      // ZIP 에서 나온 것이든 사람이 고른 것이든 이미 임시 자리에 올라가 있다 — 한 곳만 본다
      documents: Object.entries(staged).map(([kind, d]) => ({ kind, filename: d.filename })),
    }),
    [cpo, name, addr, bldgType, contractParty, parkTotal, mgr, tel, mail, preInstall, preNote,
      powerType, projectRepl, bizType, note, lines, staged, isAdmin, salesOrg, gcOrg]
  );

  // 화면과 서버가 같은 함수를 본다 — 「왜 안 되는지」가 어긋나지 않는다
  const check = useMemo(() => checkDraft(draft), [draft]);

  /** 칸 이름 — 오류 문구에 쓴다 */
  const labelOf = (kind: string) => docs.find((d) => d.key === kind)?.label ?? kind;

  async function submit() {
    setError(null);
    /*
     * ★한 번 만든 현장을 기억한다.★
     * 서류를 한 장씩 붙이는 도중에 한 번 끊기면 사람이 다시 누른다. 그때 현장을 또 만들면
     * 반쪽짜리 현장이 둘이 되고, 나중에 지울 방법도 없다. 두 번째부터는 같은 현장에
     * 못 붙은 서류만 이어 붙인다(붙은 칸은 서버가 그냥 성공으로 답한다).
     *
     * 이 함수 안에서 쓰는 값은 지역 변수다 — setMadeId 는 다음 렌더에야 보이므로,
     * 이번 시도에서 만든 번호를 catch 에서 읽으려면 여기 들고 있어야 한다.
     */
    let id = madeId;
    try {
      if (!id) {
        setBusy('현장을 만드는 중…');
        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(draft),
        });
        const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
        if (!res.ok || !data.id) throw new Error(data.error ?? '접수하지 못했습니다.');
        id = data.id;
        setMadeId(id);
      }

      /*
       * 서류는 이미 다 올라가 있다 — ZIP 에서 나온 것도, 사람이 고른 것도 고르는 순간 올렸다.
       * 그래서 여기서 넘기는 것은 주소 목록 하나뿐이고, 옮기는 일은 서버가 한 번에 한다.
       * 칸마다 요청을 보내던 때는 11칸에 12초였다.
       */
      const docs = Object.entries(staged).map(([kind, d]) => ({
        kind, filename: d.filename, blobUrl: d.blobUrl,
      }));
      if (docs.length > 0) {
        setBusy(`서류 ${docs.length}건을 붙이는 중…`);
        const res = await fetch(`/api/projects/${id}/documents`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ docs }),
        });
        const b = (await res.json().catch(() => ({}))) as
          { attached?: number; failed?: Array<{ kind: string; error: string }>; error?: string };
        if (!res.ok) {
          const first = b.failed?.[0];
          throw new Error(
            first ? `${labelOf(first.kind)}: ${first.error}` : (b.error ?? '서류를 붙이지 못했습니다.')
          );
        }
      }
      router.push(`/projects/${id}`);
    } catch (err) {
      setError(
        id
          ? `${(err as Error).message} (현장 ${id} 은 이미 만들어졌습니다 — 다시 누르면 서류만 이어 붙입니다)`
          : (err as Error).message
      );
      setBusy(null);
    }
  }

  const autoCount = auto.size;
  const issueCount = review?.findings.filter((f) => !f.ok).length ?? 0;

  return (
    <div className="flex max-w-[880px] flex-col gap-6">
      <section className="rounded-2xl border-2 border-dashed border-brand-300 bg-brand-50/40 p-5">
        <h2 className="text-base font-black tracking-[-0.02em] text-slate-900">
          계약서 묶음 올리기
        </h2>
        <p className="mt-0.5 text-[12px] leading-relaxed text-slate-500">
          ZIP 하나를 올리면 서류가 칸별로 갈리고, 계약서에서 읽은 값으로 아래가 채워집니다.
          주소가 서류마다 어긋나지 않는지도 함께 봅니다. 채워진 값은 고칠 수 있습니다.
        </p>
        <label
          className={`mt-3 inline-flex cursor-pointer items-center rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-700 ${
            busy ? 'pointer-events-none opacity-60' : ''
          }`}
        >
          {busy ?? 'ZIP 고르기'}
          <input
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            disabled={busy !== null}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void applyZip(f);
            }}
          />
        </label>
        {autoCount > 0 && (
          <p className="mt-2 text-[12px] font-bold text-brand-800">
            {autoCount}개 칸을 자동으로 채웠습니다 · 서류 {Object.keys(staged).length}건 첨부
          </p>
        )}
      </section>

      {notes.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-xl border-l-[3px] border-amber-500 bg-amber-50/70 px-4 py-3 text-xs leading-relaxed text-amber-900">
          {notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      )}

      <Card title="현장">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="운영사" required auto={auto.has('cpo')}>
            <Select value={cpo} onChange={(v) => { setCpo(v as CpoName); touched('cpo'); }} options={CPOS} />
          </Field>
          <Field label="현장명" required auto={auto.has('name')}>
            <input value={name} onChange={(e) => { setName(e.target.value); touched('name'); }} placeholder="강원 속초 ES아뜨리움" className={inputClass} />
            {/*
              * 판독이 채운 이름에는 이미 지역이 붙어 있다(lib/region). 사람이 직접 칠 때만
              * 이 자리가 나타난다 — 치는 중에 이름을 몰래 고치지는 않는다.
              */}
            {namedRegion && (
              <button
                type="button"
                onClick={() => { setName(namedRegion); touched('name'); }}
                className="mt-1 text-[11px] font-bold text-brand-700 underline decoration-brand-300 hover:text-brand-800"
              >
                「{regionPrefixOf(addr)}」 앞에 붙이기
              </button>
            )}
          </Field>
          <Field label="주소" span auto={auto.has('addr')}>
            <input value={addr} onChange={(e) => { setAddr(e.target.value); touched('addr'); }} placeholder="강원 속초시 조양동 1451" className={inputClass} />
          </Field>
          <Field label="건축물유형" auto={auto.has('bldgType')}>
            <Select value={bldgType ?? ''} onChange={(v) => { setBldgType((v || null) as BuildingType | null); touched('bldgType'); }} options={BLDG} blank />
          </Field>
          <Field label="총 주차면수" auto={auto.has('parkTotal')}>
            <input value={parkTotal} onChange={(e) => { setParkTotal(e.target.value.replace(/\D/g, '')); touched('parkTotal'); }} inputMode="numeric" placeholder="214" className={inputClass} />
          </Field>
          <Field label="계약연수" required auto={auto.has('termYears')}>
            <select
              value={termYears}
              onChange={(e) => { setTermYears(Number(e.target.value)); touched('termYears'); }}
              className={inputClass}
            >
              {TERMS.map((t) => <option key={t} value={t}>{t}년</option>)}
            </select>
          </Field>
          <Field label="계약주체" required auto={auto.has('contractParty')} hint="회의록 종류가 여기서 정해집니다">
            <Select value={contractParty ?? ''} onChange={(v) => { setContractParty((v || null) as ContractParty | null); touched('contractParty'); }} options={PARTIES} blank />
          </Field>
          <Field
            label="사업구분"
            required
            auto={auto.has('bizType')}
            hint={bizType === '자체투자' ? '제자리교체·신규위치를 대수 칸에서 나눕니다' : undefined}
          >
            <Select
              value={bizType ?? ''}
              onChange={(v) => { setBizType((v || null) as BizType | null); touched('bizType'); }}
              options={BIZ}
              blank
            />
          </Field>
          <Field label="수전방식" required auto={auto.has('powerType')}>
            <Select value={powerType ?? ''} onChange={(v) => { setPowerType((v || null) as PowerType | null); touched('powerType'); }} options={POWERS} blank />
          </Field>
          <Field
            label="대수"
            required
            span
            auto={auto.has('qty')}
            hint={
              replRows.length > 1 || powerCols.length > 1
                ? '단가가 교체유형·수전방식별로 갈립니다 — 칸마다 몇 기인지 적어주세요'
                : undefined
            }
          >
            <QtyGrid
              rows={replRows}
              cols={powerCols}
              value={qty}
              keyOf={cellKey}
              onChange={(k, n) => { setQty({ ...qty, [k]: n }); touched('qty'); }}
            />
          </Field>
        </div>
      </Card>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="text-base font-black tracking-[-0.02em] text-slate-900">서류</h2>
          <p className="text-[12px] font-bold text-slate-500">
            필수 <span className="tabular-nums text-slate-900">{check.satisfiedCount}</span>
            <span className="text-slate-300"> / </span>
            <span className="tabular-nums">{check.requiredCount}</span>
            {issueCount > 0 && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-900">
                확인 필요 {issueCount}
              </span>
            )}
          </p>
        </div>

        {/* 얼마나 남았는지는 숫자보다 길이로 먼저 읽힌다 */}
        <div className="mb-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-brand-500 transition-[width]"
            style={{
              width: `${check.requiredCount === 0 ? 100 : Math.round((check.satisfiedCount / check.requiredCount) * 100)}%`,
            }}
          />
        </div>
        <p className="mb-4 text-[11px] leading-relaxed text-slate-400">
          {review
            ? '올린 서류를 한 장씩 읽어 확인했습니다. 짚은 것이 있으면 그 칸에 적혀 있습니다 — 접수를 막지는 않습니다.'
            : '운영사·계약주체·수전방식에 따라 필요한 서류가 바뀝니다. 파일은 접수가 끝난 뒤 이어서 올라갑니다.'}
        </p>

        <div className="flex flex-col gap-5">
          {DOC_SECTIONS.map((sec) => {
            const list = docs.filter((d) => d.req === sec.req);
            if (list.length === 0) return null;
            const done = list.filter((d) => staged[d.key]).length;
            return (
              <div key={sec.req}>
                <div className="mb-2 flex items-baseline gap-2">
                  <span className={`h-[3px] w-5 rounded-full ${sec.rule}`} />
                  <h3 className="text-[11px] font-black tracking-[0.1em] text-slate-500">
                    {sec.label}
                  </h3>
                  <span className="text-[11px] font-bold tabular-nums text-slate-400">
                    {done}/{list.length}
                  </span>
                  <span className="text-[11px] text-slate-400">{sec.note}</span>
                </div>

                <div className="grid gap-2 lg:grid-cols-2">
                  {list.map((d) => {
                    const filled = staged[d.key];
                    const uploading = picking[d.key];
                    const finding = review?.findings.find((f) => f.kind === d.key);
                    const flagged = finding !== undefined && !finding.ok;
                    const missing = !filled && d.req === 'm';

                    return (
                      <div
                        key={d.key}
                        className={`flex gap-2.5 rounded-xl border border-l-[3px] p-3 transition ${
                          flagged
                            ? 'border-slate-200 border-l-amber-500 bg-amber-50/50'
                            : filled
                              ? 'border-slate-200 border-l-brand-500 bg-white'
                              : missing
                                ? 'border-slate-200 border-l-red-400 bg-white'
                                : 'border-dashed border-slate-200 border-l-slate-200 bg-white'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-baseline gap-x-1.5 break-keep text-[13px] font-bold leading-snug text-slate-800">
                            {d.label}
                            {d.ext && (
                              <span className="text-[10px] font-bold text-slate-400">{d.ext}</span>
                            )}
                          </p>

                          {uploading !== undefined ? (
                            <div className="mt-1.5">
                              <div className="h-1 overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className="h-full rounded-full bg-brand-500 transition-[width]"
                                  style={{ width: `${uploading}%` }}
                                />
                              </div>
                              <p className="mt-1 text-[11px] font-bold text-brand-700">
                                올리는 중 {uploading}%
                              </p>
                            </div>
                          ) : filled ? (
                            <p
                              className="mt-1 truncate text-[11px] text-slate-500"
                              title={filled.filename}
                            >
                              {filled.filename}
                            </p>
                          ) : (
                            <p
                              className={`mt-1 text-[11px] font-bold ${
                                missing ? 'text-red-700' : 'text-slate-300'
                              }`}
                            >
                              {missing ? '미제출' : '없음'}
                            </p>
                          )}

                          {finding && <Finding finding={finding} />}
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <label className="inline-flex cursor-pointer items-center rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 transition hover:border-brand-400 hover:text-brand-800">
                            {filled ? '바꾸기' : '고르기'}
                            <input
                              type="file"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                e.target.value = ''; // 같은 파일을 다시 고를 수 있게 비운다
                                if (f) void pick(d.key, f);
                              }}
                            />
                          </label>
                          {filled && <Preview url={filled.blobUrl} />}
                          {/*
                            * ZIP 자동분류가 엉뚱한 칸에 넣는 일이 있다. 바꿀 파일이 따로
                            * 없으면 비우는 길이 있어야 한다 — 아직 접수 전이라 화면에서만 뺀다.
                            * 임시본은 사흘 뒤 청소가 걷어간다(lib/intake-stage).
                            */}
                          {filled && (
                            <button
                              type="button"
                              onClick={() => {
                                const next = { ...staged };
                                delete next[d.key];
                                setStaged(next);
                              }}
                              className="text-[11px] font-bold text-slate-400 underline decoration-slate-300 transition hover:text-red-700"
                            >
                              빼기
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/*
        * 한백이 대신 접수하는 자리.
        *
        * 계정 없는 업체의 건을 간혹 받는다. 그 한 건 때문에 계정을 만들 이유는 없으므로
        * 이름만 적어 둔다 — 계정이 없으니 그 업체는 이 시스템에 못 들어오고, 이 현장은
        * 한백만 본다. 나중에 그 업체가 계정을 받으면 같은 이름으로 이어진다.
        *
        * 비워도 접수된다. 그러면 「어느 업체도 아닌 현장」이 된다.
        */}
      {isAdmin && (
        <Card
          title="접수 업체"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="영업사">
              <input
                value={salesOrg}
                onChange={(e) => setSalesOrg(e.target.value)}
                placeholder="계정 없는 업체면 이름만"
                className={inputClass}
              />
              <OrgPicks names={knownOrgs} onPick={setSalesOrg} />
            </Field>
            <Field label="시공사">
              <input
                value={gcOrg}
                onChange={(e) => setGcOrg(e.target.value)}
                placeholder="영업과 같으면 같은 이름"
                className={inputClass}
              />
              <OrgPicks names={knownOrgs} onPick={setGcOrg} />
            </Field>
          </div>
        </Card>
      )}

      <Card title="비고" note="영업비 차감하여 프로모션 적용 시 기재 필수">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="영업비 차감하여 프로모션을 적용했다면 그 내용을 적어주세요"
          className={inputClass}
        />
      </Card>

      {error && (
        <p role="alert" className="rounded-xl border-l-[3px] border-red-500 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={check.errors.length > 0 || busy !== null || (!isAdmin && !org)}
          className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-700 disabled:bg-slate-300"
        >
          {busy ?? '접수하기'}
        </button>
        {check.errors.length > 0 && (
          <span className="text-xs text-slate-400">
            별표(<span className="text-red-500">*</span>) 칸과 필수 서류를 채우면 접수할 수 있습니다
          </span>
        )}
      </div>
    </div>
  );
}


// ── 조각 ────────────────────────────────────────────────────────
const inputClass =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100';

function Card({
  title, note, children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-3">
        <h2 className="text-base font-black tracking-[-0.02em] text-slate-900">{title}</h2>
        {note && <p className="mt-0.5 text-[11px] text-slate-400">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({
  label, required, hint, span, auto, children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  span?: boolean;
  /** 판독이 채운 칸 — 사람이 고치면 표시가 사라진다 */
  auto?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${span ? 'sm:col-span-2' : ''}`}>
      <span className="mb-1 flex items-baseline gap-1.5 text-[11px] font-bold tracking-[0.06em] text-slate-400">
        {label}
        {required && <span className="text-red-500">*</span>}
        {auto && (
          <span className="rounded bg-brand-100 px-1 py-0.5 text-[9px] font-bold text-brand-800">
            판독
          </span>
        )}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

/**
 * 서류 한 장의 검수 결과.
 *
 * 문제가 없으면 「확인됨」한 줄이다. 있으면 무엇이 어떻게 문제인지 그대로 적는다 —
 * 「확인 필요」만 띄우면 원본을 다 열어봐야 한다.
 */
function Finding({ finding }: { finding: DocFinding }) {
  if (!finding.checked) {
    return <p className="mt-1.5 text-[10px] text-slate-400">검수하지 못했습니다</p>;
  }
  if (finding.ok) {
    return (
      <p className="mt-1.5 text-[10px] font-bold text-brand-700">이상없음</p>
    );
  }
  return (
    <ul className="mt-1.5 flex flex-col gap-0.5">
      {finding.issues.map((x) => (
        <li key={x} className="text-[10px] leading-snug text-amber-900">
          · {x}
        </li>
      ))}
    </ul>
  );
}

/**
 * 올린 서류 열어보기.
 *
 * ZIP 에서 나온 것은 이미 Blob 에 있어서 주소를 그대로 열면 된다.
 * 손으로 고른 것은 아직 안 올라갔으므로 브라우저 안에서만 주소를 만들어 연다 —
 * 접수 전에도 「내가 넣은 게 이게 맞나」를 확인할 수 있어야 한다.
 *
 * 만든 주소는 새 탭이 읽은 뒤에 되돌린다. 바로 지우면 탭이 빈 화면을 띄운다.
 */
function Preview({ url }: { url: string }) {
  function open() {
    window.open(url, '_blank', 'noopener');
  }

  return (
    <button
      type="button"
      onClick={open}
      className="mt-1 text-[11px] font-bold text-brand-700 underline-offset-2 transition hover:underline"
    >
      미리보기
    </button>
  );
}

/**
 * 대수 입력 칸.
 *
 * 행이 교체유형, 열이 수전방식이다. 축이 하나뿐이면 칸도 하나만 나온다 —
 * 표를 억지로 그리면 「환경부 신규 × 한전불입」 한 칸에 머리글이 둘 붙어 읽기 어렵다.
 */
function QtyGrid({
  rows, cols, value, keyOf, onChange,
}: {
  rows: string[];
  cols: Array<string | null>;
  value: Record<string, number>;
  keyOf: (row: never, col: never) => string;
  onChange: (key: string, n: number) => void;
}) {
  const single = rows.length === 1 && cols.length === 1;
  const num = (e: React.ChangeEvent<HTMLInputElement>) =>
    Number(e.target.value.replace(/\D/g, '') || 0);

  if (single) {
    const k = keyOf(rows[0] as never, cols[0] as never);
    return (
      <span className="flex items-baseline gap-1.5">
        <input
          value={value[k] || ''}
          inputMode="numeric"
          placeholder="3"
          onChange={(e) => onChange(k, num(e))}
          className={inputClass}
        />
        <span className="shrink-0 text-sm text-slate-400">기</span>
      </span>
    );
  }

  const total = rows.reduce(
    (n, r) => n + cols.reduce((m, c) => m + (value[keyOf(r as never, c as never)] ?? 0), 0),
    0
  );

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <table className="w-full text-sm">
        {cols.length > 1 && (
          <thead className="bg-slate-50 text-[11px] font-bold text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left" />
              {cols.map((c) => (
                <th key={c ?? '-'} className="px-3 py-2 text-left">{c}</th>
              ))}
            </tr>
          </thead>
        )}
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r}>
              <th className="w-[150px] px-3 py-2 text-left text-[12px] font-bold text-slate-600">
                {r.replace('자체투자 ', '').replace(/[()]/g, '')}
              </th>
              {cols.map((c) => {
                const k = keyOf(r as never, c as never);
                return (
                  <td key={c ?? '-'} className="px-3 py-2">
                    <span className="flex items-baseline gap-1">
                      <input
                        value={value[k] || ''}
                        inputMode="numeric"
                        placeholder="0"
                        onChange={(e) => onChange(k, num(e))}
                        className="w-[72px] rounded-lg border border-slate-200 px-2 py-1 text-sm tabular-nums text-slate-900 placeholder:text-slate-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                      />
                      <span className="text-[12px] text-slate-400">기</span>
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-slate-100 bg-slate-50 px-3 py-1.5 text-[11px] font-bold text-slate-500">
        합계 <span className="tabular-nums text-slate-800">{total}</span>기
      </p>
    </div>
  );
}

function Select({
  value, onChange, options, blank,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  blank?: boolean;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
      {blank && <option value="">선택</option>}
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

/** 이미 쓰이는 업체 이름 — 눌러서 넣는다. 계정에 있는 것이 먼저 온다. */
function OrgPicks({ names, onPick }: { names: string[]; onPick: (v: string) => void }) {
  if (names.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {names.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onPick(n)}
          className="rounded-full border border-slate-200 px-2 py-0.5 text-micro font-bold text-slate-500 transition hover:border-brand-300 hover:text-brand-800"
        >
          {n}
        </button>
      ))}
    </div>
  );
}
