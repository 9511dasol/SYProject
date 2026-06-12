'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import ToastContainer, { type ToastItem } from '@/components/ui/Toast';
import type { AdminUserCreatePayload, AdminUserItem } from '@/types/adminUsers';
import type { UserRole } from '@/types/auth';

const ROLE_LABELS: Record<UserRole, string> = {
  user: '일반',
  admin: '관리자',
};

const INPUT_CLASS =
  'w-full rounded-xl border border-slate-200 dark:border-border px-3.5 py-2.5 text-sm text-slate-700 dark:text-fg bg-white dark:bg-surface-2 placeholder:text-slate-400 dark:placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 transition-shadow';

const EMPTY_FORM: AdminUserCreatePayload = { email: '', password: '', name: '', role: 'user' };

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export default function AdminUsersClient() {
  const { data: session, status } = useSession();
  const [users, setUsers] = useState<AdminUserItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<AdminUserCreatePayload>(EMPTY_FORM);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const isAdmin = status === 'authenticated' && session?.user.role === 'admin';
  const currentUserId = session?.user.id;

  const addToast = useCallback((type: ToastItem['type'], message: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, type, message }]);
  }, []);
  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    if (!isAdmin) return;

    fetch('/api/admin/users')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? '계정 조회 실패');
        return data as AdminUserItem[];
      })
      .then(setUsers)
      .catch((err) => setError(err instanceof Error ? err.message : '계정 조회 실패'));
  }, [isAdmin]);

  const handleRoleChange = async (user: AdminUserItem, role: UserRole) => {
    if (role === user.role) return;
    setUpdatingId(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? '권한 변경 실패');
      const updated = data as AdminUserItem;
      setUsers((prev) => prev?.map((u) => (u.id === updated.id ? updated : u)) ?? prev);
      addToast('success', `${updated.email}의 권한을 ${ROLE_LABELS[updated.role]}로 변경했습니다.`);
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : '권한 변경 실패');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleActiveToggle = async (user: AdminUserItem) => {
    setUpdatingId(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/active`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !user.is_active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? '계정 상태 변경 실패');
      const updated = data as AdminUserItem;
      setUsers((prev) => prev?.map((u) => (u.id === updated.id ? updated : u)) ?? prev);
      addToast('success', `${updated.email} 계정을 ${updated.is_active ? '활성화' : '비활성화'}했습니다.`);
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : '계정 상태 변경 실패');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
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

    setCreating(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? '계정 생성 실패');
      const created = data as AdminUserItem;
      setUsers((prev) => (prev ? [...prev, created] : [created]));
      addToast('success', `${created.email} 계정을 생성했습니다.`);
      setForm(EMPTY_FORM);
      setCreateOpen(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : '계정 생성 실패');
    } finally {
      setCreating(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 min-h-[60vh] px-6 text-center">
        <i className="bx bx-lock-alt text-3xl text-fg-subtle" />
        <h2 className="text-lg font-bold text-fg">접근 권한이 없습니다</h2>
        <p className="text-sm text-fg-subtle">관리자만 접근할 수 있는 페이지입니다.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between gap-4">
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

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700
          dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {!users ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-160 text-sm">
            <thead>
              <tr className="border-b border-border-soft text-left text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                <th className="px-4 py-3">이메일</th>
                <th className="px-4 py-3">이름</th>
                <th className="px-4 py-3">권한</th>
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3">가입일</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((user) => {
                const isSelf = currentUserId === String(user.id);
                const isUpdating = updatingId === user.id;
                return (
                  <tr key={user.id}>
                    <td className="px-4 py-3 font-medium text-fg">
                      {user.email}
                      {isSelf && <span className="ml-2 text-xs font-normal text-fg-subtle">(나)</span>}
                    </td>
                    <td className="px-4 py-3 text-fg-muted">{user.name || '-'}</td>
                    <td className="px-4 py-3">
                      <select
                        value={user.role}
                        disabled={isSelf || isUpdating}
                        onChange={(e) => handleRoleChange(user, e.target.value as UserRole)}
                        className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-fg
                          focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <option value="user">{ROLE_LABELS.user}</option>
                        <option value="admin">{ROLE_LABELS.admin}</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={user.is_active}
                        aria-label={`${user.email} 활성 상태`}
                        disabled={isSelf || isUpdating}
                        onClick={() => handleActiveToggle(user)}
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                          ${user.is_active ? 'bg-primary' : 'bg-surface-3'}`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                            ${user.is_active ? 'translate-x-6' : 'translate-x-1'}`}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-fg-subtle">{formatDate(user.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="계정 생성" icon="bx-user-plus">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 dark:text-fg-muted">이름</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="홍길동"
              className={INPUT_CLASS}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 dark:text-fg-muted">이메일</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              placeholder="user@example.com"
              autoComplete="off"
              className={INPUT_CLASS}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 dark:text-fg-muted">비밀번호</label>
            <input
              type="password"
              required
              value={form.password}
              onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
              placeholder="8자 이상"
              autoComplete="new-password"
              className={INPUT_CLASS}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 dark:text-fg-muted">권한</label>
            <select
              value={form.role}
              onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value as UserRole }))}
              className={INPUT_CLASS}
            >
              <option value="user">{ROLE_LABELS.user}</option>
              <option value="admin">{ROLE_LABELS.admin}</option>
            </select>
          </div>

          {createError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700
              dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400">
              {createError}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              취소
            </Button>
            <Button type="submit" isLoading={creating}>
              생성
            </Button>
          </div>
        </form>
      </Modal>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
