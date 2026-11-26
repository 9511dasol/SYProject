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
import { Input, Select, controlClassName } from '@/components/ui/Field';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/components/providers/ToastProvider';
import type { DevCompanyListResponse, DevUserCreatePayload, DevUserItem } from '@/types/dev';

type CreatableRole = DevUserCreatePayload['role'];

const ROLE_LABELS: Record<string, string> = {
  dev: '개발자',
  admin: '관리자',
  member: '사원',
  trial: '체험',
};

type PendingAction =
  | { kind: 'role'; user: DevUserItem; role: CreatableRole }
  | { kind: 'deactivate'; user: DevUserItem }
  | { kind: 'delete'; user: DevUserItem };

export default function DevUsersClient() {
  const queryClient = useQueryClient();
  const { toast: addToast } = useToast();

  const [companyId, setCompanyId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<{ email: string; password: string; name: string; role: CreatableRole }>(
    { email: '', password: '', name: '', role: 'member' },
  );
  const [createError, setCreateError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);

  const companiesQuery = useQuery({
    queryKey: queryKeys.devCompanies(),
    queryFn: () =>
      fetchJson<DevCompanyListResponse>('/api/dev/companies', undefined, '기업 목록 조회 실패'),
  });

  const usersQuery = useQuery({
    queryKey: queryKeys.devUsers(companyId),
    queryFn: () =>
      fetchJson<DevUserItem[]>(
        companyId === null ? '/api/dev/users' : `/api/dev/users?company_id=${companyId}`,
        undefined,
        '계정 조회 실패',
      ),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.allDevUsers() });
    queryClient.invalidateQueries({ queryKey: queryKeys.devCompanies() });
  };

  const onDone = (message: string) => {
    invalidate();
    setPending(null);
    addToast('success', message);
  };
  const onFail = (err: Error) => {
    setPending(null);
    addToast('error', err.message);
  };

  const roleMutation = useMutation({
    mutationFn: ({ user, role }: { user: DevUserItem; role: CreatableRole }) =>
      sendJson<DevUserItem>(`/api/dev/users/${user.id}/role`, 'PATCH', { role }, '권한 변경 실패'),
    onSuccess: (u) => onDone(`${u.email}의 권한을 ${ROLE_LABELS[u.role]}로 변경했습니다.`),
    onError: onFail,
  });

  const activeMutation = useMutation({
    mutationFn: (user: DevUserItem) =>
      sendJson<DevUserItem>(
        `/api/dev/users/${user.id}/active`,
        'PATCH',
        { is_active: !user.is_active },
        '계정 상태 변경 실패',
      ),
    onSuccess: (u) => onDone(`${u.email} 계정을 ${u.is_active ? '활성화' : '비활성화'}했습니다.`),
    onError: onFail,
  });

  const unlockMutation = useMutation({
    mutationFn: (user: DevUserItem) =>
      sendJson<DevUserItem>(`/api/dev/users/${user.id}/unlock`, 'PATCH', undefined, '잠금 해제 실패'),
    onSuccess: (u) => onDone(`${u.email} 계정의 로그인 잠금을 해제했습니다.`),
    onError: onFail,
  });

  const deleteMutation = useMutation({
    mutationFn: (user: DevUserItem) =>
      sendJson<{ message: string }>(`/api/dev/users/${user.id}`, 'DELETE', undefined, '계정 삭제 실패'),
    onSuccess: (res) => onDone(res.message),
    onError: onFail,
  });

  const createMutation = useMutation({
    mutationFn: (payload: DevUserCreatePayload) =>
      sendJson<DevUserItem>('/api/dev/users', 'POST', payload, '계정 생성 실패'),
    onSuccess: (u) => {
      invalidate();
      addToast('success', `${u.email} 계정을 생성했습니다.`);
      setCreateOpen(false);
    },
    onError: (err) => setCreateError(err.message),
  });

  const companies = companiesQuery.data?.items ?? [];
  const companyName = (id: number | null) =>
    id === null ? '무소속' : companies.find((c) => c.id === id)?.name ?? `기업 #${id}`;

  const isLocked = (user: DevUserItem) =>
    !!user.locked_until && new Date(user.locked_until) > new Date();

  const columns: Column<DevUserItem>[] = [
    { header: '이메일', primary: true, className: 'font-medium text-fg', cell: (u) => u.email },
    { header: '이름', cell: (u) => u.name || '-' },
    { header: '기업', cell: (u) => companyName(u.company_id ?? null) },
    {
      header: '권한',
      cell: (u) =>
        u.role === 'dev' ? (
          ROLE_LABELS.dev
        ) : (
          <select
            aria-label={`${u.email} 권한`}
            value={u.role}
            onChange={(e) =>
              e.target.value !== u.role &&
              setPending({ kind: 'role', user: u, role: e.target.value as CreatableRole })
            }
            className={`${controlClassName} w-auto px-2.5 py-1.5`}
          >
            <option value="member">{ROLE_LABELS.member}</option>
            <option value="admin">{ROLE_LABELS.admin}</option>
            <option value="trial">{ROLE_LABELS.trial}</option>
          </select>
        ),
    },
    {
      header: '상태',
      cell: (u) =>
        u.role === 'dev' ? (
          '—'
        ) : (
          <button
            type="button"
            role="switch"
            aria-checked={u.is_active}
            aria-label={`${u.email} 활성 상태`}
            onClick={() =>
              u.is_active ? setPending({ kind: 'deactivate', user: u }) : activeMutation.mutate(u)
            }
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors
              ${u.is_active ? 'bg-primary' : 'bg-surface-3'}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                ${u.is_active ? 'translate-x-6' : 'translate-x-1'}`}
            />
          </button>
        ),
    },
    { header: '가입일', className: 'text-fg-subtle whitespace-nowrap', cell: (u) => formatDate(u.created_at) },
    {
      header: '작업',
      align: 'right',
      cell: (u) =>
        u.role === 'dev' ? null : (
          <div className="flex justify-end gap-1">
            {isLocked(u) && (
              <Button variant="ghost" size="sm" onClick={() => unlockMutation.mutate(u)}>
                <i className="bx bx-lock-open-alt text-sm" />
                잠금 해제
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setPending({ kind: 'delete', user: u })}>
              <i className="bx bx-trash text-sm" />
              삭제
            </Button>
          </div>
        ),
    },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-fg">전체 계정 관리</h1>
          <p className="mt-1 text-sm text-fg-subtle">
            전 기업의 계정을 조회·관리합니다. dev 계정은 여기서 수정할 수 없습니다.
          </p>
        </div>
        <div className="flex gap-2">
          <select
            aria-label="기업 필터"
            value={companyId ?? ''}
            onChange={(e) => setCompanyId(e.target.value === '' ? null : Number(e.target.value))}
            className={`${controlClassName} w-auto px-2.5 py-1.5`}
          >
            <option value="">전체 기업</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Button
            onClick={() => {
              setForm({ email: '', password: '', name: '', role: 'member' });
              setCreateError(null);
              setCreateOpen(true);
            }}
          >
            <i className="bx bx-user-plus text-base" />
            계정 생성
          </Button>
        </div>
      </div>

      {usersQuery.error && <Alert>{usersQuery.error.message}</Alert>}

      <DataTable
        rows={usersQuery.data ?? null}
        rowKey={(u) => u.id}
        columns={columns}
        minWidth="min-w-200"
        empty={{ icon: 'bx-group', title: '등록된 계정이 없습니다.' }}
      />

      <ConfirmDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={() => {
          if (!pending) return;
          if (pending.kind === 'role') roleMutation.mutate({ user: pending.user, role: pending.role });
          else if (pending.kind === 'deactivate') activeMutation.mutate(pending.user);
          else deleteMutation.mutate(pending.user);
        }}
        busy={roleMutation.isPending || activeMutation.isPending || deleteMutation.isPending}
        title={
          pending?.kind === 'role' ? '권한 변경' : pending?.kind === 'deactivate' ? '계정 비활성화' : '계정 삭제'
        }
        icon={
          pending?.kind === 'role' ? 'bx-shield-quarter' : pending?.kind === 'deactivate' ? 'bx-lock' : 'bx-trash'
        }
        confirmLabel={
          pending?.kind === 'role' ? '변경' : pending?.kind === 'deactivate' ? '비활성화' : '삭제'
        }
        tone="danger"
        message={
          pending === null ? null : pending.kind === 'role' ? (
            <>
              {pending.user.email} 계정의 권한을 <strong>{ROLE_LABELS[pending.role]}</strong>로 변경합니다.
            </>
          ) : pending.kind === 'deactivate' ? (
            <>{pending.user.email} 계정을 비활성화합니다.</>
          ) : (
            <>{pending.user.email} 계정을 영구 삭제합니다.</>
          )
        }
        detail={
          pending?.kind === 'role'
            ? '기업당 관리자는 1명입니다 — 이미 있으면 거절됩니다.'
            : pending?.kind === 'deactivate'
              ? '이 계정은 즉시 로그인할 수 없게 됩니다. 스위치를 다시 켜면 복구됩니다.'
              : '되돌릴 수 없습니다. 계정만 삭제되고 데이터 이력은 남습니다.'
        }
      />

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="계정 생성" icon="bx-user-plus" busy={createMutation.isPending}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setCreateError(null);
            if (companyId === null) {
              setCreateError('먼저 상단에서 기업을 선택해 주세요.');
              return;
            }
            if (!form.email || !form.password) {
              setCreateError('이메일과 비밀번호를 입력해 주세요.');
              return;
            }
            if (form.password.length < 8) {
              setCreateError('비밀번호는 8자 이상이어야 합니다.');
              return;
            }
            createMutation.mutate({ company_id: companyId, ...form });
          }}
          className="space-y-4"
        >
          <p className="text-sm text-fg-subtle">
            소속 기업: <strong className="text-fg">{companyName(companyId)}</strong>
            {companyId === null && ' — 상단의 기업 필터에서 먼저 기업을 선택하세요.'}
          </p>
          <Input label="이름" type="text" value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          <Input label="이메일" type="email" required value={form.email} autoComplete="off"
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
          <Input label="비밀번호" type="password" required value={form.password} placeholder="8자 이상"
            autoComplete="new-password"
            onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} />
          <Select label="권한" value={form.role}
            onChange={(e) => setForm((p) => ({ ...p, role: e.target.value as CreatableRole }))}>
            <option value="member">{ROLE_LABELS.member}</option>
            <option value="admin">{ROLE_LABELS.admin}</option>
            <option value="trial">{ROLE_LABELS.trial}</option>
          </Select>
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
    </div>
  );
}
