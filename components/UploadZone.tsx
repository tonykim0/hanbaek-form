'use client';

import { useRef, useState } from 'react';

interface UploadZoneProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
}

export default function UploadZone({ files, onFilesChange }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  const handleFiles = (selected: FileList | null) => {
    if (!selected || selected.length === 0) return;

    const accepted = Array.from(selected).filter((file) => (
      file.name.toLowerCase().endsWith('.zip')
      || file.type === 'application/zip'
      || file.type === 'application/x-zip-compressed'
      || file.type === 'application/octet-stream'
    ));

    if (accepted.length === 0) return;

    // 이 화면은 ZIP 1개 업로드만 지원하므로 최신 선택 파일로 교체합니다.
    const nextFile = accepted[accepted.length - 1];
    if (files[0]?.name === nextFile.name && files[0]?.size === nextFile.size) return;
    onFilesChange([nextFile]);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        setIsDragActive(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragActive(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setIsDragActive(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragActive(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
        isDragActive
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-300 hover:border-gray-400 bg-gray-50'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".zip,application/zip,application/x-zip-compressed,application/octet-stream"
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <div className="space-y-2">
        <div className="text-4xl text-gray-400">
          {isDragActive ? '\u{1F4E5}' : '\u{1F4C4}'}
        </div>
        {isDragActive ? (
          <p className="text-blue-600 font-medium">여기에 놓으세요</p>
        ) : (
          <>
            <p className="text-gray-700 font-medium">
              ZIP 파일을 드래그하거나 클릭하세요
            </p>
            <p className="text-sm text-gray-500">
              계약서류 전체를 ZIP으로 묶어서 올려주세요
            </p>
          </>
        )}
      </div>
    </div>
  );
}
