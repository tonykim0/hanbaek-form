/**
 * v2: Fill SDT (Content Control) elements in a Word .docx template.
 * Now handles BOTH text-field SDTs and checkbox SDTs.
 *
 * Runs entirely in the browser using JSZip + DOMParser. No server,
 * no upload — the customer data never leaves the user's browser.
 */

import JSZip from 'jszip';
import { ContractFormData, buildSdtMaps } from './schema';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const W14_NS = 'http://schemas.microsoft.com/office/word/2010/wordml';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

// Glyphs Word uses for the two checkbox states
const CHECKED_GLYPH = '\u25A0';   // ■
const UNCHECKED_GLYPH = '\u2610'; // ☐
const CHECKED_FONT = '맑은 고딕';
const UNCHECKED_FONT = 'MS Gothic';

// Word's built-in "Placeholder Text" character style (styles.xml). Only this
// rStyle gets stripped on fill — the template's other character styles
// (스타일1/스타일(9pt)/스타일(10pt)/스타일(12pt)) carry the field's font size,
// so removing them blindly would blow every filled value up to the 11pt default.
const PLACEHOLDER_STYLE_ID = 'af0';

/**
 * Read the SDT id from a <w:sdt> element. Returns null if missing.
 */
function getSdtId(sdt: Element): string | null {
  const sdtPrList = sdt.getElementsByTagNameNS(W_NS, 'sdtPr');
  if (sdtPrList.length === 0) return null;
  const ids = sdtPrList[0].getElementsByTagNameNS(W_NS, 'id');
  if (ids.length === 0) return null;
  return ids[0].getAttributeNS(W_NS, 'val');
}

/** True if this SDT contains a <w14:checkbox> child in sdtPr. */
function isCheckboxSdt(sdt: Element): boolean {
  const sdtPrList = sdt.getElementsByTagNameNS(W_NS, 'sdtPr');
  if (sdtPrList.length === 0) return false;
  return sdtPrList[0].getElementsByTagNameNS(W14_NS, 'checkbox').length > 0;
}

/**
 * Replace placeholder content in a text SDT with the given value.
 * Strips italic / gray styling so the filled value looks normal.
 * An empty `value` clears the placeholder (results in a blank field).
 */
function fillTextSdt(sdt: Element, value: string): boolean {
  // Remove <w:showingPlcHdr/> from sdtPr (if present)
  const sdtPrList = sdt.getElementsByTagNameNS(W_NS, 'sdtPr');
  if (sdtPrList.length > 0) {
    const showings = sdtPrList[0].getElementsByTagNameNS(W_NS, 'showingPlcHdr');
    while (showings.length > 0) {
      showings[0].parentNode?.removeChild(showings[0]);
    }
  }

  // Find sdtContent
  const contents = sdt.getElementsByTagNameNS(W_NS, 'sdtContent');
  if (contents.length === 0) return false;
  const content = contents[0];

  // Find <w:t> elements within sdtContent
  const texts = content.getElementsByTagNameNS(W_NS, 't');
  if (texts.length === 0) return false;

  // Set the first <w:t> to the value, clear the rest
  texts[0].textContent = value;
  texts[0].setAttributeNS(XML_NS, 'xml:space', 'preserve');
  for (let i = 1; i < texts.length; i++) {
    texts[i].textContent = '';
  }

  // Strip placeholder styling (italic, color, underline) from runs
  const runs = content.getElementsByTagNameNS(W_NS, 'r');
  for (let i = 0; i < runs.length; i++) {
    const rprList = runs[i].getElementsByTagNameNS(W_NS, 'rPr');
    if (rprList.length === 0) continue;
    const rpr = rprList[0];

    const tagsToRemove = ['i', 'iCs', 'color', 'u'];
    for (const tag of tagsToRemove) {
      const elems = rpr.getElementsByTagNameNS(W_NS, tag);
      while (elems.length > 0) {
        elems[0].parentNode?.removeChild(elems[0]);
      }
    }

    // rStyle: drop only the placeholder style, keep the size-bearing ones
    const rStyles = rpr.getElementsByTagNameNS(W_NS, 'rStyle');
    for (let j = rStyles.length - 1; j >= 0; j--) {
      if (rStyles[j].getAttributeNS(W_NS, 'val') === PLACEHOLDER_STYLE_ID) {
        rStyles[j].parentNode?.removeChild(rStyles[j]);
      }
    }
  }

  return true;
}

/**
 * Toggle a checkbox SDT to the given state.
 *
 * Word checkbox SDT structure (relevant bits):
 *   <w:sdt>
 *     <w:sdtPr>
 *       <w14:checkbox>
 *         <w14:checked w14:val="0"|"1"/>          ← state we flip
 *         <w14:checkedState w14:val="25A0" .../>
 *         <w14:uncheckedState w14:val="2610" .../>
 *       </w14:checkbox>
 *     </w:sdtPr>
 *     <w:sdtContent>
 *       <w:r>
 *         <w:rPr><w:rFonts ascii=... eastAsia=... .../></w:rPr>
 *         <w:t>■ or ☐</w:t>                       ← glyph we flip
 *       </w:r>
 *     </w:sdtContent>
 *   </w:sdt>
 *
 * We must update BOTH the w14:checked val AND the rendered glyph + font,
 * otherwise the docx will look wrong even though Word's internal state is right.
 */
function toggleCheckboxSdt(sdt: Element, checked: boolean): boolean {
  // 1. Flip <w14:checked w14:val="..."/>
  const checkedEls = sdt.getElementsByTagNameNS(W14_NS, 'checked');
  if (checkedEls.length === 0) return false;
  checkedEls[0].setAttributeNS(W14_NS, 'w14:val', checked ? '1' : '0');

  // 2. Flip glyph in <w:t>
  const contents = sdt.getElementsByTagNameNS(W_NS, 'sdtContent');
  if (contents.length === 0) return false;
  const texts = contents[0].getElementsByTagNameNS(W_NS, 't');
  if (texts.length === 0) return false;
  texts[0].textContent = checked ? CHECKED_GLYPH : UNCHECKED_GLYPH;

  // 3. Flip font in run's rPr (Word switches font with state)
  const runs = contents[0].getElementsByTagNameNS(W_NS, 'r');
  for (let i = 0; i < runs.length; i++) {
    const rprList = runs[i].getElementsByTagNameNS(W_NS, 'rPr');
    if (rprList.length === 0) continue;
    const fonts = rprList[0].getElementsByTagNameNS(W_NS, 'rFonts');
    const font = checked ? CHECKED_FONT : UNCHECKED_FONT;
    if (fonts.length > 0) {
      const f = fonts[0];
      // Strip themed font hints first (they override explicit fonts)
      const themedAttrs = [
        'asciiTheme',
        'hAnsiTheme',
        'eastAsiaTheme',
        'cstheme',
      ];
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

/** Drop <w:lock> from every content control so fields stay retypable in Word. */
function unlockSdts(doc: Document): void {
  const locks = doc.getElementsByTagNameNS(W_NS, 'lock');
  for (let i = locks.length - 1; i >= 0; i--) {
    locks[i].parentNode?.removeChild(locks[i]);
  }
}

/**
 * The pluglink templates ship with <w:documentProtection w:edit="readOnly"/>,
 * which makes the downloaded contract uneditable in Word. Drop it so the filled
 * document can still be touched up by hand.
 */
async function unlockDocument(zip: JSZip): Promise<void> {
  const settingsFile = zip.file('word/settings.xml');
  if (!settingsFile) return;
  const xml = await settingsFile.async('string');

  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) return;

  const protections = doc.getElementsByTagNameNS(W_NS, 'documentProtection');
  if (protections.length === 0) return;
  for (let i = protections.length - 1; i >= 0; i--) {
    protections[i].parentNode?.removeChild(protections[i]);
  }

  zip.file('word/settings.xml', new XMLSerializer().serializeToString(doc));
}

export interface FillResult {
  blob: Blob;
  filledTextCount: number;
  toggledCheckboxCount: number;
  totalSdt: number;
  unmatchedIds: string[];
}

/**
 * Fetch the template from /template.docx, fill SDTs from form data,
 * and return a Blob ready to download.
 */
export async function fillContractTemplate(
  form: ContractFormData
): Promise<FillResult> {
  // 1. Fetch template — 사업구분에 따라 보조금/자체투자 문서 선택 (필드는 동일)
  const templatePath =
    form.businessType === 'invest'
      ? '/pluglink/template_invest.docx'
      : '/pluglink/template.docx';
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
  const { text: textMap, checkbox: cbMap, remove } = buildSdtMaps(form);
  const removeIds = new Set(remove ?? []);

  // 5. Walk all <w:sdt> elements and fill matching ones.
  //    Snapshot to an array first — removeSdtBlock() mutates the tree.
  const sdtList = doc.getElementsByTagNameNS(W_NS, 'sdt');
  const sdts: Element[] = [];
  for (let i = 0; i < sdtList.length; i++) sdts.push(sdtList[i]);
  let textFilled = 0;
  let cbToggled = 0;
  const seenIds = new Set<string>();

  for (const sdt of sdts) {
    const sdtId = getSdtId(sdt);
    if (!sdtId) continue;
    seenIds.add(sdtId);

    // Block SDT marked for removal (e.g. 7년 계약 → 2단계 프로모션 문단 삭제)
    if (removeIds.has(sdtId)) {
      sdt.parentNode?.removeChild(sdt);
      continue;
    }

    if (isCheckboxSdt(sdt)) {
      if (sdtId in cbMap) {
        if (toggleCheckboxSdt(sdt, cbMap[sdtId])) cbToggled++;
      }
    } else {
      if (sdtId in textMap) {
        if (fillTextSdt(sdt, textMap[sdtId])) textFilled++;
      }
    }
  }

  // Check which mapped IDs were not found in the doc (template drift detection)
  const allMapped = [...Object.keys(textMap), ...Object.keys(cbMap), ...removeIds];
  const unmatchedIds = allMapped.filter((id) => !seenIds.has(id));

  // 6. Serialize and write back
  unlockSdts(doc);
  const serializer = new XMLSerializer();
  const newXml = serializer.serializeToString(doc);
  zip.file('word/document.xml', newXml);

  // 6-1. Lift the template's read-only protection
  await unlockDocument(zip);

  // 7. Generate output blob
  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
  });

  return {
    blob,
    filledTextCount: textFilled,
    toggledCheckboxCount: cbToggled,
    totalSdt: sdts.length,
    unmatchedIds,
  };
}

/** Trigger a browser download for a blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so the download has a chance to start
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
