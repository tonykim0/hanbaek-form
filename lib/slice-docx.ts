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

/** 「별지 제7호 서식」 — 결과서 시작 */
const REPORT_ANCHOR = '별지제7호';
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

/** 문단·표의 모든 <w:t>를 이어 붙이고 공백을 없앤 문자열 (앵커 비교용) */
function normalizedText(node: Element): string {
  const texts = node.getElementsByTagNameNS(W_NS, 't');
  let out = '';
  for (let i = 0; i < texts.length; i++) out += texts[i].textContent ?? '';
  return out.replace(/\s| |　/g, '');
}

export async function sliceConsultingReport(
  source: Blob,
  options: SliceOptions = {}
): Promise<SliceResult> {
  const includeAttachments = options.includeAttachments ?? true;

  const zip = await JSZip.loadAsync(await source.arrayBuffer());
  const documentFile = zip.file('word/document.xml');
  if (!documentFile) {
    throw new Error('문서에서 document.xml을 찾을 수 없습니다');
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(await documentFile.async('string'), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('XML 파싱 실패');
  }

  const bodies = doc.getElementsByTagNameNS(W_NS, 'body');
  if (bodies.length === 0) {
    throw new Error('문서 본문(w:body)을 찾을 수 없습니다');
  }
  const body = bodies[0];

  const children: Element[] = [];
  for (let child = body.firstElementChild; child; child = child.nextElementSibling) {
    children.push(child);
  }

  // 마지막 자식이 w:sectPr(용지·여백·머리글 설정)이면 항상 남깁니다.
  const last = children[children.length - 1];
  const trailingSectPr =
    last && last.namespaceURI === W_NS && last.localName === 'sectPr' ? last : null;

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

  // 잘라낸 구간에 짝이 남은 북마크 표식을 제거합니다 (Word 경고 방지).
  for (const tag of ['bookmarkStart', 'bookmarkEnd'] as const) {
    const marks = body.getElementsByTagNameNS(W_NS, tag);
    while (marks.length > 0) marks[0].parentNode?.removeChild(marks[0]);
  }

  const serializer = new XMLSerializer();
  zip.file('word/document.xml', serializer.serializeToString(doc));

  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
  });

  return {
    blob,
    kept: end - start,
    dropped,
    hasAttachments: includeAttachments && attachmentStart > 0,
  };
}
