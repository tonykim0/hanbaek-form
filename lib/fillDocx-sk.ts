/**
 * SK (SK일렉링크) docx template filler.
 */

import JSZip from 'jszip';
import {
  SkFormData,
  buildSkSdtMaps,
  buildSkTextReplacements,
  buildSkHeaderTableMap,
  buildSkSealConsentMap,
} from './schema-sk';

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

function fillLabelValueTable(
  doc: Document,
  table: Element,
  labelMap: Record<string, string>
): number {
  let filled = 0;
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

export interface FillResult {
  blob: Blob;
  filledSdtText: number;
  filledSdtCheckbox: number;
  filledTextReplace: number;
  filledHeaderCells: number;
  totalSdt: number;
  unmatchedIds: string[];
}

export async function fillSkTemplate(form: SkFormData): Promise<FillResult> {
  const response = await fetch('/sk/template.docx');
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

  const { text: textMap, checkbox: cbMap } = buildSkSdtMaps(form);

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

  // Fill Table 0 (계약 당사자) header cells
  const tables = doc.getElementsByTagNameNS(W_NS, 'tbl');
  let filledHeaderCells = 0;
  if (tables.length > 0) {
    filledHeaderCells += fillLabelValueTable(doc, tables[0], buildSkHeaderTableMap(form));
  }
  // Fill Table 3 (직인 동의서) label cells
  if (tables.length > 3) {
    filledHeaderCells += fillLabelValueTable(doc, tables[3], buildSkSealConsentMap(form));
  }

  // 서비스이용자 signature (paragraph exact match)
  let textReplaceFilled = 0;
  const paras = doc.getElementsByTagNameNS(W_NS, 'p');
  for (let i = 0; i < paras.length; i++) {
    const combined = collectText(paras[i]);
    if (combined === '서비스이용자                              (인)') {
      setParagraphText(
        paras[i],
        `서비스이용자       ${form.custName}${' '.repeat(Math.max(1, 22 - form.custName.length))}(인)`
      );
      textReplaceFilled++;
      break;
    }
  }

  // Single-<w:t> replacements
  const textRepls = buildSkTextReplacements(form);
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
