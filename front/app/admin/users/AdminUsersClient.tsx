'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson, sendJson } from '@/lib/api/authFetch';
import { formatDate } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';
import Alert from '@/components/ui/Alert';
import Button from '@/components/ui/Button';
import DataTable, { type Column } from '@/components/ui/DataTable';
import { Input, Select, controlClassName } from '@/components/ui/Field';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/components/providers/ToastProvider';
import type {
  AdminUserCreatePayload,
  AdminUserItem,
  AdminUserPasswordResetPayload,
  AdminUserProfileUpdatePayload,
} from '@/types/adminUsers';
import type { UserRole } from '@/types/auth';

const ROLE_LABELS: Record<UserRole, string> = {
  user: '일반',
  admin: '관리자',
};

const EMPTY_FORM: AdminUserCreatePayload = { email: '', password: '', name: '', role: 'user' };

export default function AdminUsersClient() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { toast: addToast } = useToast();

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<AdminUserCreatePayload>(EMPTY_FORM);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editTarget, setEditTarget] = useState<AdminUserItem | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; email: string; newPassword: string }>({
    name: '',
    email: '',
    newPassword: '',
  });
  const [editError, setEditError] = useState<string | null>(null);

  // 자기 자신의 권한·활성 상태는 바꿀 수 없게 막는 데 쓴다
  const currentUserId = session?.user.id;

  const usersQuery = useQuery({
    queryKey: queryKeys.adminUsers(),
    queryFn: () => fetchJson<AdminUserItem[]>('/api/admin/users', undefined, '계정 조회 실패'),
  });

  /** 목록의 한 계정을 서버가 돌려준 값으로 교체한다 */
  const replaceUser = (updated: AdminUserItem) => {
    queryClient.setQueryData<AdminUserItem[]>(queryKeys.adminUsers(), (prev) =>
      prev?.map((u) => (u.id === updated.id ? updated : u)),
    );
  };

  const roleMutation = useMutation({
    mutationFn: ({ user, role }: { user: AdminUserItem; role: UserRole }) =>
      sendJson<AdminUserItem>(`/api/admin/users/${user.id}/role`, 'PATCH', { role }, '권한 변경 실패'),
    onSuccess: (updated) => {
      replaceUser(updated);
      addToast('success', `${updated.email}의 권한을 ${ROLE_LABELS[updated.role]}로 변경했습니다.`);
    },
    onError: (err) => addToast('error', err.message),
  });

  const activeMutation = useMutation({
    mutationFn: (user: AdminUserItem) =>
      sendJson<AdminUserItem>(
        `/api/admin/users/${user.id}/active`,
        'PATCH',
        { is_active: !user.is_active },
        '계정 상태 변경 실패',
      ),
    onSuccess: (updated) => {
      replaceUser(updated);
      addToast('success', `${updated.email} 계정을 ${updated.is_active ? '활성화' : '비활성화'}했습니다.`);
    },
    onError: (err) => addToast('error', err.message),
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, name, email, newPassword }: {
      id: number;
      name: string;
      email: string;
      newPassword: string;
    }) => {
      const profilePayload: AdminUserProfileUpdatePayload = { name, email };
      const updated = await sendJson<AdminUserItem>(
        `/api/admin/users/${id}/profile`,
        'PATCH',
        profilePayload,
        '계정 정보 변경 실패',
      );

      if (newPassword) {
        const pwPayload: AdminUserPasswordResetPayload = { new_password: newPassword };
        await sendJson(`/api/admin/users/${id}/reset-password`, 'POST', pwPayload, '비밀번호 재설정 실패');
      }
      return { updated, passwordChanged: Boolean(newPassword) };
    },
    onSuccess: ({ updated, passwordChanged }) => {
      replaceUser(updated);
      addToast(
        'success',
        passwordChanged
          ? `${updated.email} 계정 정보와 비밀번호를 변경했습니다.`
          : `${updated.email} 계정 정보를 변경했습니다.`,
      );
      setEditTarget(null);
    },
    onError: (err) => setEditError(err.message),
  });

  const createMutation = useMutation({
    mutationFn: (payload: AdminUserCreatePayload) =>
      sendJson<AdminUserItem>('/api/admin/users', 'POST', payload, '계정 생성 실패'),
    onSuccess: (created) => {
      queryClient.setQueryData<AdminUserItem[]>(queryKeys.adminUsers(), (prev) =>
        prev ? [...prev, created] : [created],
      );
      addToast('success', `${created.email} 계정을 생성했습니다.`);
      setForm(EMPTY_FORM);
      setCreateOpen(false);
    },
    onError: (err) => setCreateError(err.message),
  });

  const users = usersQuery.data ?? null;
  const error = usersQuery.error;
  // 어떤 계정의 행이 지금 갱신 중인지 — 그 행의 컨트롤만 잠근다
  const updatingId = roleMutation.isPending
    ? roleMutation.variables.user.id
    : activeMutation.isPending
      ? activeMutation.variables.id
      : null;

  const handleRoleChange = (user: AdminUserItem, role: UserRole) => {
    if (role === user.role) return;
    roleMutation.mutate({ user, role });
  };

  const handleEditOpen = (user: AdminUserItem) => {
    setEditTarget(user);
    setEditForm({ name: user.name, email: user.email, newPassword: '' });
    setEditError(null);
  };

  const handleEditSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setEditError(null);

    if (!editForm.email) {
      setEditError('이메일을 입력해주세요.');
      return;
    }
    if (editForm.newPassword && editForm.newPassword.length < 8) {
      setEditError('새 비밀번호는 8자 이상이어야 합니다.');
      return;
    }
    editMutation.mutate({ id: editTarget.id, ...editForm });
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (!form.email || !form.password) {
      setCreateError('이메일과 비밀번호를 입력해주세요.');
      return;
    }
    if (form.password.length < 8) {
      setCreateError('비밀번호는 8자 이상이어야 합니다.');
      return;
    }
    createMutation.mutate(form);
  };

  const columns: Column<AdminUserItem>[] = [
    {
      header: '이메일',
      primary: true,
      className: 'font-medium text-fg',
      cell: (user) => (
        <>
          {user.email}
          {currentUserId === String(user.id) && (
            <span className="ml-2 text-xs font-normal text-fg-subtle">(나)</span>
          )}
        </>
      ),
    },
    {
      header: '이름',
      cell: (user) => user.name || '-',
    },
    {
      header: '권한',
      cell: (user) => (
        <select
          aria-label={`${user.email} 권한`}
          value={user.role}
          disabled={currentUserId === String(user.id) || updatingId === user.id}
          onChange={(e) => handleRoleChange(user, e.target.value as UserRole)}
          className={`${controlClassName} w-auto px-2.5 py-1.5`}
        >
          <option value="user">{ROLE_LABELS.user}</option>
          <option value="admin">{ROLE_LABELS.admin}</option>
        </select>
      ),
    },
    {
      header: '상태',
      cell: (user) => (
        <button
          type="button"
          role="switch"
          aria-checked={user.is_active}
          aria-label={`${user.email} 활성 상태`}
          disabled={currentUserId === String(user.id) || updatingId === user.id}
          onClick={() => activeMutation.mutate(user)}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface
            ${user.is_active ? 'bg-primary' : 'bg-surface-3'}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform
              ${user.is_active ? 'translate-x-6' : 'translate-x-1'}`}
          />
        </button>
      ),
    },
    {
      header: '가입일',
      className: 'text-fg-subtle whitespace-nowrap',
      cell: (user) => formatDate(user.created_at),
    },
    {
      header: '작업',
      align: 'right',
      cell: (user) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleEditOpen(user)}
          disabled={updatingId === user.id}
        >
          <i className="bx bx-edit-alt text-sm" />
          편집
        </Button>
      ),
    },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-fg">사용자 관리</h1>
          <p className="mt-1 text-sm text-fg-subtle">
            계정 목록을 조회하고 권한 · 활성 상태를 관리합니다.
          </p>
        </div>
        <Button
          onClick={() => {
            setForm(EMPTY_FORM);
            setCreateError(null);
            setCreateOpen(true);
          }}
        >
          <i className="bx bx-user-plus text-base" />
          계정 생성
        </Button>
      </div>

      {error && <Alert>{error.message}</Alert>}

      <DataTable
        rows={users}
        rowKey={(user) => user.id}
        columns={columns}
        minWidth="min-w-160"
        empty={{ icon: 'bx-group', title: '등록된 계정이 없습니다.' }}
      />

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="계정 생성" icon="bx-user-plus" busy={createMutation.isPending}>
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="이름"
            type="text"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="홍길동"
          />
          <Input
            label="이메일"
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            placeholder="user@example.com"
            autoComplete="off"
          />
          <Input
            label="비밀번호"
            type="password"
            required
            value={form.password}
            onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
            placeholder="8자 이상"
            autoComplete="new-password"
          />
          <Select
            label="권한"
            value={form.role}
            onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value as UserRole }))}
          >
            <option value="user">{ROLE_LABELS.user}</option>
            <option value="admin">{ROLE_LABELS.admin}</option>
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

      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="계정 정보 수정" icon="bx-edit-alt" busy={editMutation.isPending}>
        <form onSubmit={handleEditSave} className="space-y-4">
          <Input
            label="이름"
            type="text"
            value={editForm.name}
            onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="홍길동"
          />
          <Input
            label="이메일"
            type="email"
            required
            value={editForm.email}
            onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))}
            placeholder="user@example.com"
            autoComplete="off"
          />
          <Input
            label="새 비밀번호"
            hint="변경할 때만 입력하세요. 비워두면 기존 비밀번호가 유지됩니다."
            type="password"
            value={editForm.newPassword}
            onChange={(e) => setEditForm((prev) => ({ ...prev, newPassword: e.target.value }))}
            placeholder="8자 이상"
            autoComplete="new-password"
          />

          {editError && <Alert>{editError}</Alert>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setEditTarget(null)} disabled={editMutation.isPending}>
              취소
            </Button>
            <Button type="submit" isLoading={editMutation.isPending}>
              저장
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
