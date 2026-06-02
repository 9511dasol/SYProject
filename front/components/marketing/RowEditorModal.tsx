'use client';

import { useState } from 'react';
import type { RowFormData } from '@/types/marketing';

interface Props {
  mode: 'edit' | 'add';
  initialData: RowFormData;
  year?: number;
  month?: number;
  onClose: () => void;
  onSubmit: (data: RowFormData) => Promise<void>;
}

const KAKAO_TYPE = '카카오SA';

const FIELDS_BASE = [
  { key: 'impressions' as const, label: '노출수', isFloat: false },
  { key: 'clicks' as const, label: '클릭수', isFloat: false },
  { key: 'cost' as const, label: '광고비 (원)', isFloat: true },
];

const FIELDS_CONV = [
  { key: 'conversions' as const, label: '전환수', isFloat: false },
  { key: 'conversion_revenue' as const, label: '전환매출 (원)', isFloat: true },
  { key: 'signup' as const, label: '회원가입', isFloat: false },
  { key: 'purchase' as const, label: '구매완료', isFloat: false },
  { key: 'apply' as const, label: '신청', isFloat: false },
];

type FormKey = keyof RowFormData;
type StringForm = Record<FormKey, string>;

function toStringForm(data: RowFormData): StringForm {
  return {
    report_date: data.report_date,
    campaign_type: data.campaign_type,
    impressions: String(data.impressions),
    clicks: String(data.clicks),
    cost: String(data.cost),
    conversions: String(data.conversions),
    conversion_revenue: String(data.conversion_revenue),
    signup: String(data.signup),
    purchase: String(data.purchase),
    apply: String(data.apply),
  };
}

export default function RowEditorModal({ mode, initialData, year, month, onClose, onSubmit }: Props) {
  const [form, setForm] = useState<StringForm>(toStringForm(initialData));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isKakao = form.campaign_type === KAKAO_TYPE;
  const fields = isKakao ? FIELDS_BASE : [...FIELDS_BASE, ...FIELDS_CONV];

  const minDate = year && month ? `${year}-${String(month).padStart(2, '0')}-01` : undefined;
  const maxDate = year && month
    ? `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`
    : undefined;

  function handleChange(key: FormKey, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.report_date) {
      setError('날짜를 입력해 주세요.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data: RowFormData = {
        report_date: form.report_date,
        campaign_type: form.campaign_type,
        impressions: Math.round(Number(form.impressions) || 0),
        clicks: Math.round(Number(form.clicks) || 0),
        cost: Number(form.cost) || 0,
        conversions: Math.round(Number(form.conversions) || 0),
        conversion_revenue: Number(form.conversion_revenue) || 0,
        signup: Number(form.signup) || 0,
        purchase: Number(form.purchase) || 0,
        apply: Number(form.apply) || 0,
      };
      await onSubmit(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 실패');
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-400 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => { if (!loading) onClose(); }}
      />

      {/* Modal card */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">
              {mode === 'edit' ? '행 편집' : '행 추가'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">{form.campaign_type}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-40"
            aria-label="닫기"
          >
            <i className="bx bx-x text-xl" />
          </button>
        </div>

        {/* Form body */}
        <form id="row-editor-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {/* Date */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">날짜</label>
            <input
              type="date"
              value={form.report_date}
              min={minDate}
              max={maxDate}
              onChange={(e) => handleChange('report_date', e.target.value)}
              disabled={mode === 'edit'}
              required
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
            />
          </div>

          {/* Metric fields */}
          {fields.map((f) => (
            <div key={f.key}>
              <label className="block text-xs font-medium text-slate-500 mb-1">{f.label}</label>
              <input
                type="number"
                value={form[f.key]}
                onChange={(e) => handleChange(f.key, e.target.value)}
                min="0"
                step={f.isFloat ? '1' : '1'}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ))}

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2">
              <i className="bx bx-error-circle text-red-500 text-sm shrink-0" />
              <p className="text-xs text-red-600">{error}</p>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50/60 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-40"
          >
            취소
          </button>
          <button
            type="submit"
            form="row-editor-form"
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {loading && (
              <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            )}
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
