/**
 * Fill SDT (Content Control) elements in a Word .docx template.
 *
 * Runs entirely in the browser using JSZip + DOMParser. No server,
 * no upload — the customer data never leaves the user's browser.
 */

import JSZip from 'jszip';
import { ContractFormData, buildSdtValueMap } from './schema';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

/**
 * Read the SDT id from a <w:sdt> element. Returns null if missing.
 *
 * Structure:
 *   <w:sdt>
 *     <w:sdtPr>
 *       <w:id w:val="..." />
 *       ...
 */
function getSdtId(sdt: Element): string | null {
  const sdtPrList = sdt.getElementsByTagNameNS(W_NS, 'sdtPr');
  if (sdtPrList.length === 0) return null;
  const ids = sdtPrList[0].getElementsByTagNameNS(W_NS, 'id');
  if (ids.length === 0) return null;
  return ids[0].getAttributeNS(W_NS, 'val');
}

/**
 * Replace placeholder content in an SDT with the given value.
 * Strips italic / gray styling so the filled value looks normal.
 */
function fillSdt(sdt: Element, value: string): boolean {
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

export interface FillResult {
  blob: Blob;
  filledCount: number;
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
  // 1. Fetch template
  const response = await fetch('/template.docx');
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

  // 4. Build value map
  const valueMap = buildSdtValueMap(form);

  // 5. Walk all <w:sdt> elements and fill matching ones
  const sdts = doc.getElementsByTagNameNS(W_NS, 'sdt');
  let filled = 0;
  const seenIds = new Set<string>();
  for (let i = 0; i < sdts.length; i++) {
    const sdt = sdts[i];
    const sdtId = getSdtId(sdt);
    if (!sdtId) continue;
    seenIds.add(sdtId);
    const value = valueMap[sdtId];
    if (value !== undefined) {
      if (fillSdt(sdt, value)) filled++;
    }
  }

  // Check which mapped IDs were not found in the doc (template drift detection)
  const unmatchedIds = Object.keys(valueMap).filter((id) => !seenIds.has(id));

  // 6. Serialize and write back
  const serializer = new XMLSerializer();
  const newXml = serializer.serializeToString(doc);
  zip.file('word/document.xml', newXml);

  // 7. Generate output blob
  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
  });

  return {
    blob,
    filledCount: filled,
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
