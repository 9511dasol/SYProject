'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson, sendJson } from '@/lib/api/authFetch';
import { formatDate } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';
import Alert from '@/components/ui/Alert';
import Button from '@/components/ui/Button';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import DataTable, { type Column } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/Field';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/components/providers/ToastProvider';
import type {
  DevAdminIssuePayload,
  DevCompany,
  DevCompanyListResponse,
  DevTrialOut,
  DevUserItem,
} from '@/types/dev';

/** 확인을 기다리는 위험 액션 — 정지(접속 차단)와 체험 삭제(복구 불가)만 확인을 받는다. */
type PendingAction =
  | { kind: 'suspend'; company: DevCompany }
  | { kind: 'deleteTrial'; company: DevCompany };

const EMPTY_ADMIN_FORM: DevAdminIssuePayload = { email: '', password: '', name: '' };

export default function DevCompaniesClient() {
  const queryClient = useQueryClient();
  const { toast: addToast } = useToast();

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  const [adminTarget, setAdminTarget] = useState<DevCompany | null>(null);
  const [adminForm, setAdminForm] = useState<DevAdminIssuePayload>(EMPTY_ADMIN_FORM);
  const [adminError, setAdminError] = useState<string | null>(null);

  const [budgetTarget, setBudgetTarget] = useState<DevCompany | null>(null);
  const [budgetValue, setBudgetValue] = useState('');

  const [trialOpen, setTrialOpen] = useState(false);
  const [trialDays, setTrialDays] = useState('3');
  // 발급 결과 — 초기 비밀번호는 이 모달에서만 보인다 (서버는 해시만 저장)
  const [trialResult, setTrialResult] = useState<DevTrialOut | null>(null);

  const [extendTarget, setExtendTarget] = useState<DevCompany | null>(null);
  const [extendDays, setExtendDays] = useState('3');

  const [pending, setPending] = useState<PendingAction | null>(null);

  const companiesQuery = useQuery({
    queryKey: queryKeys.devCompanies(),
    queryFn: () =>
      fetchJson<DevCompanyListResponse>('/api/dev/companies', undefined, '기업 목록 조회 실패'),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.devCompanies() });

  const createMutation = useMutation({
    mutationFn: (name: string) =>
      sendJson<DevCompany>('/api/dev/companies', 'POST', { name }, '기업 생성 실패'),
    onSuccess: (created) => {
      invalidate();
      addToast('success', `기업 '${created.name}' 을 만들었습니다. admin 계정을 발급해 주세요.`);
      setCreateOpen(false);
      setCreateName('');
    },
    onError: (err) => setCreateError(err.message),
  });

  const activeMutation = useMutation({
    mutationFn: (company: DevCompany) =>
      sendJson<DevCompany>(
        `/api/dev/companies/${company.id}/active`,
        'PATCH',
        { is_active: !company.is_active },
        '기업 상태 변경 실패',
      ),
    onSuccess: (updated) => {
      invalidate();
      setPending(null);
      addToast('success', `'${updated.name}' 을 ${updated.is_active ? '재개' : '정지'}했습니다.`);
    },
    onError: (err) => {
      setPending(null);
      addToast('error', err.message);
    },
  });

  const adminMutation = useMutation({
    mutationFn: ({ companyId, payload }: { companyId: number; payload: DevAdminIssuePayload }) =>
      sendJson<DevUserItem>(`/api/dev/companies/${companyId}/admin`, 'POST', payload, 'admin 발급 실패'),
    onSuccess: (created) => {
      invalidate();
      addToast('success', `admin 계정 ${created.email} 을 발급했습니다.`);
      setAdminTarget(null);
    },
    onError: (err) => setAdminError(err.message),
  });

  const budgetMutation = useMutation({
    mutationFn: ({ companyId, budget }: { companyId: number; budget: number }) =>
      sendJson<DevCompany>(
        `/api/dev/companies/${companyId}/budget`,
        'PATCH',
        { monthly_token_budget: budget },
        '예산 설정 실패',
      ),
    onSuccess: (updated) => {
      invalidate();
      addToast(
        'success',
        updated.monthly_token_budget > 0
          ? `'${updated.name}' 월 예산을 ${updated.monthly_token_budget.toLocaleString()} 토큰으로 설정했습니다.`
          : `'${updated.name}' 월 예산 제한을 해제했습니다.`,
      );
      setBudgetTarget(null);
    },
    onError: (err) => addToast('error', err.message),
  });

  const trialMutation = useMutation({
    mutationFn: (days: number) =>
      sendJson<DevTrialOut>('/api/dev/trials', 'POST', { days }, '체험 발급 실패'),
    onSuccess: (result) => {
      invalidate();
      setTrialOpen(false);
      setTrialResult(result);
    },
    onError: (err) => addToast('error', err.message),
  });

  const extendMutation = useMutation({
    mutationFn: ({ companyId, days }: { companyId: number; days: number }) =>
      sendJson<DevCompany>(`/api/dev/trials/${companyId}`, 'PATCH', { days }, '체험 연장 실패'),
    onSuccess: (updated) => {
      invalidate();
      addToast('success', `'${updated.name}' 만료를 ${formatDate(updated.expires_at ?? '')} 로 연장했습니다.`);
      setExtendTarget(null);
    },
    onError: (err) => addToast('error', err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (company: DevCompany) =>
      sendJson<{ message: string }>(`/api/dev/companies/${company.id}`, 'DELETE', undefined, '체험 삭제 실패'),
    onSuccess: (res) => {
      invalidate();
      setPending(null);
      addToast('success', res.message);
    },
    onError: (err) => {
      setPending(null);
      addToast('error', err.message);
    },
  });

  const companies = companiesQuery.data?.items ?? null;

  const handleActiveToggle = (company: DevCompany) => {
    // 정지(접속 차단)만 확인을 받는다. 재개는 되돌리는 쪽이라 바로 보낸다.
    if (company.is_active) setPending({ kind: 'suspend', company });
    else activeMutation.mutate(company);
  };

  const columns: Column<DevCompany>[] = [
    {
      header: '기업',
      primary: true,
      className: 'font-medium text-fg',
      cell: (c) => (
        <div className="space-y-0.5">
          <div>
            {c.name}
            {c.is_trial && (
              <span className="ml-2 rounded px-1.5 py-0.5 text-[11px] font-semibold bg-primary-soft text-primary">
                체험
              </span>
            )}
          </div>
          {c.is_trial && c.expires_at && (
            <div className="text-xs font-normal text-fg-subtle">
              만료 {formatDate(c.expires_at)}
            </div>
          )}
        </div>
      ),
    },
    {
      header: '상태',
      cell: (c) => (
        <button
          type="button"
          role="switch"
          aria-checked={c.is_active}
          aria-label={`${c.name} 활성 상태`}
          onClick={() => handleActiveToggle(c)}
          disabled={activeMutation.isPending}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors
            ${c.is_active ? 'bg-primary' : 'bg-surface-3'}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform
              ${c.is_active ? 'translate-x-6' : 'translate-x-1'}`}
          />
        </button>
      ),
    },
    { header: '계정', cell: (c) => `${c.user_count}명` },
    {
      header: '관리자',
      cell: (c) =>
        c.admin_email ?? (
          c.is_trial ? '—' : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setAdminTarget(c);
                setAdminForm(EMPTY_ADMIN_FORM);
                setAdminError(null);
              }}
            >
              <i className="bx bx-user-plus text-sm" />
              발급
            </Button>
          )
        ),
    },
    {
      header: '이번 달 토큰',
      className: 'whitespace-nowrap',
      cell: (c) => (
        <span>
          {c.month_tokens_used.toLocaleString()}
          <span className="text-fg-subtle">
            {' / '}
            {c.monthly_token_budget > 0 ? c.monthly_token_budget.toLocaleString() : '무제한'}
          </span>
        </span>
      ),
    },
    {
      header: '작업',
      align: 'right',
      cell: (c) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setBudgetTarget(c);
              setBudgetValue(c.monthly_token_budget > 0 ? String(c.monthly_token_budget) : '');
            }}
          >
            예산
          </Button>
          {c.is_trial && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setExtendTarget(c);
                  setExtendDays('3');
                }}
              >
                연장
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPending({ kind: 'deleteTrial', company: c })}
              >
                삭제
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-fg">기업 · 체험 관리</h1>
          <p className="mt-1 text-sm text-fg-subtle">
            기업을 만들고 admin 을 발급합니다. 체험은 만료되면 데이터째 자동 삭제됩니다.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setTrialOpen(true);
              setTrialDays('3');
            }}
          >
            <i className="bx bx-time-five text-base" />
            체험 발급
          </Button>
          <Button
            onClick={() => {
              setCreateOpen(true);
              setCreateName('');
              setCreateError(null);
            }}
          >
            <i className="bx bx-building-house text-base" />
            기업 생성
          </Button>
        </div>
      </div>

      {companiesQuery.error && <Alert>{companiesQuery.error.message}</Alert>}

      <DataTable
        rows={companies}
        rowKey={(c) => c.id}
        columns={columns}
        minWidth="min-w-200"
        empty={{ icon: 'bx-buildings', title: '등록된 기업이 없습니다.' }}
      />

      <ConfirmDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={() => {
          if (!pending) return;
          if (pending.kind === 'suspend') activeMutation.mutate(pending.company);
          else deleteMutation.mutate(pending.company);
        }}
        busy={activeMutation.isPending || deleteMutation.isPending}
        title={pending?.kind === 'suspend' ? '기업 정지' : '체험 삭제'}
        icon={pending?.kind === 'suspend' ? 'bx-pause-circle' : 'bx-trash'}
        confirmLabel={pending?.kind === 'suspend' ? '정지' : '삭제'}
        tone="danger"
        message={
          pending === null ? null : pending.kind === 'suspend' ? (
            <>&apos;{pending.company.name}&apos; 기업을 정지합니다.</>
          ) : (
            <>체험 기업 &apos;{pending.company.name}&apos; 을 삭제합니다.</>
          )
        }
        detail={
          pending?.kind === 'suspend'
            ? '소속 계정 전원이 즉시 로그인할 수 없게 됩니다. 재개하면 복구됩니다.'
            : '계정과 샌드박스 데이터가 전부 삭제되며 되돌릴 수 없습니다.'
        }
      />

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="기업 생성" icon="bx-building-house" busy={createMutation.isPending}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!createName.trim()) {
              setCreateError('기업명을 입력해 주세요.');
              return;
            }
            createMutation.mutate(createName.trim());
          }}
          className="space-y-4"
        >
          <Input
            label="기업명"
            type="text"
            required
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder="예: 세연E&S"
          />
          {createError && <Alert>{createError}</Alert>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={createMutation.isPending}>
              취소
            </Button>
            <Button type="submit" isLoading={createMutation.isPending}>
              생성
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!adminTarget}
        onClose={() => setAdminTarget(null)}
        title={`admin 발급 — ${adminTarget?.name ?? ''}`}
        icon="bx-user-plus"
        busy={adminMutation.isPending}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!adminTarget) return;
            setAdminError(null);
            if (!adminForm.email || !adminForm.password) {
              setAdminError('이메일과 비밀번호를 입력해 주세요.');
              return;
            }
            if (adminForm.password.length < 8) {
              setAdminError('비밀번호는 8자 이상이어야 합니다.');
              return;
            }
            adminMutation.mutate({ companyId: adminTarget.id, payload: adminForm });
          }}
          className="space-y-4"
        >
          <Input
            label="이름"
            type="text"
            value={adminForm.name ?? ''}
            onChange={(e) => setAdminForm((prev) => ({ ...prev, name: e.target.value }))}
          />
          <Input
            label="이메일"
            type="email"
            required
            value={adminForm.email}
            onChange={(e) => setAdminForm((prev) => ({ ...prev, email: e.target.value }))}
            autoComplete="off"
          />
          <Input
            label="초기 비밀번호"
            type="password"
            required
            value={adminForm.password}
            onChange={(e) => setAdminForm((prev) => ({ ...prev, password: e.target.value }))}
            placeholder="8자 이상"
            autoComplete="new-password"
          />
          {adminError && <Alert>{adminError}</Alert>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setAdminTarget(null)} disabled={adminMutation.isPending}>
              취소
            </Button>
            <Button type="submit" isLoading={adminMutation.isPending}>
              발급
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!budgetTarget}
        onClose={() => setBudgetTarget(null)}
        title={`월 토큰 예산 — ${budgetTarget?.name ?? ''}`}
        icon="bx-coin-stack"
        busy={budgetMutation.isPending}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!budgetTarget) return;
            budgetMutation.mutate({
              companyId: budgetTarget.id,
              budget: Math.max(0, Number(budgetValue) || 0),
            });
          }}
          className="space-y-4"
        >
          <Input
            label="월간 토큰 예산"
            hint="0 또는 빈칸이면 제한하지 않습니다. 초과하면 그 기업의 AI 호출이 월말까지 차단됩니다."
            type="number"
            min={0}
            value={budgetValue}
            onChange={(e) => setBudgetValue(e.target.value)}
            placeholder="예: 500000"
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setBudgetTarget(null)} disabled={budgetMutation.isPending}>
              취소
            </Button>
            <Button type="submit" isLoading={budgetMutation.isPending}>
              저장
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={trialOpen} onClose={() => setTrialOpen(false)} title="체험 계정 발급" icon="bx-time-five" busy={trialMutation.isPending}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            trialMutation.mutate(Math.min(30, Math.max(1, Number(trialDays) || 3)));
          }}
          className="space-y-4"
        >
          <p className="text-sm text-fg-subtle">
            샘플 데이터가 담긴 샌드박스 기업과 체험 계정이 함께 만들어집니다. 실데이터에는
            접근할 수 없고, 만료되면 데이터째 자동 삭제됩니다.
          </p>
          <Input
            label="체험 기간 (일)"
            type="number"
            min={1}
            max={30}
            required
            value={trialDays}
            onChange={(e) => setTrialDays(e.target.value)}
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setTrialOpen(false)} disabled={trialMutation.isPending}>
              취소
            </Button>
            <Button type="submit" isLoading={trialMutation.isPending}>
              발급
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!trialResult}
        onClose={() => setTrialResult(null)}
        title="체험 계정 발급 완료"
        icon="bx-check-circle"
      >
        {trialResult && (
          <div className="space-y-4">
            <Alert tone="warn">
              초기 비밀번호는 지금만 보입니다 — 닫기 전에 예비 고객에게 전달하세요.
            </Alert>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-fg-subtle">기업</dt>
                <dd className="font-medium text-fg">{trialResult.company_name}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-fg-subtle">아이디</dt>
                <dd className="font-medium text-fg select-all">{trialResult.email}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-fg-subtle">초기 비밀번호</dt>
                <dd className="font-medium text-fg select-all">{trialResult.password}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-fg-subtle">만료</dt>
                <dd className="text-fg">{formatDate(trialResult.expires_at)}</dd>
              </div>
            </dl>
            <div className="flex justify-end pt-1">
              <Button onClick={() => setTrialResult(null)}>확인</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!extendTarget}
        onClose={() => setExtendTarget(null)}
        title={`체험 연장 — ${extendTarget?.name ?? ''}`}
        icon="bx-time-five"
        busy={extendMutation.isPending}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!extendTarget) return;
            extendMutation.mutate({
              companyId: extendTarget.id,
              days: Math.min(30, Math.max(1, Number(extendDays) || 3)),
            });
          }}
          className="space-y-4"
        >
          <Input
            label="지금부터 며칠 더"
            type="number"
            min={1}
            max={30}
            required
            value={extendDays}
            onChange={(e) => setExtendDays(e.target.value)}
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setExtendTarget(null)} disabled={extendMutation.isPending}>
              취소
            </Button>
            <Button type="submit" isLoading={extendMutation.isPending}>
              연장
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
