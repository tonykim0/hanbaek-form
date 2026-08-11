/**
 * HEC (현대엔지니어링) docx template filler.
 *
 * Dual-mode approach:
 * 1. SDT matching — fills 67 existing SDTs by ID (별지5호 + 개인정보 + 별지7호)
 * 2. Text replacement — fills non-SDT sections by replacing hardcoded sample text
 *    (운영계약서 header table, 직인동의서, 수량공문)
 *
 * Runs entirely in the browser using JSZip + DOMParser.
 */

import JSZip from 'jszip';
import {
  HecFormData,
  buildHecSdtMaps,
  buildTextReplacements,
  buildHecParagraphReplacements,
  buildHeaderTableMap,
} from './schema-hec';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const W14_NS = 'http://schemas.microsoft.com/office/word/2010/wordml';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

const CHECKED_GLYPH = '\u25A0';   // ■
const UNCHECKED_GLYPH = '\u2610'; // ☐
const CHECKED_FONT = '맑은 고딕';
const UNCHECKED_FONT = 'MS Gothic';
const FILLED_TEXT_SIZE = '18'; // 9pt in Word half-point units (계약서·약관 가독성 위해 8pt→9pt 한 단계 상향)

// ─────────────────────────────────────────────
// SDT helpers (same as pluglink fillDocx.ts)
// ─────────────────────────────────────────────

function getSdtId(sdt: Element): string | null {
  const sdtPrList = sdt.getElementsByTagNameNS(W_NS, 'sdtPr');
  if (sdtPrList.length === 0) return null;
  const ids = sdtPrList[0].getElementsByTagNameNS(W_NS, 'id');
  if (ids.length === 0) return null;
  return ids[0].getAttributeNS(W_NS, 'val');
}

function isCheckboxSdt(sdt: Element): boolean {
  const sdtPrList = sdt.getElementsByTagNameNS(W_NS, 'sdtPr');
  if (sdtPrList.length === 0) return false;
  return sdtPrList[0].getElementsByTagNameNS(W14_NS, 'checkbox').length > 0;
}

function getDirectChild(parent: Element, localName: string): Element | null {
  let child = parent.firstElementChild;
  while (child) {
    if (child.namespaceURI === W_NS && child.localName === localName) return child;
    child = child.nextElementSibling;
  }
  return null;
}

function ensureRunProperties(run: Element): Element {
  const existing = getDirectChild(run, 'rPr');
  if (existing) return existing;
  const rPr = run.ownerDocument!.createElementNS(W_NS, 'w:rPr');
  run.insertBefore(rPr, run.firstChild);
  return rPr;
}

function setRunPropertyValue(rPr: Element, localName: string, value: string): void {
  let prop = getDirectChild(rPr, localName);
  if (!prop) {
    prop = rPr.ownerDocument!.createElementNS(W_NS, `w:${localName}`);
    rPr.appendChild(prop);
  }
  prop.setAttributeNS(W_NS, 'w:val', value);
}

function setRunSize(run: Element, size: string): void {
  const rPr = ensureRunProperties(run);
  setRunPropertyValue(rPr, 'sz', size);
  setRunPropertyValue(rPr, 'szCs', size);
}

function setFilledTextSize(run: Element): void {
  setRunSize(run, FILLED_TEXT_SIZE);
}

function setFilledTextSizeForText(text: Element): void {
  const run = findAncestor(text, 'r');
  if (run) setFilledTextSize(run);
}

function fillTextSdt(sdt: Element, value: string): boolean {
  const sdtPrList = sdt.getElementsByTagNameNS(W_NS, 'sdtPr');
  if (sdtPrList.length > 0) {
    const showings = sdtPrList[0].getElementsByTagNameNS(W_NS, 'showingPlcHdr');
    while (showings.length > 0) {
      showings[0].parentNode?.removeChild(showings[0]);
    }
  }

  const contents = sdt.getElementsByTagNameNS(W_NS, 'sdtContent');
  if (contents.length === 0) return false;
  const content = contents[0];

  const texts = content.getElementsByTagNameNS(W_NS, 't');
  if (texts.length === 0) return false;

  texts[0].textContent = value;
  texts[0].setAttributeNS(XML_NS, 'xml:space', 'preserve');
  for (let i = 1; i < texts.length; i++) {
    texts[i].textContent = '';
  }

  const runs = content.getElementsByTagNameNS(W_NS, 'r');
  for (let i = 0; i < runs.length; i++) {
    const rpr = ensureRunProperties(runs[i]);
    const tagsToRemove = ['i', 'iCs', 'color', 'u', 'rStyle'];
    for (const tag of tagsToRemove) {
      const elems = rpr.getElementsByTagNameNS(W_NS, tag);
      while (elems.length > 0) {
        elems[0].parentNode?.removeChild(elems[0]);
      }
    }
    setFilledTextSize(runs[i]);
  }

  return true;
}

function toggleCheckboxSdt(sdt: Element, checked: boolean): boolean {
  const checkedEls = sdt.getElementsByTagNameNS(W14_NS, 'checked');
  if (checkedEls.length === 0) return false;
  checkedEls[0].setAttributeNS(W14_NS, 'w14:val', checked ? '1' : '0');

  const contents = sdt.getElementsByTagNameNS(W_NS, 'sdtContent');
  if (contents.length === 0) return false;
  const texts = contents[0].getElementsByTagNameNS(W_NS, 't');
  if (texts.length === 0) return false;
  texts[0].textContent = checked ? CHECKED_GLYPH : UNCHECKED_GLYPH;

  const runs = contents[0].getElementsByTagNameNS(W_NS, 'r');
  for (let i = 0; i < runs.length; i++) {
    const rprList = runs[i].getElementsByTagNameNS(W_NS, 'rPr');
    if (rprList.length === 0) continue;
    const fonts = rprList[0].getElementsByTagNameNS(W_NS, 'rFonts');
    const font = checked ? CHECKED_FONT : UNCHECKED_FONT;
    if (fonts.length > 0) {
      const f = fonts[0];
      const themedAttrs = ['asciiTheme', 'hAnsiTheme', 'eastAsiaTheme', 'cstheme'];
      for (const a of themedAttrs) {
        if (f.hasAttributeNS(W_NS, a)) f.removeAttributeNS(W_NS, a);
      }
      f.setAttributeNS(W_NS, 'w:ascii', font);
      f.setAttributeNS(W_NS, 'w:eastAsia', font);
      f.setAttributeNS(W_NS, 'w:hAnsi', font);
      f.setAttributeNS(W_NS, 'w:hint', 'eastAsia');
    }
  }

  return true;
}

// ─────────────────────────────────────────────
// Text replacement helpers
// ─────────────────────────────────────────────

/**
 * Collect all text content from descendant <w:t> elements of a node.
 */
function collectText(node: Element): string {
  const texts = node.getElementsByTagNameNS(W_NS, 't');
  let result = '';
  for (let i = 0; i < texts.length; i++) {
    result += texts[i].textContent || '';
  }
  return result;
}

function findRunProperties(node: Element): Element | null {
  const rPrs = node.getElementsByTagNameNS(W_NS, 'rPr');
  return rPrs.length > 0 ? rPrs[0] : null;
}

function appendTextRun(
  doc: Document,
  para: Element,
  value: string,
  styleSource: Element,
  size: string = FILLED_TEXT_SIZE
): void {
  const run = doc.createElementNS(W_NS, 'w:r');
  const rPr = findRunProperties(styleSource);
  if (rPr) run.appendChild(rPr.cloneNode(true));
  setRunSize(run, size);

  const tElem = doc.createElementNS(W_NS, 'w:t');
  tElem.setAttributeNS(XML_NS, 'xml:space', 'preserve');
  tElem.textContent = value;
  run.appendChild(tElem);
  para.appendChild(run);
}

/**
 * Overwrite a paragraph's text: set the first <w:t> to value, clear the rest.
 * Used for multi-run anchors that the single-<w:t> pass cannot match.
 */
function setParagraphText(para: Element, value: string): void {
  const texts = para.getElementsByTagNameNS(W_NS, 't');
  if (texts.length === 0) return;
  texts[0].textContent = value;
  texts[0].setAttributeNS(XML_NS, 'xml:space', 'preserve');
  setFilledTextSizeForText(texts[0]);
  for (let i = 1; i < texts.length; i++) {
    texts[i].textContent = '';
  }
}

// 「주요 계약사항」 표의 1~10행은 trHeight hRule="exact" 라서 값이 두 줄이 되면
// 두 번째 줄이 그대로 잘려 안 보인다. 긴 주소·법인명이 사라지지 않도록,
// 한 줄에 안 들어갈 때만 9pt → 8pt → 7pt 로 한 단계씩 줄여서 채운다.
const HEADER_FIT_SIZES = ['18', '16', '14']; // 9pt / 8pt / 7pt (half-point units)
const CELL_MARGIN_TWIP = 108;                // Word 기본 좌우 셀 여백
const FIT_SAFETY = 0.95;                     // 폭 추정 오차 여유

/** 값 문자열의 대략적인 렌더링 폭(twip). 한글은 1em, ASCII는 약 0.55em. */
function estimateTextWidth(text: string, halfPoints: string): number {
  const em = (Number(halfPoints) / 2) * 20;
  let width = 0;
  for (const ch of text) {
    width += ch.codePointAt(0)! < 0x1100 ? em * 0.55 : em;
  }
  return width;
}

/** 셀의 본문 사용 가능 폭(twip). tcW가 없으면 null. */
function cellUsableWidth(cell: Element): number | null {
  const tcPr = getDirectChild(cell, 'tcPr');
  const tcW = tcPr ? getDirectChild(tcPr, 'tcW') : null;
  const raw = tcW?.getAttributeNS(W_NS, 'w');
  const width = raw ? Number(raw) : NaN;
  if (!Number.isFinite(width) || width <= 0) return null;
  return width - 2 * CELL_MARGIN_TWIP;
}

/** 높이가 고정(hRule="exact")된 행이면 그 trHeight 엘리먼트를 돌려준다. */
function getExactRowHeight(row: Element): Element | null {
  const trPr = getDirectChild(row, 'trPr');
  const height = trPr ? getDirectChild(trPr, 'trHeight') : null;
  if (!height) return null;
  return height.getAttributeNS(W_NS, 'hRule') === 'exact' ? height : null;
}

/**
 * 고정 높이 행에 들어갈 값의 글자 크기를 정한다.
 * 7pt 로도 한 줄에 못 담으면 그 행만 높이 고정을 풀어(atLeast) 잘리는 대신 늘어나게 한다.
 */
function fitSizeForCell(value: string, cell: Element, row: Element): string {
  const height = getExactRowHeight(row);
  if (!height) return FILLED_TEXT_SIZE;

  const usable = cellUsableWidth(cell);
  if (usable === null) return FILLED_TEXT_SIZE;

  const budget = usable * FIT_SAFETY;
  for (const size of HEADER_FIT_SIZES) {
    if (estimateTextWidth(value, size) <= budget) return size;
  }

  height.setAttributeNS(W_NS, 'w:hRule', 'atLeast');
  return HEADER_FIT_SIZES[HEADER_FIT_SIZES.length - 1];
}

/**
 * Fill the first table's empty cells based on label text in adjacent cells.
 * The header table has rows like: | 법인명 | (empty) |
 * We find the label cell, then fill the value cell next to it.
 */
function fillHeaderTable(doc: Document, labelMap: Record<string, string>): number {
  let filled = 0;
  const tables = doc.getElementsByTagNameNS(W_NS, 'tbl');
  if (tables.length === 0) return 0;

  // Process the first two tables (부지제공자 header + 계약내용 header are in the same table)
  const table = tables[0];
  const rows = table.getElementsByTagNameNS(W_NS, 'tr');

  for (let r = 0; r < rows.length; r++) {
    const cells = rows[r].getElementsByTagNameNS(W_NS, 'tc');
    for (let c = 0; c < cells.length - 1; c++) {
      const labelText = collectText(cells[c]).trim();
      if (labelText in labelMap) {
        const valueCell = cells[c + 1];
        const valueParagraphs = valueCell.getElementsByTagNameNS(W_NS, 'p');
        if (valueParagraphs.length === 0) continue;

        // Check if the value cell is empty (no text)
        const existingText = collectText(valueCell).trim();
        if (existingText) continue;

        // Insert text into the first paragraph
        const para = valueParagraphs[0];
        const value = labelMap[labelText];
        const size = fitSizeForCell(value, valueCell, rows[r]);
        appendTextRun(doc, para, value, cells[c], size);
        filled++;
      }
    }
  }

  return filled;
}

/**
 * Find the nearest ancestor element with the given local name.
 */
function findAncestor(node: Node, localName: string): Element | null {
  let current = node.parentNode;
  while (current) {
    if (current.nodeType === 1 && (current as Element).localName === localName) {
      return current as Element;
    }
    current = current.parentNode;
  }
  return null;
}

// ─────────────────────────────────────────────
// Main fill function
// ─────────────────────────────────────────────

/**
 * Drop <w:lock> from every content control so the recipient can retype a field
 * in Word (템플릿의 완속충전기 수량 SDT가 contentLocked 상태로 들어 있다).
 */
function unlockSdts(doc: Document): void {
  const locks = doc.getElementsByTagNameNS(W_NS, 'lock');
  for (let i = locks.length - 1; i >= 0; i--) {
    locks[i].parentNode?.removeChild(locks[i]);
  }
}

/**
 * Drop any document-level protection (읽기 전용 / 쓰기 보호) from settings.xml
 * so the filled contract stays editable in Word.
 */
async function unlockDocument(zip: JSZip): Promise<void> {
  const settingsFile = zip.file('word/settings.xml');
  if (!settingsFile) return;
  const xml = await settingsFile.async('string');

  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) return;

  let changed = false;
  for (const tag of ['documentProtection', 'writeProtection']) {
    const elems = doc.getElementsByTagNameNS(W_NS, tag);
    for (let i = elems.length - 1; i >= 0; i--) {
      elems[i].parentNode?.removeChild(elems[i]);
      changed = true;
    }
  }
  if (!changed) return;

  zip.file('word/settings.xml', new XMLSerializer().serializeToString(doc));
}

export interface FillResult {
  blob: Blob;
  filledSdtText: number;
  filledSdtCheckbox: number;
  filledTextReplace: number;
  filledHeaderCells: number;
  totalSdt: number;
  unmatchedIds: string[];
}

export async function fillHecTemplate(form: HecFormData): Promise<FillResult> {
  // 1. Fetch template — 사업구분에 따라 보조금/자체투자 문서 선택 (필드는 동일)
  //    자체투자본은 별지5호 설치신청서·개인정보 동의서가 제거된 버전
  const templatePath =
    form.businessType === 'invest'
      ? '/hec/template_invest.docx'
      : '/hec/template.docx';
  const response = await fetch(templatePath);
  if (!response.ok) {
    throw new Error(`템플릿 파일을 불러올 수 없습니다 (${response.status})`);
  }
  const buffer = await response.arrayBuffer();

  // 2. Unzip
  const zip = await JSZip.loadAsync(buffer);
  const documentFile = zip.file('word/document.xml');
  if (!documentFile) {
    throw new Error('템플릿에서 document.xml을 찾을 수 없습니다');
  }
  const documentXml = await documentFile.async('string');

  // 3. Parse XML
  const parser = new DOMParser();
  const doc = parser.parseFromString(documentXml, 'application/xml');
  const errors = doc.getElementsByTagName('parsererror');
  if (errors.length > 0) {
    throw new Error('XML 파싱 실패');
  }

  // 4. Build maps
  const { text: textMap, checkbox: cbMap } = buildHecSdtMaps(form);

  // 5. Fill SDTs (별지5호 + 개인정보 + 별지7호)
  const sdts = doc.getElementsByTagNameNS(W_NS, 'sdt');
  let sdtTextFilled = 0;
  let sdtCbFilled = 0;
  const seenIds = new Set<string>();

  for (let i = 0; i < sdts.length; i++) {
    const sdt = sdts[i];
    const sdtId = getSdtId(sdt);
    if (!sdtId) continue;
    seenIds.add(sdtId);

    if (isCheckboxSdt(sdt)) {
      if (sdtId in cbMap) {
        if (toggleCheckboxSdt(sdt, cbMap[sdtId])) sdtCbFilled++;
      }
    } else {
      if (sdtId in textMap) {
        if (fillTextSdt(sdt, textMap[sdtId])) sdtTextFilled++;
      }
    }
  }

  const allMapped = [...Object.keys(textMap), ...Object.keys(cbMap)];
  const unmatchedIds = allMapped.filter((id) => !seenIds.has(id));

  // 6. Fill header table cells (운영계약서 부지제공자 + 계약내용)
  const headerMap = buildHeaderTableMap(form);
  const filledHeaderCells = fillHeaderTable(doc, headerMap);

  // 7. 서명부·서명날짜·계약기간본문·주차면·공문전화는 SDT(900000031~041)로 채워짐.
  let textReplaceFilled = 0;

  // 8. Apply text replacements (직인동의서, 수량공문, etc.)
  const replacements = buildTextReplacements(form);
  const allTexts = doc.getElementsByTagNameNS(W_NS, 't');
  for (let i = 0; i < allTexts.length; i++) {
    const t = allTexts[i];
    const content = t.textContent || '';
    for (const r of replacements) {
      if (content === r.find) {
        t.textContent = r.replace;
        setFilledTextSizeForText(t);
        textReplaceFilled++;
        break;
      }
    }
  }

  // 8b. Paragraph-level replacements for multi-run anchors (상호, 수량, 공문 회사명)
  // Run after the single-<w:t> pass so already-replaced text (e.g. 공문 날짜)
  // is reflected in the combined text before we rewrite the paragraph.
  const paraReplacements = buildHecParagraphReplacements(form);
  const allParas = doc.getElementsByTagNameNS(W_NS, 'p');
  for (let i = 0; i < allParas.length; i++) {
    const combined = collectText(allParas[i]);
    let newText = combined;
    for (const r of paraReplacements) {
      if (newText.includes(r.find)) newText = newText.split(r.find).join(r.replace);
    }
    if (newText !== combined) {
      setParagraphText(allParas[i], newText);
      textReplaceFilled++;
    }
  }

  // 9. Serialize and write back
  unlockSdts(doc);
  const serializer = new XMLSerializer();
  const newXml = serializer.serializeToString(doc);
  zip.file('word/document.xml', newXml);

  // 9-1. Lift any read-only protection carried by the template
  await unlockDocument(zip);

  // 10. Generate output blob
  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
  });

  return {
    blob,
    filledSdtText: sdtTextFilled,
    filledSdtCheckbox: sdtCbFilled,
    filledTextReplace: textReplaceFilled,
    filledHeaderCells,
    totalSdt: sdts.length,
    unmatchedIds,
  };
}
