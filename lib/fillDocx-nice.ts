/**
 * NICE (나이스인프라) docx template filler.
 */

import JSZip from 'jszip';
import {
  NiceFormData,
  buildNiceSdtMaps,
  buildNiceParagraphReplacements,
  buildNiceTextReplacements,
  buildNiceHeaderTableMap,
  computeNiceContractAmount,
} from './schema-nice';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const W14_NS = 'http://schemas.microsoft.com/office/word/2010/wordml';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

const CHECKED_GLYPH = '\u25A0';
const UNCHECKED_GLYPH = '\u2610';
const CHECKED_FONT = '맑은 고딕';
const UNCHECKED_FONT = 'MS Gothic';

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

function collectText(node: Element): string {
  const texts = node.getElementsByTagNameNS(W_NS, 't');
  let result = '';
  for (let i = 0; i < texts.length; i++) {
    result += texts[i].textContent || '';
  }
  return result;
}

function setParagraphText(para: Element, value: string): void {
  const texts = para.getElementsByTagNameNS(W_NS, 't');
  if (texts.length === 0) {
    const runs = para.getElementsByTagNameNS(W_NS, 'r');
    if (runs.length === 0) return;
    const doc = para.ownerDocument!;
    const tElem = doc.createElementNS(W_NS, 'w:t');
    tElem.setAttributeNS(XML_NS, 'xml:space', 'preserve');
    tElem.textContent = value;
    runs[0].appendChild(tElem);
    return;
  }
  texts[0].textContent = value;
  texts[0].setAttributeNS(XML_NS, 'xml:space', 'preserve');
  for (let i = 1; i < texts.length; i++) {
    texts[i].textContent = '';
  }
}

function fillEmptyCell(doc: Document, cell: Element, value: string): boolean {
  const paras = cell.getElementsByTagNameNS(W_NS, 'p');
  if (paras.length === 0) return false;
  const para = paras[0];
  const texts = para.getElementsByTagNameNS(W_NS, 't');
  if (texts.length > 0) {
    texts[0].textContent = value;
    texts[0].setAttributeNS(XML_NS, 'xml:space', 'preserve');
    for (let i = 1; i < texts.length; i++) {
      texts[i].textContent = '';
    }
    return true;
  }
  const run = doc.createElementNS(W_NS, 'w:r');
  const tElem = doc.createElementNS(W_NS, 'w:t');
  tElem.setAttributeNS(XML_NS, 'xml:space', 'preserve');
  tElem.textContent = value;
  run.appendChild(tElem);
  para.appendChild(run);
  return true;
}

function fillHeaderTable(doc: Document, labelMap: Record<string, string>): number {
  let filled = 0;
  const tables = doc.getElementsByTagNameNS(W_NS, 'tbl');
  if (tables.length === 0) return 0;

  const table = tables[0];
  const rows = table.getElementsByTagNameNS(W_NS, 'tr');

  for (let r = 0; r < rows.length; r++) {
    const cells = rows[r].getElementsByTagNameNS(W_NS, 'tc');
    for (let c = 0; c < cells.length - 1; c++) {
      const labelText = collectText(cells[c]).trim();
      if (labelText in labelMap) {
        const valueCell = cells[c + 1];
        const existing = collectText(valueCell).trim();
        if (existing) continue;
        if (fillEmptyCell(doc, valueCell, labelMap[labelText])) filled++;
      }
    }
  }
  return filled;
}

/**
 * Fill NICE 계약내용 row (Table 0 Row 8): 수량, 계약금액 cells.
 * 모델명(index 2) is left blank for manual entry later.
 * Row has 7 cells; index 4 has '3,600,000' (단가).
 */
function fillNiceContractRow(doc: Document, form: NiceFormData): number {
  let filled = 0;
  const tables = doc.getElementsByTagNameNS(W_NS, 'tbl');
  if (tables.length === 0) return 0;

  const rows = tables[0].getElementsByTagNameNS(W_NS, 'tr');
  for (let r = 0; r < rows.length; r++) {
    const cells = rows[r].getElementsByTagNameNS(W_NS, 'tc');
    if (cells.length !== 7) continue;
    const priceText = collectText(cells[4]).trim();
    if (priceText !== '3,600,000') continue;

    if (fillEmptyCell(doc, cells[3], form.installQty)) filled++;
    const amount = computeNiceContractAmount(form.installQty);
    if (amount && fillEmptyCell(doc, cells[5], amount)) filled++;
    break;
  }
  return filled;
}

/**
 * Toggle the inline 계약기간 checkboxes in 제3조:
 *   "☐ 7년(84개월) ■ 10년(120개월)"
 * Runs are split — find the paragraph with this text and rewrite.
 */
function fillNiceContractTerm(doc: Document, form: NiceFormData): number {
  const paras = doc.getElementsByTagNameNS(W_NS, 'p');
  for (let i = 0; i < paras.length; i++) {
    const combined = collectText(paras[i]);
    if (combined.includes('7년(84개월)') && combined.includes('10년(120개월)')) {
      const box7 = form.contractTerm === '7' ? CHECKED_GLYPH : UNCHECKED_GLYPH;
      const box10 = form.contractTerm === '10' ? CHECKED_GLYPH : UNCHECKED_GLYPH;
      const prefix = combined.split('☐')[0].split('■')[0];
      const newText = `${prefix}${box7} 7년(84개월) ${box10} 10년(120개월)`;
      setParagraphText(paras[i], newText);
      return 1;
    }
  }
  return 0;
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

export async function fillNiceTemplate(form: NiceFormData): Promise<FillResult> {
  const response = await fetch('/nice/template.docx');
  if (!response.ok) {
    throw new Error(`템플릿 파일을 불러올 수 없습니다 (${response.status})`);
  }
  const buffer = await response.arrayBuffer();

  const zip = await JSZip.loadAsync(buffer);
  const documentFile = zip.file('word/document.xml');
  if (!documentFile) throw new Error('템플릿에서 document.xml을 찾을 수 없습니다');
  const documentXml = await documentFile.async('string');

  const parser = new DOMParser();
  const doc = parser.parseFromString(documentXml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('XML 파싱 실패');
  }

  const { text: textMap, checkbox: cbMap } = buildNiceSdtMaps(form);

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
      if (sdtId in cbMap && toggleCheckboxSdt(sdt, cbMap[sdtId])) sdtCbFilled++;
    } else {
      if (sdtId in textMap && fillTextSdt(sdt, textMap[sdtId])) sdtTextFilled++;
    }
  }

  const allMapped = [...Object.keys(textMap), ...Object.keys(cbMap)];
  const unmatchedIds = allMapped.filter((id) => !seenIds.has(id));

  const headerMap = buildNiceHeaderTableMap(form);
  const filledHeaderCells = fillHeaderTable(doc, headerMap);

  let textReplaceFilled = 0;
  textReplaceFilled += fillNiceContractRow(doc, form);
  textReplaceFilled += fillNiceContractTerm(doc, form);

  // Paragraph-level replacements (multi-run)
  const paraRepls = buildNiceParagraphReplacements(form);
  const paras = doc.getElementsByTagNameNS(W_NS, 'p');
  for (let i = 0; i < paras.length; i++) {
    const combined = collectText(paras[i]);
    for (const r of paraRepls) {
      if (combined === r.find) {
        setParagraphText(paras[i], r.replace);
        textReplaceFilled++;
        break;
      }
    }
  }

  // Single-<w:t> replacements
  const textRepls = buildNiceTextReplacements(form);
  const allTexts = doc.getElementsByTagNameNS(W_NS, 't');
  for (let i = 0; i < allTexts.length; i++) {
    const t = allTexts[i];
    const content = t.textContent || '';
    for (const r of textRepls) {
      if (content === r.find) {
        t.textContent = r.replace;
        textReplaceFilled++;
        break;
      }
    }
  }

  const serializer = new XMLSerializer();
  const newXml = serializer.serializeToString(doc);
  zip.file('word/document.xml', newXml);

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
