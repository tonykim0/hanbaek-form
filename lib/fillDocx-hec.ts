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
const FILLED_TEXT_SIZE = '16'; // 8pt in Word half-point units

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

function setFilledTextSize(run: Element): void {
  const rPr = ensureRunProperties(run);
  setRunPropertyValue(rPr, 'sz', FILLED_TEXT_SIZE);
  setRunPropertyValue(rPr, 'szCs', FILLED_TEXT_SIZE);
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

function appendTextRun(doc: Document, para: Element, value: string, styleSource: Element): void {
  const run = doc.createElementNS(W_NS, 'w:r');
  const rPr = findRunProperties(styleSource);
  if (rPr) run.appendChild(rPr.cloneNode(true));
  setFilledTextSize(run);

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
        appendTextRun(doc, para, labelMap[labelText], cells[c]);
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
  const serializer = new XMLSerializer();
  const newXml = serializer.serializeToString(doc);
  zip.file('word/document.xml', newXml);

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
