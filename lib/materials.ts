/**
 * 자료실 목록 — Vercel Blob에 올라간 파일을 읽어 옵니다.
 *
 * 저장 경로는 `materials/<운영사>/<분류>/<파일명>` 이며, 목록에 필요한 정보
 * (파일명 · 용량 · 올린 날짜 · 다운로드 URL)는 Blob이 그대로 돌려주므로
 * 별도의 DB를 두지 않습니다.
 *
 * 파일 추가·삭제는 `/admin/materials` 관리자 화면에서 하며, 배포 없이 즉시
 * 목록에 반영됩니다.
 */
import { list } from '@vercel/blob';
import {
  CATEGORY_ORDER,
  GROUP_ORDER,
  LOOSE_CATEGORY,
  MATERIALS_PREFIX,
  categoryLabel,
  formatDate,
  formatSize,
  groupLabel,
  orderIndex,
  type MaterialCategory,
  type MaterialFile,
  type MaterialGroup,
} from './materials-meta';

export type { MaterialCategory, MaterialFile, MaterialGroup };

export interface MaterialsResult {
  groups: MaterialGroup[];
  fileCount: number;
  lastUpdated: string | null;
  /** Blob 저장소가 아직 연결되지 않았을 때 (BLOB_READ_WRITE_TOKEN 없음) */
  storageMissing: boolean;
  /** 조회 실패 사유 — 화면에 안내를 띄우기 위한 값 */
  error: string | null;
}

const EMPTY: MaterialsResult = {
  groups: [],
  fileCount: 0,
  lastUpdated: null,
  storageMissing: false,
  error: null,
};

/** Blob 한 건 → 화면용 파일 정보. 경로 규칙에 맞지 않으면 null */
function toMaterialFile(blob: {
  pathname: string;
  url: string;
  downloadUrl: string;
  size: number;
  uploadedAt: Date;
}): { group: string; category: string; file: MaterialFile } | null {
  if (!blob.pathname.startsWith(MATERIALS_PREFIX)) return null;

  const segments = blob.pathname.slice(MATERIALS_PREFIX.length).split('/');
  if (segments.length < 2) return null;

  const group = segments[0];
  const fileName = segments[segments.length - 1];
  // materials/<운영사>/<파일> 처럼 분류가 없으면 「기타」로 묶습니다
  const category = segments.length >= 3 ? segments[1] : LOOSE_CATEGORY;
  if (!group || !fileName) return null;

  const dot = fileName.lastIndexOf('.');
  const ext = dot > 0 ? fileName.slice(dot + 1) : '';
  const uploadedAt = new Date(blob.uploadedAt).getTime();

  return {
    group,
    category,
    file: {
      title: dot > 0 ? fileName.slice(0, dot) : fileName,
      fileName,
      pathname: blob.pathname,
      url: blob.url,
      downloadUrl: blob.downloadUrl,
      ext: ext.toUpperCase(),
      size: formatSize(blob.size),
      uploaded: formatDate(blob.uploadedAt),
      uploadedAt,
    },
  };
}

/**
 * 자료실 전체 목록. 운영사 → 분류 → 파일 순으로 묶어 돌려줍니다.
 * 파일이 없는 운영사·분류는 빠집니다.
 */
export async function getMaterials(): Promise<MaterialsResult> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return { ...EMPTY, storageMissing: true };
  }

  const blobs: Array<{
    pathname: string;
    url: string;
    downloadUrl: string;
    size: number;
    uploadedAt: Date;
  }> = [];

  try {
    let cursor: string | undefined;
    do {
      const page = await list({ prefix: MATERIALS_PREFIX, limit: 1000, cursor });
      blobs.push(...page.blobs);
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
  } catch (error) {
    console.error('[materials] Blob 목록 조회 실패:', error);
    return { ...EMPTY, error: (error as Error).message };
  }

  const groupMap = new Map<string, Map<string, MaterialFile[]>>();

  for (const blob of blobs) {
    const parsed = toMaterialFile(blob);
    if (!parsed) continue;
    const categories = groupMap.get(parsed.group) ?? new Map<string, MaterialFile[]>();
    const files = categories.get(parsed.category) ?? [];
    files.push(parsed.file);
    categories.set(parsed.category, files);
    groupMap.set(parsed.group, categories);
  }

  const groups: MaterialGroup[] = [...groupMap.entries()]
    .map(([groupKey, categoryMap]) => {
      const categories: MaterialCategory[] = [...categoryMap.entries()]
        .map(([categoryKey, files]) => ({
          key: categoryKey,
          label: categoryLabel(categoryKey),
          files: files.sort((a, b) => a.title.localeCompare(b.title, 'ko')),
        }))
        .sort(
          (a, b) =>
            orderIndex(CATEGORY_ORDER, a.key) - orderIndex(CATEGORY_ORDER, b.key) ||
            a.label.localeCompare(b.label, 'ko')
        );

      return {
        key: groupKey,
        label: groupLabel(groupKey),
        categories,
        fileCount: categories.reduce((sum, c) => sum + c.files.length, 0),
      };
    })
    .filter((group) => group.fileCount > 0)
    .sort(
      (a, b) =>
        orderIndex(GROUP_ORDER, a.key) - orderIndex(GROUP_ORDER, b.key) ||
        a.label.localeCompare(b.label, 'ko')
    );

  const files = groups.flatMap((g) => g.categories.flatMap((c) => c.files));
  const lastUpdated =
    files.length > 0 ? formatDate(Math.max(...files.map((f) => f.uploadedAt))) : null;

  return {
    groups,
    fileCount: files.length,
    lastUpdated,
    storageMissing: false,
    error: null,
  };
}
