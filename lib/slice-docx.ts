/**
 * 생성된 계약서류 docx에서 「사전 현장 컨설팅 결과서」만 잘라냅니다.
 *
 * 4개 CPO 템플릿 모두 body의 최상위 자식으로 `【별지 제7호 서식】` 문단을 갖고 있고,
 * 결과서는 그 문단부터 문서 끝까지입니다 (HEC 템플릿만 뒤에 [별지 1] 사진대지와
 * [별지 2] 사전 체크리스트가 더 붙습니다). 그래서 body 자식을 앞에서부터 잘라내는
 * 것만으로 단독 문서가 됩니다 — 템플릿마다 별도 처리가 필요 없습니다.
 *
 * 채우기(fillDocx*.ts)가 끝난 결과물에 적용하므로 SDT 매핑에는 관여하지 않습니다.
 */

import JSZip from 'jszip';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

/** 「별지 제7호 서식」 — 결과서 시작 */
const REPORT_ANCHOR = '별지제7호';
/** 「별지 제5호 서식」 — 설치신청서 시작 */
const APPLICATION_ANCHOR = '별지제5호';
/** 설치신청서 다음 문서 시작 — 이 앞까지만 설치신청서로 남깁니다. */
const APPLICATION_END_ANCHORS = ['직인사용동의서', '개인정보수집'];
/** [별지 1] 사진대지 / [별지 2] 사전 체크리스트 — 결과서에 딸린 별지 시작 */
const ATTACHMENT_ANCHORS = ['별지1]', '별지2]'];

export interface SliceOptions {
  /** 사진대지([별지1])·사전 체크리스트([별지2])까지 포함할지 (기본 포함) */
  includeAttachments?: boolean;
}

export interface SliceResult {
  blob: Blob;
  /** 남긴 body 자식 수 */
  kept: number;
  /** 잘라낸 body 자식 수 */
  dropped: number;
  /** 실제로 별지(사진대지·체크리스트)가 포함됐는지 — 템플릿에 없으면 false */
  hasAttachments: boolean;
}

export interface SelectedDocumentsSliceResult {
  blob: Blob;
  /** 설치신청서 구간에서 남긴 body 자식 수 */
  applicationKept: number;
  /** 사전현장컨설팅 결과서 구간에서 남긴 body 자식 수 */
  consultingKept: number;
  /** 잘라낸 body 자식 수 */
  dropped: number;
}

export interface SelectedDocumentValues {
  installQty11to30?: string | null;
  powerSharingKw?: string | null;
  powerSharingQty?: string | null;
  powerSharingCableQty?: string | null;
  dupKioskQty?: string | null;
}

/** 문단·표의 모든 <w:t>를 이어 붙이고 공백을 없앤 문자열 (앵커 비교용) */
function normalizedText(node: Element): string {
  const texts = node.getElementsByTagNameNS(W_NS, 't');
  let out = '';
  for (let i = 0; i < texts.length; i++) out += texts[i].textContent ?? '';
  return out.replace(/\s| |　/g, '');
}

function hasPageBreak(node: Element): boolean {
  const breaks = node.getElementsByTagNameNS(W_NS, 'br');
  for (let i = 0; i < breaks.length; i++) {
    if (breaks[i].getAttributeNS(W_NS, 'type') === 'page') return true;
  }
  return false;
}

function createPageBreakParagraph(doc: Document): Element {
  const paragraph = doc.createElementNS(W_NS, 'w:p');
  const run = doc.createElementNS(W_NS, 'w:r');
  const pageBreak = doc.createElementNS(W_NS, 'w:br');
  pageBreak.setAttributeNS(W_NS, 'w:type', 'page');
  run.appendChild(pageBreak);
  paragraph.appendChild(run);
  return paragraph;
}

function directTableCells(row: Element): Element[] {
  const cells: Element[] = [];
  for (let cell = row.firstElementChild; cell; cell = cell.nextElementSibling) {
    if (cell.namespaceURI === W_NS && cell.localName === 'tc') cells.push(cell);
  }
  return cells;
}

function replaceCellText(cell: Element, value: string): void {
  const texts = cell.getElementsByTagNameNS(W_NS, 't');
  if (texts.length === 0) return;
  texts[0].textContent = value;
  texts[0].setAttributeNS(XML_NS, 'xml:space', 'preserve');
  for (let i = 1; i < texts.length; i++) texts[i].textContent = '';
}

function hasAncestor(node: Node, localName: string): boolean {
  let current = node.parentNode;
  while (current) {
    if (current.nodeType === 1 && (current as Element).localName === localName) return true;
    current = current.parentNode;
  }
  return false;
}

function replaceKioskQuantity(row: Element, qty: string): void {
  const texts = row.getElementsByTagNameNS(W_NS, 't');
  const editable: Element[] = [];
  for (let i = 0; i < texts.length; i++) {
    if (!hasAncestor(texts[i], 'sdt')) editable.push(texts[i]);
  }
  const labelIndex = editable.findIndex((text) =>
    (text.textContent ?? '').includes('키오스크')
  );
  if (labelIndex < 0) return;
  editable[labelIndex].textContent = ` 키오스크(${qty}기)`;
  editable[labelIndex].setAttributeNS(XML_NS, 'xml:space', 'preserve');
  for (let i = labelIndex + 1; i < editable.length; i++) {
    if ((editable[i].textContent ?? '').includes('해당사항')) break;
    editable[i].textContent = '';
  }
}

/** SDT가 없는 최신 양식 숫자 칸을 행 제목 기준으로 채웁니다. */
function fillUncontrolledDocumentValues(
  body: Element,
  values: SelectedDocumentValues
): void {
  const rows = body.getElementsByTagNameNS(W_NS, 'tr');
  let qty11Row = 0;
  let sharingRow = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const text = normalizedText(row);
    const cells = directTableCells(row);
    if (cells.length === 0) continue;

    if (text.includes('11kW이상~30kW미만')) {
      const qty = values.installQty11to30 ?? '';
      replaceCellText(cells[cells.length - 1], qty11Row++ === 0 ? `${qty} 기` : `(${qty})기`);
      continue;
    }

    if (text.includes('전력분배형') && text.includes('케이블')) {
      const kw = values.powerSharingKw ?? '';
      const qty = values.powerSharingQty ?? '';
      const cables = values.powerSharingCableQty ?? '';
      replaceCellText(
        cells[cells.length - 1],
        sharingRow++ === 0
          ? `${kw}kW ${qty}기(케이블 ${cables}개)`
          : `(${kw})kW (${qty})기 케이블 (${cables})개`
      );
      continue;
    }

    if (text.includes('키오스크(')) {
      replaceKioskQuantity(row, values.dupKioskQty ?? '');
    }
  }
}

/**
 * 플러그링크 최신 템플릿은 별지5호와 개인정보동의서가 한 표에 이어져 있습니다.
 * 개인정보 제목이 시작되는 행부터 제거해 설치신청서 1페이지만 남깁니다.
 */
function trimEmbeddedPrivacyRows(
  children: Element[],
  applicationStart: number,
  reportStart: number
): void {
  for (let i = applicationStart; i < reportStart; i++) {
    const child = children[i];
    if (child.namespaceURI !== W_NS || child.localName !== 'tbl') continue;

    const rows: Element[] = [];
    for (let row = child.firstElementChild; row; row = row.nextElementSibling) {
      if (row.namespaceURI === W_NS && row.localName === 'tr') rows.push(row);
    }
    const privacyStart = rows.findIndex((row) =>
      normalizedText(row).startsWith('개인정보수집')
    );
    if (privacyStart < 0) continue;
    for (let row = privacyStart; row < rows.length; row++) {
      rows[row].parentNode?.removeChild(rows[row]);
    }
  }
}

function removeBookmarks(body: Element): void {
  // 잘라낸 구간에 짝이 남은 북마크 표식을 제거합니다 (Word 경고 방지).
  for (const tag of ['bookmarkStart', 'bookmarkEnd'] as const) {
    const marks = body.getElementsByTagNameNS(W_NS, tag);
    while (marks.length > 0) marks[0].parentNode?.removeChild(marks[0]);
  }
}

async function loadDocument(source: Blob): Promise<{
  zip: JSZip;
  doc: Document;
  body: Element;
  children: Element[];
  trailingSectPr: Element | null;
}> {
  const zip = await JSZip.loadAsync(await source.arrayBuffer());
  const documentFile = zip.file('word/document.xml');
  if (!documentFile) throw new Error('문서에서 document.xml을 찾을 수 없습니다');

  const doc = new DOMParser().parseFromString(
    await documentFile.async('string'),
    'application/xml'
  );
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('XML 파싱 실패');
  }

  const bodies = doc.getElementsByTagNameNS(W_NS, 'body');
  if (bodies.length === 0) throw new Error('문서 본문(w:body)을 찾을 수 없습니다');
  const body = bodies[0];

  const children: Element[] = [];
  for (let child = body.firstElementChild; child; child = child.nextElementSibling) {
    children.push(child);
  }

  const last = children[children.length - 1];
  const trailingSectPr =
    last && last.namespaceURI === W_NS && last.localName === 'sectPr' ? last : null;

  return { zip, doc, body, children, trailingSectPr };
}

async function saveDocument(zip: JSZip, doc: Document): Promise<Blob> {
  zip.file('word/document.xml', new XMLSerializer().serializeToString(doc));
  return zip.generateAsync({
    type: 'blob',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
  });
}

/**
 * 채워진 CPO 보조금 템플릿에서 최신 별지5호 설치신청서와 별지7호
 * 사전현장컨설팅 결과서만 남깁니다. 현대의 뒤쪽 사진대지·체크리스트는 제외하고,
 * 플러그링크 표 안에 붙은 개인정보동의서 행도 제거합니다.
 */
export async function sliceApplicationAndConsulting(
  source: Blob,
  values: SelectedDocumentValues = {}
): Promise<SelectedDocumentsSliceResult> {
  const { zip, doc, body, children, trailingSectPr } = await loadDocument(source);
  const contentEnd = trailingSectPr ? children.length - 1 : children.length;

  const applicationStart = children.findIndex(
    (child) => child !== trailingSectPr && normalizedText(child).includes(APPLICATION_ANCHOR)
  );
  if (applicationStart < 0) {
    throw new Error('최신 템플릿에서 별지5호 설치신청서를 찾을 수 없습니다');
  }

  const reportStart = children.findIndex(
    (child) => child !== trailingSectPr && normalizedText(child).includes(REPORT_ANCHOR)
  );
  if (reportStart < 0) {
    throw new Error('최신 템플릿에서 별지7호 사전현장컨설팅 결과서를 찾을 수 없습니다');
  }

  fillUncontrolledDocumentValues(body, values);
  trimEmbeddedPrivacyRows(children, applicationStart, reportStart);

  // 별지7호 앞의 기존 페이지 나눔 문단을 보존합니다. 플러그링크처럼
  // 명시적 나눔이 없는 템플릿은 새 페이지 나눔을 삽입합니다.
  const hasExistingReportBreak =
    reportStart > 0 && hasPageBreak(children[reportStart - 1]);
  const reportBreak = hasExistingReportBreak ? reportStart - 1 : reportStart;
  if (!hasExistingReportBreak) {
    body.insertBefore(createPageBreakParagraph(doc), children[reportStart]);
  }

  const detectedApplicationEnd = children.findIndex(
    (child, index) =>
      index > applicationStart &&
      index < reportStart &&
      APPLICATION_END_ANCHORS.some((anchor) => normalizedText(child).startsWith(anchor))
  );
  const applicationEnd =
    detectedApplicationEnd >= 0 ? detectedApplicationEnd : reportBreak;

  const attachmentStart = children.findIndex(
    (child, index) =>
      index > reportStart &&
      child !== trailingSectPr &&
      ATTACHMENT_ANCHORS.some((anchor) => normalizedText(child).includes(anchor))
  );
  const reportEnd = attachmentStart >= 0 ? attachmentStart : contentEnd;

  const keep = new Set<number>();
  for (let i = applicationStart; i < applicationEnd; i++) keep.add(i);
  for (let i = reportBreak; i < reportEnd; i++) keep.add(i);

  let dropped = 0;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child === trailingSectPr || keep.has(i)) continue;
    body.removeChild(child);
    dropped++;
  }

  removeBookmarks(body);
  return {
    blob: await saveDocument(zip, doc),
    applicationKept: applicationEnd - applicationStart,
    consultingKept: reportEnd - reportStart,
    dropped,
  };
}

/** 기존 호출부 호환용 별칭 */
export const sliceNiceApplicationAndConsulting = sliceApplicationAndConsulting;

export async function sliceConsultingReport(
  source: Blob,
  options: SliceOptions = {}
): Promise<SliceResult> {
  const includeAttachments = options.includeAttachments ?? true;

  const { zip, doc, body, children, trailingSectPr } = await loadDocument(source);

  const start = children.findIndex(
    (c) => c !== trailingSectPr && normalizedText(c).includes(REPORT_ANCHOR)
  );
  if (start < 0) {
    throw new Error(
      '문서에서 「별지 제7호 서식」(사전 현장 컨설팅 결과서)을 찾을 수 없습니다'
    );
  }

  const attachmentStart = children.findIndex(
    (c, i) =>
      i > start &&
      c !== trailingSectPr &&
      ATTACHMENT_ANCHORS.some((anchor) => normalizedText(c).includes(anchor))
  );

  // 끝 경계(제외) — 별지를 빼면 별지 시작 지점, 포함하면 본문 끝
  const contentEnd = trailingSectPr ? children.length - 1 : children.length;
  const end =
    !includeAttachments && attachmentStart > 0 ? attachmentStart : contentEnd;

  let dropped = 0;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child === trailingSectPr) continue;
    if (i >= start && i < end) continue;
    body.removeChild(child);
    dropped++;
  }

  removeBookmarks(body);
  const blob = await saveDocument(zip, doc);

  return {
    blob,
    kept: end - start,
    dropped,
    hasAttachments: includeAttachments && attachmentStart > 0,
  };
}
