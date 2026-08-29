/**
 * 세금계산서 — 올리고 · 지운다. [한백 · 그 지급처의 협력사]
 *
 *   POST { step:'token', ext }                       업로드 토큰 (브라우저가 Blob 에 직접 올린다)
 *   POST { org, kind, payDate, blobUrl, filename }   올린 파일을 배치에 붙인다
 *   DELETE { id }                                    삭제 (Blob 파일도 지운다)
 *
 * 배치와 계산서는 (지급처 × 구분 × 지급일) 단위다 — 영업·시공은 따로 발행한다.
 *
 * ★협력사가 직접 올린다★ (한백 지시 2026-08-30). 발행은 협력사의 일이고 파일도 그쪽이
 * 들고 있으니, 메일로 보내 한백이 옮겨 붙이던 걸음을 없앤다. 누가 어느 배치에 붙일 수
 * 있는지는 ★저장소가 본다★(canAttachInvoice) — 자기 지급처의, 확정 전 배치만이다.
 * 협력사가 올리는 것은 ★PDF 만★ 받는다: 전자세금계산서의 정본이 PDF 고, 사진으로 찍어
 * 올리면 읽기 어렵다. 한백은 종이 스캔을 붙일 일이 있어 지금처럼 이미지도 받는다.
 *
 * 명세서 기록 옆의 첨부일 뿐이다 — 금액 판독·대조는 걷어냈다(한백 확인 2026-08-23).
 * 되살릴 일이 생기면 3f2ad9c 의 lib/tax-invoice.ts(검산 게이트 포함)를 가져온다.
 *
 * 서버를 거쳐 올리지 않는 이유: 스캔본이 서버리스 본문 한도(4.5MB)에 걸린다.
 * 그래서 브라우저가 Blob 에 직접 올리고, 끝난 뒤 주소만 서버에 알려준다
 * (서류 올리기와 같은 길 — app/api/projects/[id]/documents/[kind]/file).
 * 경로는 서버가 짓는다 — 클라이언트가 지어 보내면 남의 자리를 가리킬 수 있다.
 */
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { dropBlob, ourBlob, ourBlobPathname } from '@/lib/intake-stage';
import { getRepository } from '@/lib/data';
import { BadRequest, sessionWrite } from '@/lib/api/write-route';
import { canWrite, isHanbaek } from '@/lib/roles';
import { PAYOUT_KINDS, TAX_INVOICE_TYPES, type PayoutKind } from '@/types/project';

const ALLOWED_TYPES = [...TAX_INVOICE_TYPES];
const MAX_BYTES = 20 * 1024 * 1024;
const EXT_RE = /^[a-z0-9]{1,5}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Body = {
  step?: unknown;
  ext?: unknown;
  org?: unknown;
  kind?: unknown;
  payDate?: unknown;
  blobUrl?: unknown;
  filename?: unknown;
};

export const POST = sessionWrite<Record<string, never>, Body>(
  async ({ body, actor }) => {
    if (!body) throw new BadRequest('넣을 값이 없습니다.');
    if (!canWrite(actor.role)) throw new BadRequest('열람 전용 계정입니다.');

    if (body.step === 'token') {
      /*
       * 협력사에게는 PDF 만 내준다 — 토큰에 박아 보내므로 Blob 이 그 자리에서 막는다.
       * 확장자도 pdf 로 고정한다: 이름만 pdf 로 바꾼 이미지가 올라오는 것을 막지는 못하지만
       * (그건 Blob 의 contentType 검사가 한다), 주소가 내용과 다르게 남는 일은 막는다.
       */
      const partner = !isHanbaek(actor.role);
      const asked = typeof body.ext === 'string' && EXT_RE.test(body.ext.toLowerCase())
        ? body.ext.toLowerCase()
        : 'pdf';
      const ext = partner ? 'pdf' : asked;
      const pathname = `tax-invoices/${crypto.randomUUID()}.${ext}`;
      const token = await generateClientTokenFromReadWriteToken({
        token: process.env.BLOB_READ_WRITE_TOKEN!,
        pathname,
        validUntil: Date.now() + 10 * 60 * 1000,
        allowedContentTypes: partner ? ['application/pdf'] : ALLOWED_TYPES,
        maximumSizeInBytes: MAX_BYTES,
      });
      return { token, pathname };
    }

    if (typeof body.org !== 'string' || !body.org.trim()) throw new BadRequest('지급처가 없습니다.');
    if (!PAYOUT_KINDS.includes(body.kind as PayoutKind)) {
      throw new BadRequest('구분(영업비/시공비)이 없습니다.');
    }
    if (typeof body.payDate !== 'string' || !DATE_RE.test(body.payDate)) {
      throw new BadRequest('지급일이 올바르지 않습니다.');
    }
    /*
     * ★클라이언트가 준 주소를 그대로 믿지 않는다★ (2026-08-30 검토). 예전에는 문자열에
     * '/tax-invoices/' 가 들어 있는지만 봐서, 업로드를 건너뛰고 남의 서버 주소를 적어
     * 보내면 그대로 기록됐다 — 그 주소가 한백 화면의 링크가 되고, 지울 때 del() 에도
     * 그대로 나갔다. 서류 붙이기(lib/attach-doc)가 하던 세 겹을 여기도 한다:
     * 우리 호스트인가 · 우리가 정한 경로인가 · ★우리 스토어에 실제로 있는가★.
     * 그리고 저장하는 것은 클라이언트가 준 주소가 아니라 ★스토어가 돌려준 주소★다.
     */
    if (typeof body.blobUrl !== 'string') throw new BadRequest('파일 주소가 없습니다.');
    const pathname = ourBlobPathname(body.blobUrl);
    if (!pathname || !pathname.startsWith('tax-invoices/')) {
      throw new BadRequest('파일 주소가 올바르지 않습니다.');
    }
    const found = await ourBlob(pathname).catch(() => null);
    if (!found) throw new BadRequest('올린 파일을 찾을 수 없습니다 — 다시 올려주세요.');
    // 협력사는 PDF 만 — 토큰에도 걸어 두지만, 저장 직전에 실제 내용 종류로 한 번 더 본다
    if (!isHanbaek(actor.role) && found.contentType !== 'application/pdf') {
      throw new BadRequest('세금계산서는 PDF 로 올려주세요.');
    }
    const filename = typeof body.filename === 'string' && body.filename.trim()
      ? body.filename.trim()
      : '세금계산서.pdf';

    const { id, replacedBlobUrl } = await getRepository().saveTaxInvoice(
      {
        org: body.org.trim(),
        kind: body.kind as PayoutKind,
        payDate: body.payDate,
        blobUrl: found.url,
        filename,
        // 첨부만 보관한다 — 금액 칸은 스키마에 남아 있지만 지금은 쓰지 않는다
        supplyAmount: null,
        taxAmount: null,
        totalAmount: null,
      },
      actor
    );
    /*
     * 교체된 옛 파일은 지운다 — 남겨두면 아무도 못 찾는 파일이 쌓인다. 지우기 전에
     * 그것이 계산서 자리의 파일인지 본다: 옛 기록에 딴 경로가 들어 있어도 그 주소로
     * del() 이 나가지 않게(서류 빼기가 하는 것과 같은 가드).
     */
    if (replacedBlobUrl && (ourBlobPathname(replacedBlobUrl) ?? '').startsWith('tax-invoices/')) {
      await dropBlob(replacedBlobUrl);
    }
    return { id };
  }
);

export const DELETE = sessionWrite<Record<string, never>, { id?: unknown }>(
  async ({ body, actor }) => {
    if (typeof body?.id !== 'string') throw new BadRequest('어느 세금계산서인지 알 수 없습니다.');
    const { blobUrl } = await getRepository().deleteTaxInvoice(body.id, actor);
    // 계산서 자리의 파일만 지운다 — 옛 기록에 딴 경로가 들어 있을 수 있다
    if ((ourBlobPathname(blobUrl) ?? '').startsWith('tax-invoices/')) await dropBlob(blobUrl);
  }
);
