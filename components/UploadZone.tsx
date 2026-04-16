'use client';

import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';

interface UploadZoneProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
}

export default function UploadZone({ files, onFilesChange }: UploadZoneProps) {
  const onDrop = useCallback(
    (accepted: File[]) => {
      // 기존 파일에 추가 (중복 이름 제거)
      const existingNames = new Set(files.map((f) => f.name));
      const newFiles = accepted.filter((f) => !existingNames.has(f.name));
      onFilesChange([...files, ...newFiles]);
    },
    [files, onFilesChange]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/zip': ['.zip'],
      'application/x-zip-compressed': ['.zip'],
    },
    multiple: false,
  });

  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
        isDragActive
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-300 hover:border-gray-400 bg-gray-50'
      }`}
    >
      <input {...getInputProps()} />
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
