'use client';

import { useState } from 'react';
import type { RowFormData } from '@/types/marketing';
import Alert from '@/components/ui/Alert';
import Button from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import Modal from '@/components/ui/Modal';

/** 푸터의 제출 버튼이 폼 밖에서 폼을 가리키기 위한 id */
const FORM_ID = 'row-editor-form';

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
    <Modal
      open
      onClose={onClose}
      busy={loading}
      size="sm"
      icon={mode === 'edit' ? 'bx-edit-alt' : 'bx-plus-circle'}
      title={`${mode === 'edit' ? '행 편집' : '행 추가'} · ${form.campaign_type}`}
      footer={
        <>
          <Button variant="outline" size="md" onClick={onClose} disabled={loading}>
            취소
          </Button>
          {/*
            제출 버튼이 폼 밖(푸터)에 있다 — 폼이 길어 스크롤되더라도 버튼은 항상
            보여야 하기 때문이다. form 속성으로 id를 가리키면 폼 밖에서도 제출된다.
          */}
          <Button type="submit" form={FORM_ID} size="md" isLoading={loading}>
            저장
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-3">
        <Input
          label="날짜"
          type="date"
          value={form.report_date}
          min={minDate}
          max={maxDate}
          onChange={(e) => handleChange('report_date', e.target.value)}
          disabled={mode === 'edit'}
          required
        />

        {fields.map((f) => (
          <Input
            key={f.key}
            label={f.label}
            type="number"
            value={form[f.key]}
            onChange={(e) => handleChange(f.key, e.target.value)}
            min="0"
            step="1"
            className="tabular-nums"
          />
        ))}

        {error && <Alert>{error}</Alert>}
      </form>
    </Modal>
  );
}
