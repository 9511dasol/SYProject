'use client';

import { ChangeEvent, useRef } from 'react';

interface FileInputProps {
  id: string;
  label: string;
  icon: string;
  files: File[];
  onChange: (files: File[]) => void;
}

export default function FileInput({ id, label, icon, files, onChange }: FileInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(e.target.files ?? []);
    const merged = [...files];
    for (const f of incoming) {
      const isDuplicate = merged.some((ex) => ex.name === f.name && ex.size === f.size);
      if (!isDuplicate) merged.push(f);
    }
    onChange(merged);
    if (inputRef.current) inputRef.current.value = '';
  }

  function remove(index: number) {
    onChange(files.filter((_, i) => i !== index));
  }

  const hasFiles = files.length > 0;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-sm font-medium text-slate-700">
          {label}
        </label>
        {hasFiles && (
          <span className="text-xs text-blue-600 font-medium">{files.length}개 선택됨</span>
        )}
      </div>

      <div
        className={`rounded-xl border-2 border-dashed transition-colors overflow-hidden
          ${hasFiles ? 'border-blue-200 bg-blue-50/30' : 'border-slate-200 bg-slate-50'}
        `}
      >
        {hasFiles && (
          <ul className="px-4 pt-3 pb-1 flex flex-col gap-2">
            {files.map((file, i) => (
              <li key={`${file.name}-${i}`} className="flex items-center gap-2 min-w-0">
                <i className="bx bx-file-blank text-blue-400 text-base shrink-0" />
                <span className="flex-1 truncate text-sm text-slate-700">{file.name}</span>
                <span className="text-xs text-slate-400 shrink-0 tabular-nums">
                  {(file.size / 1024).toFixed(1)} KB
                </span>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="shrink-0 text-slate-300 hover:text-red-400 transition-colors"
                  aria-label={`${file.name} 제거`}
                >
                  <i className="bx bx-x text-lg" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          id={id}
          onClick={() => inputRef.current?.click()}
          className={`flex items-center gap-2 w-full px-4 py-3.5 text-sm transition-colors
            ${hasFiles
              ? 'text-blue-600 hover:bg-blue-50 border-t border-blue-100'
              : 'text-slate-400 hover:text-blue-500 hover:bg-blue-50/40'
            }
          `}
        >
          <i className={`bx ${hasFiles ? 'bx-plus-circle' : icon} text-lg`} />
          <span>{hasFiles ? '파일 추가' : 'CSV 파일 선택 (여러 개 가능)'}</span>
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        multiple
        className="sr-only"
        onChange={handleChange}
        aria-hidden="true"
      />
    </div>
  );
}
