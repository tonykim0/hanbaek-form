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
  buildHeaderTableMap,
} from './schema-hec';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const W14_NS = 'http://schemas.microsoft.com/office/word/2010/wordml';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

const CHECKED_GLYPH = '\u25A0';   // ■
const UNCHECKED_GLYPH = '\u2610'; // ☐
const CHECKED_FONT = '맑은 고딕';
const UNCHECKED_FONT = 'MS Gothic';

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
    const rprList = runs[i].getElementsByTagNameNS(W_NS, 'rPr');
    if (rprList.length === 0) continue;
    const rpr = rprList[0];
    const tagsToRemove = ['i', 'iCs', 'color', 'u', 'rStyle'];
    for (const tag of tagsToRemove) {
      const elems = rpr.getElementsByTagNameNS(W_NS, tag);
      while (elems.length > 0) {
        elems[0].parentNode?.removeChild(elems[0]);
      }
    }
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
        const run = doc.createElementNS(W_NS, 'w:r');
        const tElem = doc.createElementNS(W_NS, 'w:t');
        tElem.setAttributeNS(XML_NS, 'xml:space', 'preserve');
        tElem.textContent = labelMap[labelText];
        run.appendChild(tElem);
        para.appendChild(run);
        filled++;
      }
    }
  }

  return filled;
}

/**
 * Fill the signature blocks in the 운영계약서.
 * There are 2 signature tables (after contract body + after yakgwan),
 * each with a "부지제공자" column containing empty "주소 : ", "상호 : ", "대표자 : " lines.
 */
function fillSignatureBlocks(doc: Document, form: HecFormData): number {
  let filled = 0;
  const allTexts = doc.getElementsByTagNameNS(W_NS, 't');

  for (let i = 0; i < allTexts.length; i++) {
    const t = allTexts[i];
    const content = t.textContent || '';

    // Fill "주소 : " (empty, in the 부지제공자 column of signature table)
    if (content === '주소 : ') {
      // Check this is in a signature block (inside a table cell with "부지제공자")
      const tc = findAncestor(t, 'tc');
      if (tc) {
        t.textContent = `주소 : ${form.custAddr}`;
        filled++;
      }
    }

    // Fill "상호 : " (empty, in the 부지제공자 column of signature table)
    if (content === '상호 : ') {
      const tc = findAncestor(t, 'tc');
      if (tc) {
        t.textContent = `상호 : ${form.custName}`;
        filled++;
      }
    }

    // Fill "대표자 : " — the rep name goes into the next run's spaces
    // (may have bookmarkStart siblings between runs, so walk forward)
    if (content === '대표자 : ') {
      const run = findAncestor(t, 'r');
      if (!run) continue;
      let sibling: Element | null = run.nextElementSibling;
      while (sibling && sibling.localName !== 'r') {
        sibling = sibling.nextElementSibling;
      }
      if (sibling) {
        const nextT = sibling.getElementsByTagNameNS(W_NS, 't');
        if (nextT.length > 0 && (nextT[0].textContent || '').trim() === '') {
          nextT[0].textContent = form.custRepresentative;
          filled++;
        }
      }
    }
  }

  return filled;
}

/**
 * Fill the second signature date (약관 하단).
 * This date is split across two runs: "년" and "    월    일".
 */
function fillSecondSignatureDate(doc: Document, form: HecFormData): number {
  let filled = 0;
  const allTexts = doc.getElementsByTagNameNS(W_NS, 't');

  for (let i = 0; i < allTexts.length; i++) {
    const t = allTexts[i];
    const content = t.textContent || '';

    // Find standalone "년" that is followed by "    월    일" in the next <w:t>
    if (content === '년' && i + 1 < allTexts.length) {
      const nextContent = allTexts[i + 1].textContent || '';
      if (nextContent.includes('월') && nextContent.includes('일')) {
        t.textContent = `${form.contractYear}년`;
        allTexts[i + 1].textContent = ` ${form.contractMonth}월 ${form.contractDay}일`;
        filled++;
      }
    }
  }

  return filled;
}

/**
 * Fill the contract term in the header table.
 * The pattern is: "완속 :  " (run1) + " " (run2) + "  년 / 급속 :     년" (run3)
 */
function fillContractTerm(doc: Document, form: HecFormData): number {
  let filled = 0;
  const allTexts = doc.getElementsByTagNameNS(W_NS, 't');

  for (let i = 0; i < allTexts.length; i++) {
    const content = allTexts[i].textContent || '';

    // Header table contract term row
    if (content === '완속 :  ') {
      allTexts[i].textContent = `완속 : ${form.contractTerm}`;
      // Clear the space run and the remaining text
      if (i + 1 < allTexts.length && (allTexts[i + 1].textContent || '').trim() === '') {
        allTexts[i + 1].textContent = '';
      }
      if (i + 2 < allTexts.length && (allTexts[i + 2].textContent || '').includes('년 / 급속')) {
        allTexts[i + 2].textContent = '년 / 급속 :     년';
      }
      filled++;
    }

    // Contract body: "운영시작일로부터 " + spaces + "년으로 한다"
    if (content === '운영 계약기간은 운영시작일로부터 ') {
      // The term goes into the next run(s) which contain underlined spaces
      if (i + 1 < allTexts.length && (allTexts[i + 1].textContent || '').trim() === '') {
        allTexts[i + 1].textContent = form.contractTerm;
      }
      filled++;
    }

    // Parking slots: "( " + spaces + " ) 면"
    if (content === '( ') {
      // Check if this is in the 완속 parking slots context
      if (i + 1 < allTexts.length && (allTexts[i + 1].textContent || '').trim() === '') {
        if (i + 2 < allTexts.length && (allTexts[i + 2].textContent || '').includes(') 면')) {
          allTexts[i].textContent = `( ${form.installQty}`;
          allTexts[i + 1].textContent = '';
          filled++;
        }
      }
    }
  }

  return filled;
}

/**
 * Fill the TEL/EMAIL line in 수량공문.
 * Pattern: "TEL : 051-783-0672   E-MAIL : "
 */
function fillTelEmailLine(doc: Document, form: HecFormData): number {
  let filled = 0;
  const allTexts = doc.getElementsByTagNameNS(W_NS, 't');

  for (let i = 0; i < allTexts.length; i++) {
    const content = allTexts[i].textContent || '';
    if (content.startsWith('TEL : ') && content.includes('E-MAIL : ')) {
      allTexts[i].textContent = `TEL : ${form.custTel}   E-MAIL : `;
      filled++;
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
  // 1. Fetch template
  const response = await fetch('/hec/template.docx');
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

  // 7. Fill contract term, parking slots, etc.
  let textReplaceFilled = 0;
  textReplaceFilled += fillContractTerm(doc, form);
  textReplaceFilled += fillSignatureBlocks(doc, form);
  textReplaceFilled += fillSecondSignatureDate(doc, form);
  textReplaceFilled += fillTelEmailLine(doc, form);

  // 8. Apply text replacements (직인동의서, 수량공문, etc.)
  const replacements = buildTextReplacements(form);
  const allTexts = doc.getElementsByTagNameNS(W_NS, 't');
  for (let i = 0; i < allTexts.length; i++) {
    const t = allTexts[i];
    const content = t.textContent || '';
    for (const r of replacements) {
      if (content === r.find) {
        t.textContent = r.replace;
        textReplaceFilled++;
        break;
      }
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
