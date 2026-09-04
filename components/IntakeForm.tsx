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
import { MAX_DOC_BYTES, replLabel, SPLITS_SELF_REPL } from '@/types/project';
import { canShrink, shrink } from '@/lib/shrink';
import { uploadIntakeFile, uploadIntakeZip } from '@/lib/intake-upload';
import { buildDocContext, evaluateDocs } from '@/lib/doc-rules';
import { checkDraft } from '@/lib/intake-validate';
import { regionPrefixOf, withRegionPrefix } from '@/lib/region';
import { useLeaveGuard } from '@/lib/use-leave-guard';
// 부품은 콘솔·포털이 같이 쓴다 — 같은 일에 같은 모양이어야 접수 폼이 다른 앱처럼 보이지 않는다
import { Btn, FIELD } from '@/components/ui';
import { Card, Field, OrgPicks, QtyGrid, Select } from './intake/parts';
import { DocSection } from './intake/DocSection';
import type { DocReview } from '@/types/intake-auto';
import { useFileDragging } from '@/components/DocFiles';

const CPOS: CpoName[] = ['플러그링크', '나이스인프라', '현대엔지니어링', 'SK일렉링크', '에버온'];
const BLDG: BuildingType[] = ['공동주택', '상업시설'];
const PARTIES: ContractParty[] = ['입주자대표회의', '관리단', '건설사'];
const POWERS: PowerType[] = ['한전불입', '모자분리', '한전불입+모자분리'];
const BIZ: BizType[] = ['환경부', '자체투자', '연동'];
const PRE: PreInstall[] = ['없음', '있음'];
const TERMS = [5, 7, 10];

interface Line {
  termYears: number;
  qty: number;
  powerType: Exclude<PowerType, '한전불입+모자분리'> | null;
  replType: ReplType | null;
  memo: string | null;
}

/** 자체투자 현장에서 갈리는 교체유형 두 가지 */
const SELF_REPLS = ['자체투자 (제자리교체)', '자체투자 (신규위치)'] as const satisfies readonly ReplType[];

/** 임시 자리에 올라간 파일 한 장 — 칸 하나에 여러 장이 붙는다 */
export interface StagedFile {
  filename: string;
  blobUrl: string;
  /** 판독기가 읽은 문서 제목 — ZIP 에서 온 것에만 있다 */
  title?: string | null;
  /** 휴대폰 사진으로 보이는 근거 — lib/photo-check */
  photo?: string[] | null;
  /** 건축물대장에 인쇄된 용도 — 「열람용」이면 제출용이 아니다(types/intake ClassifiedFileInfo.stamp) */
  stamp?: string | null;
}

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
  const [picking, setPicking] = useState<Record<string, { pct: number; done: number; total: number }>>({});

  /**
   * ZIP 에서 나온 파일 — 이미 Blob 에 있어서 다시 올리지 않는다.
   *
   * ★칸 하나가 여러 장을 든다★ (한백 지시 2026-08-31 — 수완지구 숲안에1차아파트에서
   * 설치신청서가 두 장이었는데 옛것만 남았다). 칸에 파일이 쌓이는 것은 이미 되는
   * 일이고(documents.files), 접수 길만 그것을 모른 채 칸마다 하나로 접고 있었다.
   */
  const [staged, setStaged] = useState<Record<string, StagedFile[]>>({});
  /** 자동으로 채운 칸. 사람이 고치면 여기서 빠진다. */
  const [auto, setAuto] = useState<Set<string>>(new Set());
  const [review, setReview] = useState<DocReview | null>(null);
  const [notes, setNotes] = useState<string[]>([]);

  const [busy, setBusy] = useState<string | null>(null);
  /** 이미 만든 현장 번호 — 서류 붙이기가 끊겨 다시 누를 때 현장을 또 만들지 않는다 */
  const [madeId, setMadeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /*
   * 올려 두고 나가려 하면 한 번 묻는다 (한백 지시 2026-08-26).
   *
   * 파일은 저장소에 이미 올라가 있지만 접수 단추를 누르기 전에는 현장이 없다 — 그대로
   * 나가면 올린 사람은 낸 줄 알고, 콘솔에는 아무것도 없다. 현장이 만들어진 뒤에는(madeId)
   * 묻지 않는다: 그때부터는 나가도 남는다.
   */
  /*
   * ★올리는 도중이 가장 아까운 순간인데 안 막혀 있었다★ (한백 지시 2026-08-31).
   * 올려 둔 것이 있는가(staged)만 보고 있어서, ZIP 을 읽는 20~30초 동안이나 파일이
   * 올라가는 중에는 staged 가 아직 비어 있어 그냥 나가졌다 — 도는 요청이 끊긴다.
   * 말도 갈라 적는다: 도는 중이면 「중단됩니다」, 다 올렸으면 「사라집니다」.
   */
  const uploading = busy !== null || Object.keys(picking).length > 0;
  useLeaveGuard(
    !madeId && (uploading || Object.keys(staged).length > 0),
    uploading
      ? '서류를 올리는 중입니다. 지금 나가면 올리던 것이 중단됩니다 — 나가시겠습니까?'
      : '올린 서류가 아직 접수되지 않았습니다. 이 페이지를 벗어나면 사라집니다 — 나가시겠습니까?'
  );

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
      const data = await uploadIntakeZip(zip, setBusy);

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

      /* 같은 칸에 둘이 와도 둘 다 담는다 — 접었다가 옛 서류가 남는 자리였다 */
      const byKind: Record<string, StagedFile[]> = {};
      for (const d of data.docs) {
        (byKind[d.kind] ??= []).push({
          filename: d.filename, blobUrl: d.blobUrl, title: d.title, photo: d.photo, stamp: d.stamp,
        });
      }
      setStaged(byKind);
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
   * 고른 것을 그 자리에서 임시 자리에 올린다 — ★한 번에 여러 장을 고른다★
   * (한백 지시 2026-09-04).
   *
   * 접수 버튼을 누른 뒤에 올리면, 접수가 스캔본 업로드를 기다리는 단계가 된다.
   * 고른 시점부터 접수까지는 어차피 화면을 채우는 시간이 있으니 그 사이에 올려둔다.
   *
   * ★겹쳐 올리지 않는다★ — 칸의 목록에 한 장을 더해 다시 담으므로(setStaged) 두 개가
   * 같이 들어오면 나중 것이 앞의 것을 덮는다. 현장 상세의 서류 칸과 같은 이유·같은
   * 방식이다(components/DocFiles 의 uploadAll).
   */
  async function pick(kind: string, files: File[]) {
    setError(null);
    for (const [i, file] of files.entries()) {
      // 한 장이 막히면 멈춘다 — 왜 막혔는지(용량·형식) 다음 장에도 똑같이 걸린다
      if (!(await pickOne(kind, file, i, files.length))) break;
    }
    setPicking((p) => {
      const next = { ...p };
      delete next[kind];
      return next;
    });
  }

  /** 한 장을 올린다 — 올렸으면 true. 막힌 이유는 화면에 남긴다 */
  async function pickOne(kind: string, picked: File, done: number, total: number): Promise<boolean> {
    setPicking((p) => ({ ...p, [kind]: { pct: 0, done, total } }));
    try {
      /*
       * ★큰 파일은 그 자리에서 줄인다★ (한백 지시 2026-09-04) — 현장 상세의 서류 칸과
       * 같은 규칙이다(components/DocFiles 의 upload 주석). 100MB 를 넘는 실사보고서·
       * 사진대지는 줄이지 않은 휴대폰 원본 사진 묶음이라 수십 분의 일이 된다.
       */
      let file = picked;
      if (file.size > MAX_DOC_BYTES && canShrink(file)) {
        const small = await shrink(file);
        if (small) file = small.file;
      }
      if (file.size > MAX_DOC_BYTES) {
        throw new Error(`${Math.round(file.size / 1024 / 1024)}MB — 최대 ${Math.round(MAX_DOC_BYTES / 1024 / 1024)}MB까지입니다. 나눠서 올려 주세요.`);
      }
      const up = await uploadIntakeFile(kind, file, (pct) => setPicking((p) => ({ ...p, [kind]: { pct, done, total } })));
      /* 갈아치우지 않고 쌓는다 — 현장 상세의 서류 칸과 같은 규칙이다(2026-08-25) */
      setStaged((st) => ({ ...st, [kind]: [...(st[kind] ?? []), up] }));
      return true;
    } catch (err) {
      setError(`${labelOf(kind)}: ${(err as Error).message}`);
      return false;
    }
  }

  const mixed = powerType === '한전불입+모자분리';
  /**
   * 대수 칸의 행 — 사업구분이 정하고, 자체투자는 운영사가 한 번 더 정한다.
   *
   * ★교체유형을 가르는 운영사만 두 행이다★ (2026-08-26) — 에버온(140/150/160 대
   * 170/180/190만)·SK일렉링크(위치변경 190~210만)는 제자리교체와 신규위치의 단가가 실제로
   * 다르다. 나머지는 같은 금액이라 케이스도 한 칸으로 합쳤다(플러그링크와 같은 방식).
   * 안 가르는 운영사에 두 행을 펴 두었더니 한 현장의 11기가 「10대 + 1대」 두 라인으로
   * 갈렸다 — 강원 강릉 일송아파트가 그것이다(한백 확인).
   */
  const replRows: ReplType[] =
    bizType === '자체투자'
      ? (SPLITS_SELF_REPL.has(cpo) ? [...SELF_REPLS] : [SELF_REPLS[0]])
      : bizType === '연동' ? ['연동'] : ['환경부 신규'];
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
          linePowerTypes: lines.map((l) => l.powerType), preInstall, bizType,
        })
      ),
    [cpo, contractParty, bldgType, powerType, lines, preInstall, bizType]
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
      documents: Object.entries(staged).flatMap(([kind, list]) =>
        list.map((d) => ({ kind, filename: d.filename }))),
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
      const docs = Object.entries(staged).flatMap(([kind, list]) =>
        list.map((d) => ({
          kind, filename: d.filename, blobUrl: d.blobUrl, title: d.title ?? null,
          photo: d.photo ?? undefined,
        })));
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

  /*
   * ZIP 을 끌어다 놓는 자리 (한백 지시 2026-08-31).
   *
   * ★한 개만 받는다.★ 이 화면이 하는 일은 「묶음 하나를 푸는 것」이고, 여러 개를 놓으면
   * 어느 것을 풀었는지 말할 수 없다. 여러 개가 오면 첫 개를 쓰지 않고 그대로 알린다 —
   * 조용히 하나만 고르면 나머지가 사라진 것을 사람이 모른다.
   *
   * ★ZIP 이 아니면 받지 않는다.★ 여기서 안 막으면 PDF 한 장을 놓았을 때 서버까지 갔다가
   * 「ZIP 파일이 아닙니다」로 돌아온다 — 그 왕복이 20초다. 서류 한 장은 아래 서류 칸이
   * 받는 자리라, 그 말을 그대로 적는다(화면 규칙 3: 막는 것을 그 자리에 적는다).
   */
  const [overZip, setOverZip] = useState(false);
  const filesInFlight = useFileDragging();
  const zipDropOpen = filesInFlight && busy === null;

  const takeZip = (files: FileList | null) => {
    const list = [...(files ?? [])];
    if (list.length === 0) return;
    if (list.length > 1) {
      setError('ZIP 하나만 놓아주세요 — 여러 묶음은 한 번에 풀지 않습니다.');
      return;
    }
    const f = list[0];
    if (!/\.zip$/i.test(f.name)) {
      setError(`${f.name} 은(는) ZIP 이 아닙니다 — 서류 한 장은 아래 서류 칸에 놓아주세요.`);
      return;
    }
    void applyZip(f);
  };

  const pickZip = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    e.target.value = ''; // 같은 파일을 다시 고를 수 있게 비운다
    takeZip(files);
  };

  const catchZip = {
    onDragEnter: (e: React.DragEvent) => { e.preventDefault(); setOverZip(true); },
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setOverZip(true); },
    onDragLeave: (e: React.DragEvent) => {
      // 자식으로 들어간 것은 떠난 것이 아니다 — 안 걸러내면 깜빡인다
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      setOverZip(false);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setOverZip(false);
      if (busy !== null) return;
      takeZip(e.dataTransfer.files);
    },
  };

  const autoCount = auto.size;
  const issueCount = review?.findings.filter((f) => !f.ok).length ?? 0;

  return (
    <div className="flex max-w-[880px] flex-col gap-6">
      {/*
        * ★상자째로 놓는 자리이자 누르는 자리다★ (한백 지시 2026-08-31 「끌어다 놓기」 →
        * 「클릭해서 올릴 수도 있게」). 처음부터 점선 테두리라 놓는 자리처럼 보였는데
        * 실제로는 안쪽 단추만 받았다 — 보이는 것과 되는 것이 달랐다.
        *
        * 그래서 ★상자 자체를 label 로 둔다.★ 파일 입력 하나를 상자가 물고 있으므로
        * 어디를 눌러도 같은 창이 열린다 — 조준할 것이 없어진다(서류 칸에서 덮개를 칸
        * 전체로 넓힌 것과 같은 이유, 2026-08-30). 안쪽 단추는 이제 label 이 아니라
        * 그냥 보이는 것이다: label 을 겹쳐 두면 창이 두 번 열린다.
        *
        * 끌 때 뜨는 덮개도 label 이 아니라 div 다 — 바깥 label 이 이미 클릭을 받는다.
        * 덮개는 끌고 있을 때만 뜬다: 평소에 깔아 두면 안쪽 글자를 가리고, 올리는 중에는
        * 진행 문구가 보여야 한다.
        */}
      <label
        {...catchZip}
        className={`group relative block rounded-2xl border-2 border-dashed p-5 transition ${
          busy ? 'cursor-default opacity-60' : 'cursor-pointer'
        } ${overZip ? 'border-brand-500 bg-brand-50' : 'border-brand-300 bg-brand-50/40'}`}
      >
        <input
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          disabled={busy !== null}
          onChange={pickZip}
        />
        {zipDropOpen && (
          <div
            className={`absolute inset-0 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed text-small font-bold transition ${
              overZip
                ? 'border-brand-500 bg-brand-50/95 text-brand-800'
                : 'border-slate-300 bg-white/90 text-slate-500'
            }`}
          >
            여기에 ZIP 을 놓기
          </div>
        )}
        <h2 className="text-base font-black tracking-[-0.02em] text-slate-900">
          계약서 묶음 올리기
        </h2>
        <p className="mt-0.5 text-small leading-relaxed text-slate-500">
          ZIP 하나를 올리면 서류가 칸별로 갈리고, 계약서에서 읽은 값으로 아래가 채워집니다.
          주소가 서류마다 어긋나지 않는지도 함께 봅니다. 채워진 값은 고칠 수 있습니다.
        </p>
        {/* 누르는 자리는 상자 전체다 — 이것은 「여기를 누르면 된다」를 보이는 표지다 */}
        <span
          className={`mt-3 inline-flex items-center rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white transition ${
            busy ? '' : 'group-hover:bg-brand-700'
          }`}
        >
          {busy ?? 'ZIP 고르기 · 끌어다 놓기'}
        </span>
        {autoCount > 0 && (
          <p className="mt-2 text-small font-bold text-brand-800">
            {autoCount}개 칸을 자동으로 채웠습니다 · 서류{' '}
            {Object.values(staged).reduce((n, l) => n + l.length, 0)}건 첨부
          </p>
        )}
      </label>

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
            <input value={name} onChange={(e) => { setName(e.target.value); touched('name'); }} placeholder="서울 강남 행복아파트" className={FIELD} />
            {/*
              * 판독이 채운 이름에는 이미 지역이 붙어 있다(lib/region). 사람이 직접 칠 때만
              * 이 자리가 나타난다 — 치는 중에 이름을 몰래 고치지는 않는다.
              */}
            {namedRegion && (
              <button
                type="button"
                onClick={() => { setName(namedRegion); touched('name'); }}
                className="mt-1 text-tiny font-bold text-brand-700 underline decoration-brand-300 hover:text-brand-800"
              >
                「{regionPrefixOf(addr)}」 앞에 붙이기
              </button>
            )}
          </Field>
          <Field label="주소" span auto={auto.has('addr')}>
            <input value={addr} onChange={(e) => { setAddr(e.target.value); touched('addr'); }} placeholder="서울 강남구 역삼동 123" className={FIELD} />
          </Field>
          <Field label="건축물유형" auto={auto.has('bldgType')}>
            <Select value={bldgType ?? ''} onChange={(v) => { setBldgType((v || null) as BuildingType | null); touched('bldgType'); }} options={BLDG} blank />
          </Field>
          <Field label="총 주차면수" auto={auto.has('parkTotal')}>
            <input value={parkTotal} onChange={(e) => { setParkTotal(e.target.value.replace(/\D/g, '')); touched('parkTotal'); }} inputMode="numeric" placeholder="120" className={FIELD} />
          </Field>
          <Field label="계약연수" required auto={auto.has('termYears')}>
            <select
              value={termYears}
              onChange={(e) => { setTermYears(Number(e.target.value)); touched('termYears'); }}
              className={FIELD}
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
            hint={bizType === '자체투자' ? '제자리교체·신규위치를 대수 칸에서 나눕니다'
              : bizType === '연동' ? '기 구축 충전기를 운영사 시스템에 연결하는 사업입니다' : undefined}
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
              rowLabel={(r) => replLabel(cpo, r)}
              cols={powerCols}
              value={qty}
              keyOf={cellKey}
              onChange={(k, n) => { setQty({ ...qty, [k]: n }); touched('qty'); }}
            />
          </Field>
        </div>
      </Card>

      <DocSection
        docs={docs}
        check={check}
        issueCount={issueCount}
        review={review}
        staged={staged}
        picking={picking}
        onPick={pick}
        /* 장 단위로 뺀다 — 칸을 통째로 비우면 두 장 중 하나만 잘못 온 경우에 다시 다 올려야 한다 */
        onRemove={(kind: string, i: number) => setStaged((st) => {
          const list = (st[kind] ?? []).filter((_, j) => j !== i);
          const next = { ...st };
          if (list.length === 0) delete next[kind];
          else next[kind] = list;
          return next;
        })}
      />

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
                className={FIELD}
              />
              <OrgPicks names={knownOrgs} onPick={setSalesOrg} />
            </Field>
            <Field label="시공사">
              <input
                value={gcOrg}
                onChange={(e) => setGcOrg(e.target.value)}
                placeholder="영업과 같으면 같은 이름"
                className={FIELD}
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
          className={FIELD}
        />
      </Card>

      {error && (
        <p role="alert" className="rounded-xl border-l-[3px] border-red-500 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Btn
          onClick={() => void submit()}
          disabled={check.errors.length > 0 || busy !== null || (!isAdmin && !org)}
        >
          {busy ?? '접수하기'}
        </Btn>
        {check.errors.length > 0 && (
          <span className="text-xs text-slate-400">
            별표(<span className="text-red-500">*</span>) 칸과 필수 서류를 채우면 접수할 수 있습니다
          </span>
        )}
      </div>
    </div>
  );
}
