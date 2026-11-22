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

/**
 * 숫자 칸 하나를 검사한다.
 *
 * 예전에는 `Number(v) || 0` 으로 바로 넘겼다 — "1o0" 같은 오타가 NaN 이 되고,
 * NaN 은 falsy 라 경고 없이 0 으로 저장됐다. 광고비 한 칸이 조용히 0이 되면
 * 그 달 리포트의 ROAS·CPC가 전부 틀어진다.
 */
function numberError(raw: string, label: string): string | null {
  if (raw.trim() === '') return null; // 빈 칸은 0 으로 본다
  const n = Number(raw);
  if (!Number.isFinite(n)) return `${label}에 숫자가 아닌 값이 들어 있습니다.`;
  if (n < 0) return `${label}는 0 이상이어야 합니다.`;
  return null;
}

export default function RowEditorModal({ mode, initialData, year, month, onClose, onSubmit }: Props) {
  const [form, setForm] = useState<StringForm>(toStringForm(initialData));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 문제가 있는 칸 옆에 직접 띄운다 — 폼 맨 아래 한 줄로는 어느 칸인지 알 수 없고,
  // 칸이 8개까지 늘어나면 메시지가 스크롤 밖으로 밀린다
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FormKey, string>>>({});

  const isKakao = form.campaign_type === KAKAO_TYPE;
  const fields = isKakao ? FIELDS_BASE : [...FIELDS_BASE, ...FIELDS_CONV];

  const minDate = year && month ? `${year}-${String(month).padStart(2, '0')}-01` : undefined;
  const maxDate = year && month
    ? `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`
    : undefined;

  function handleChange(key: FormKey, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    // 고치는 중에 빨간 테두리가 남아 있으면 이미 해결됐는지 알 수 없다
    setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const errors: Partial<Record<FormKey, string>> = {};
    if (!form.report_date) errors.report_date = '날짜를 입력해 주세요.';
    for (const f of fields) {
      const msg = numberError(form[f.key], f.label);
      if (msg) errors[f.key] = msg;
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setError(null);
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
          error={fieldErrors.report_date ?? null}
        />

        {fields.map((f) => (
          <Input
            key={f.key}
            label={f.label}
            type="number"
            value={form[f.key]}
            onChange={(e) => handleChange(f.key, e.target.value)}
            min="0"
            step={f.isFloat ? 'any' : '1'}
            className="tabular-nums"
            error={fieldErrors[f.key] ?? null}
          />
        ))}

        {error && <Alert>{error}</Alert>}
      </form>
    </Modal>
  );
}
