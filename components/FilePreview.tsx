'use client';

interface FilePreviewProps {
  files: File[];
  onRemove: (index: number) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FilePreview({ files, onRemove }: FilePreviewProps) {
  if (files.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700">
        선택된 파일 ({files.length}건)
      </p>
      <ul className="space-y-1">
        {files.map((file, i) => (
          <li
            key={`${file.name}-${file.size}`}
            className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-gray-400 text-sm flex-shrink-0">
                {file.name.endsWith('.zip') ? '\u{1F4E6}' : '\u{1F4C4}'}
              </span>
              <span className="text-sm text-gray-800 truncate">{file.name}</span>
              <span className="text-xs text-gray-400 flex-shrink-0">
                {formatSize(file.size)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="text-gray-400 hover:text-red-500 ml-2 flex-shrink-0"
              aria-label={`${file.name} 삭제`}
            >
              &times;
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
