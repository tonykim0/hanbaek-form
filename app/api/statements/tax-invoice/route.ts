/**
 * 세금계산서 — 올리고 · 금액 고치고 · 지운다. [한백 전용]
 *
 *   POST { step:'token', ext, contentType, size }   업로드 토큰 (브라우저가 Blob 에 직접 올린다)
 *   POST { org, payDate, blobUrl, filename }        올린 파일을 배치에 붙인다 — AI 가 금액을 읽고
 *                                                   검산(공급가액+세액=합계)을 통과한 것만 채운다
 *   PATCH { id, supplyAmount, taxAmount, totalAmount }  금액 수기 수정
 *   DELETE { id }                                   삭제 (Blob 파일도 지운다)
 *
 * 서버를 거쳐 올리지 않는 이유: 스캔본이 서버리스 본문 한도(4.5MB)에 걸린다.
 * 그래서 브라우저가 Blob 에 직접 올리고, 끝난 뒤 주소만 서버에 알려준다
 * (서류 올리기와 같은 길 — app/api/projects/[id]/documents/[kind]/file).
 * 경로는 서버가 짓는다 — 클라이언트가 지어 보내면 남의 자리를 가리킬 수 있다.
 */
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { del } from '@vercel/blob';
import { getRepository } from '@/lib/data';
import { adminWrite, BadRequest } from '@/lib/api/write-route';
import { extractTaxInvoiceAmounts } from '@/lib/tax-invoice';

/** 판독(Claude 호출 최대 40초)이 기본 한도(10초)를 넘는다 */
export const maxDuration = 60;

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 20 * 1024 * 1024;
const EXT_RE = /^[a-z0-9]{1,5}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Body = {
  step?: unknown;
  ext?: unknown;
  org?: unknown;
  payDate?: unknown;
  blobUrl?: unknown;
  filename?: unknown;
};

export const POST = adminWrite<Record<string, never>, Body>(
  '한백 관리자만 세금계산서를 올릴 수 있습니다.',
  async ({ body, actor }) => {
    if (!body) throw new BadRequest('넣을 값이 없습니다.');

    if (body.step === 'token') {
      const ext = typeof body.ext === 'string' && EXT_RE.test(body.ext.toLowerCase())
        ? body.ext.toLowerCase()
        : 'pdf';
      const pathname = `tax-invoices/${crypto.randomUUID()}.${ext}`;
      const token = await generateClientTokenFromReadWriteToken({
        token: process.env.BLOB_READ_WRITE_TOKEN!,
        pathname,
        validUntil: Date.now() + 10 * 60 * 1000,
        allowedContentTypes: ALLOWED_TYPES,
        maximumSizeInBytes: MAX_BYTES,
      });
      return { token, pathname };
    }

    if (typeof body.org !== 'string' || !body.org.trim()) throw new BadRequest('지급처가 없습니다.');
    if (typeof body.payDate !== 'string' || !DATE_RE.test(body.payDate)) {
      throw new BadRequest('지급일이 올바르지 않습니다.');
    }
    if (typeof body.blobUrl !== 'string' || !body.blobUrl.includes('/tax-invoices/')) {
      throw new BadRequest('파일 주소가 올바르지 않습니다.');
    }
    const filename = typeof body.filename === 'string' && body.filename.trim()
      ? body.filename.trim()
      : '세금계산서.pdf';

    // 올린 파일을 서버가 읽어 금액을 판독한다 — 실패해도 저장은 된다(금액 미확인)
    const res = await fetch(body.blobUrl);
    if (!res.ok) throw new BadRequest('올린 파일을 읽을 수 없습니다 — 업로드부터 다시 해주세요.');
    const buffer = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get('content-type')?.split(';')[0] ?? 'application/pdf';
    const amounts = await extractTaxInvoiceAmounts(buffer, mime);

    const { id, replacedBlobUrl } = await getRepository().saveTaxInvoice(
      {
        org: body.org.trim(),
        payDate: body.payDate,
        blobUrl: body.blobUrl,
        filename,
        supplyAmount: amounts.supplyAmount,
        taxAmount: amounts.taxAmount,
        totalAmount: amounts.totalAmount,
      },
      actor
    );
    // 교체된 옛 파일은 지운다 — Blob 은 휴지통이 없지만, 남겨두면 아무도 못 찾는 파일이 쌓인다
    if (replacedBlobUrl) await del(replacedBlobUrl).catch(() => undefined);
    return { id, amounts };
  }
);

export const PATCH = adminWrite<
  Record<string, never>,
  { id?: unknown; supplyAmount?: unknown; taxAmount?: unknown; totalAmount?: unknown }
>('한백 관리자만 세금계산서를 고칠 수 있습니다.', async ({ body, actor }) => {
  if (typeof body?.id !== 'string') throw new BadRequest('어느 세금계산서인지 알 수 없습니다.');
  const int = (v: unknown, what: string): number | null => {
    if (v === null || v === undefined) return null;
    if (typeof v !== 'number' || !Number.isSafeInteger(v)) throw new BadRequest(`${what}이 올바르지 않습니다.`);
    return v;
  };
  await getRepository().updateTaxInvoice(
    body.id,
    {
      supplyAmount: int(body.supplyAmount, '공급가액'),
      taxAmount: int(body.taxAmount, '세액'),
      totalAmount: int(body.totalAmount, '합계금액'),
    },
    actor
  );
});

export const DELETE = adminWrite<Record<string, never>, { id?: unknown }>(
  '한백 관리자만 세금계산서를 지울 수 있습니다.',
  async ({ body, actor }) => {
    if (typeof body?.id !== 'string') throw new BadRequest('어느 세금계산서인지 알 수 없습니다.');
    const { blobUrl } = await getRepository().deleteTaxInvoice(body.id, actor);
    await del(blobUrl).catch(() => undefined);
  }
);
