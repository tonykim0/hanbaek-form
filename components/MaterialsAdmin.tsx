'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  CATEGORY_KEYS,
  GROUP_KEYS,
  buildMaterialPath,
  categoryLabel,
  groupLabel,
  sanitizeFileName,
  type MaterialGroup,
} from '@/lib/materials-meta';

const PASSWORD_STORAGE_KEY = 'materials-admin-password';
/** 이 크기를 넘으면 분할 업로드 — 대용량 파일 실패 시 해당 조각만 재시도됩니다 */
const MULTIPART_THRESHOLD = 10 * 1024 * 1024;

interface Progress {
  fileName: string;
  percentage: number;
  done: boolean;
}

export default function MaterialsAdmin({ groups }: { groups: MaterialGroup[] }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [password, setPassword] = useState('');
  const [group, setGroup] = useState(GROUP_KEYS[1] ?? 'pluglink');
  const [category, setCategory] = useState('sales');
  const [progress, setProgress] = useState<Progress[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(
    null
  );

  // 새로고침해도 비밀번호를 다시 입력하지 않도록 (탭을 닫으면 지워집니다)
  useEffect(() => {
    const saved = sessionStorage.getItem(PASSWORD_STORAGE_KEY);
    if (saved) setPassword(saved);
  }, []);

  useEffect(() => {
    if (password) sessionStorage.setItem(PASSWORD_STORAGE_KEY, password);
  }, [password]);

  async function handleUpload() {
    const files = Array.from(fileInputRef.current?.files ?? []);
    if (!password) {
      setMessage({ kind: 'err', text: '관리자 비밀번호를 입력해주세요.' });
      return;
    }
    if (files.length === 0) {
      setMessage({ kind: 'err', text: '올릴 파일을 선택해주세요.' });
      return;
    }

    setBusy(true);
    setMessage(null);
    setProgress(files.map((f) => ({ fileName: f.name, percentage: 0, done: false })));

    try {
      const { put } = await import('@vercel/blob/client');

      for (const file of files) {
        const pathname = buildMaterialPath(group, category, file.name);

        const tokenRes = await fetch('/api/materials/upload-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password, pathname }),
        });
        const tokenData = (await tokenRes.json().catch(() => null)) as {
          token?: string;
          error?: string;
        } | null;

        if (!tokenRes.ok || !tokenData?.token) {
          throw new Error(tokenData?.error ?? '업로드 토큰 발급에 실패했습니다.');
        }

        await put(pathname, file, {
          access: 'public',
          token: tokenData.token,
          multipart: file.size > MULTIPART_THRESHOLD,
          onUploadProgress: ({ percentage }) => {
            setProgress((prev) =>
              prev.map((p) =>
                p.fileName === file.name
                  ? { ...p, percentage: Math.round(percentage) }
                  : p
              )
            );
          },
        });

        setProgress((prev) =>
          prev.map((p) =>
            p.fileName === file.name ? { ...p, percentage: 100, done: true } : p
          )
        );
      }

      setMessage({
        kind: 'ok',
        text: `${files.length}개 파일을 올렸습니다. 자료실에 바로 반영됩니다.`,
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      router.refresh();
    } catch (error) {
      setMessage({ kind: 'err', text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function handleRename(url: string, fileName: string) {
    if (!password) {
      setMessage({ kind: 'err', text: '관리자 비밀번호를 입력해주세요.' });
      return;
    }

    const nextName = window.prompt(
      '새 파일명을 입력하세요. 확장자는 빼도 됩니다.\n(이 이름이 자료실에 그대로 표시됩니다)',
      fileName
    );
    if (nextName === null) return;
    if (!nextName.trim() || nextName === fileName) return;

    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/materials/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, url, newFileName: nextName }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        pathname?: string;
      } | null;
      if (!res.ok) throw new Error(data?.error ?? '이름을 바꾸지 못했습니다.');

      setMessage({ kind: 'ok', text: '이름을 바꿨습니다.' });
      router.refresh();
    } catch (error) {
      setMessage({ kind: 'err', text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(url: string, title: string) {
    if (!password) {
      setMessage({ kind: 'err', text: '관리자 비밀번호를 입력해주세요.' });
      return;
    }
    if (!window.confirm(`「${title}」을(를) 삭제할까요? 되돌릴 수 없습니다.`)) return;

    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/materials/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, url }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? '삭제에 실패했습니다.');

      setMessage({ kind: 'ok', text: `「${title}」을(를) 삭제했습니다.` });
      router.refresh();
    } catch (error) {
      setMessage({ kind: 'err', text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const selectClass =
    'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-300';

  return (
    <div className="flex flex-col gap-6">
      <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-5">
        <h2 className="text-base font-bold text-gray-900 mb-4">자료 올리기</h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">
              운영사
            </span>
            <select
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              className={selectClass}
            >
              {GROUP_KEYS.map((key) => (
                <option key={key} value={key}>
                  {groupLabel(key)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">
              분류
            </span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={selectClass}
            >
              {CATEGORY_KEYS.map((key) => (
                <option key={key} value={key}>
                  {categoryLabel(key)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block mt-3">
          <span className="block text-xs font-semibold text-gray-600 mb-1">
            파일 (여러 개 선택 가능)
          </span>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100"
          />
          <span className="block text-xs text-gray-400 mt-1">
            파일명이 그대로 자료명이 됩니다. 같은 이름으로 다시 올리면 교체됩니다.
          </span>
        </label>

        <label className="block mt-3">
          <span className="block text-xs font-semibold text-gray-600 mb-1">
            관리자 비밀번호
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호"
            className={selectClass}
          />
        </label>

        <button
          type="button"
          onClick={handleUpload}
          disabled={busy}
          className="mt-4 w-full sm:w-auto bg-brand-600 hover:bg-brand-700 disabled:bg-gray-400 text-white font-semibold px-6 py-2.5 rounded-lg shadow-sm transition"
        >
          {busy ? '올리는 중…' : '자료 올리기'}
        </button>

        {progress.length > 0 && (
          <ul className="mt-4 flex flex-col gap-2">
            {progress.map((p) => (
              <li key={p.fileName} className="text-xs">
                <div className="flex justify-between gap-2 mb-1">
                  <span className="text-gray-600 truncate">{p.fileName}</span>
                  <span className="text-gray-400 tabular-nums flex-none">
                    {p.done ? '완료' : `${p.percentage}%`}
                  </span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded overflow-hidden">
                  <div
                    className={`h-full ${p.done ? 'bg-brand-500' : 'bg-brand-300'}`}
                    style={{ width: `${p.percentage}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}

        {message && (
          <p
            className={`mt-3 text-sm ${
              message.kind === 'ok' ? 'text-brand-700' : 'text-red-600 font-medium'
            }`}
          >
            {message.kind === 'ok' ? '✅ ' : '⚠️ '}
            {message.text}
          </p>
        )}
      </section>

      <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-5">
        <h2 className="text-base font-bold text-gray-900 mb-1">올라간 자료</h2>
        <p className="text-xs text-gray-400 mb-4">
          삭제하려면 비밀번호를 입력한 상태에서 삭제를 누르세요.
        </p>

        {groups.length === 0 ? (
          <p className="text-sm text-gray-500">아직 올라간 자료가 없습니다.</p>
        ) : (
          <div className="flex flex-col gap-5">
            {groups.map((g) => (
              <div key={g.key}>
                <h3 className="text-sm font-bold text-gray-900 mb-2">
                  {g.label}{' '}
                  <span className="text-xs font-normal text-gray-400">
                    {g.fileCount}개
                  </span>
                </h3>
                {g.categories.map((c) => (
                  <div key={c.key} className="mb-2">
                    <p className="text-xs font-semibold text-brand-700 bg-brand-50 rounded px-2 py-0.5 inline-block mb-1">
                      {c.label}
                    </p>
                    <ul className="divide-y divide-gray-100">
                      {c.files.map((f) => (
                        <li
                          key={f.pathname}
                          className="flex items-center justify-between gap-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="text-sm text-gray-900 break-keep leading-snug">
                              {f.title}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {[
                                f.ext,
                                f.size,
                                f.docDate ? `문서일 ${f.docDate}` : f.uploaded,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                            <p className="text-tiny text-gray-300 mt-0.5 truncate">
                              {f.fileName}
                            </p>
                          </div>
                          <div className="flex-none flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleRename(f.url, f.fileName)}
                              disabled={busy}
                              className="text-xs font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 disabled:opacity-40 rounded-lg px-3 py-1.5 transition"
                            >
                              이름 바꾸기
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(f.url, f.title)}
                              disabled={busy}
                              className="text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-40 rounded-lg px-3 py-1.5 transition"
                            >
                              삭제
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="text-xs text-gray-400">
        저장 경로: <code className="bg-gray-100 rounded px-1.5 py-0.5">
          materials/{group}/{category}/{sanitizeFileName('파일명.pdf')}
        </code>
      </p>
    </div>
  );
}
