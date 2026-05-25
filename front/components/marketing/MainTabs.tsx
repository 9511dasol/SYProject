'use client';

import { useState } from 'react';
import UploadForm from '@/components/marketing/UploadForm';
import ExcelUploadPanel from '@/components/marketing/ExcelUploadPanel';
import type { ExcelReport } from '@/types/marketing';

const TABS = [
  { id: 'csv', label: 'CSV 분석', icon: 'bx-upload' },
  { id: 'excel', label: 'Excel 불러오기', icon: 'bx-file-find' },
] as const;

type TabId = (typeof TABS)[number]['id'];

interface MainTabsProps {
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
  onRequestLoad?: (file: File, fileName: string) => void;
}

export default function MainTabs({ onSuccess, onError, onRequestLoad }: MainTabsProps = {}) {
  const [active, setActive] = useState<TabId>('csv');

  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label="업로드 방식"
        className="flex gap-1 p-1 rounded-xl bg-slate-100/80 border border-slate-200/60 w-full sm:w-auto sm:inline-flex"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active === tab.id}
            onClick={() => setActive(tab.id)}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              active === tab.id
                ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <i className={`bx ${tab.icon} text-base`} />
            {tab.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {active === 'csv' && <UploadForm onSuccess={onSuccess} onError={onError} />}
        {active === 'excel' && (
          <ExcelUploadPanel onSuccess={onSuccess} onError={onError} onRequestLoad={onRequestLoad} />
        )}
      </div>
    </div>
  );
}
