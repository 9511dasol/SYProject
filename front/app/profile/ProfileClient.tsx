'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import ToastContainer, { type ToastItem } from '@/components/ui/Toast';
import type { PasswordChangePayload, ProfileUpdatePayload, UserProfile, UserRole } from '@/types/auth';

const ROLE_LABELS: Record<UserRole, string> = {
  user: '일반 사용자',
  admin: '관리자',
};

const ROLE_BADGE_STYLES: Record<UserRole, string> = {
  user: 'bg-surface-2 text-fg-muted',
  admin: 'bg-primary-soft text-primary',
};

const INPUT_CLASS =
  'w-full rounded-xl border border-slate-200 dark:border-border px-3.5 py-2.5 text-sm text-slate-700 dark:text-fg bg-white dark:bg-surface-2 placeholder:text-slate-400 dark:placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 transition-shadow disabled:opacity-60';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export default function ProfileClient() {
  const { update } = useSession();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // ── 프로필 정보 폼 ────────────────────────────────────────────────────────────
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileTouched, setProfileTouched] = useState(false);

  // ── 비밀번호 변경 폼 ──────────────────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordTouched, setPasswordTouched] = useState(false);

  const addToast = useCallback((type: ToastItem['type'], message: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, type, message }]);
  }, []);
  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    fetch('/api/users/me')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? '프로필 조회 실패');
        return data as UserProfile;
      })
      .then((data) => {
        setProfile(data);
        setName(data.name);
        setEmail(data.email);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : '프로필 조회 실패'));
  }, []);

  // ── 실시간 유효성 검사 ────────────────────────────────────────────────────────
  const nameValid = name.trim().length > 0;
  const emailValid = EMAIL_REGEX.test(email);
  const profileDirty = !!profile && (name !== profile.name || email !== profile.email);

  const passwordLengthValid = newPassword.length >= 8;
  const passwordMatch = newPassword.length > 0 && newPassword === confirmPassword;

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileTouched(true);
    setProfileError(null);

    if (!nameValid) {
      setProfileError('이름을 입력해주세요.');
      return;
    }
    if (!emailValid) {
      setProfileError('올바른 이메일 형식이 아닙니다.');
      return;
    }
    if (!profile || !profileDirty) return;

    const payload: ProfileUpdatePayload = {};
    if (name !== profile.name) payload.name = name;
    if (email !== profile.email) payload.email = email;

    setSavingProfile(true);
    try {
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? '프로필 수정 실패');

      const updated = data as UserProfile;
      setProfile(updated);
      setName(updated.name);
      setEmail(updated.email);
      setProfileTouched(false);
      await update({ name: updated.name, email: updated.email });
      addToast('success', '프로필 정보를 수정했습니다.');
    } catch (err) {
      const message = err instanceof Error ? err.message : '프로필 수정 실패';
      setProfileError(message);
      addToast('error', message);
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordTouched(true);
    setPasswordError(null);

    if (!currentPassword) {
      setPasswordError('현재 비밀번호를 입력해주세요.');
      return;
    }
    if (!passwordLengthValid) {
      setPasswordError('새 비밀번호는 8자 이상이어야 합니다.');
      return;
    }
    if (!passwordMatch) {
      setPasswordError('새 비밀번호가 일치하지 않습니다.');
      return;
    }

    setChangingPassword(true);
    try {
      const payload: PasswordChangePayload = {
        current_password: currentPassword,
        new_password: newPassword,
      };
      const res = await fetch('/api/users/me/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message ?? '비밀번호 변경 실패');
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordTouched(false);
      addToast('success', '비밀번호를 변경했습니다.');
    } catch (err) {
      const message = err instanceof Error ? err.message : '비밀번호 변경 실패';
      setPasswordError(message);
      addToast('error', message);
    } finally {
      setChangingPassword(false);
    }
  };

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 min-h-[60vh] px-6 text-center">
        <i className="bx bx-error-circle text-3xl text-fg-subtle" />
        <h2 className="text-lg font-bold text-fg">프로필을 불러올 수 없습니다</h2>
        <p className="text-sm text-fg-subtle">{loadError}</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-fg">프로필 설정</h1>
        <p className="mt-1 text-sm text-fg-subtle">계정 정보를 확인하고 이메일 · 비밀번호를 변경할 수 있습니다.</p>
      </div>

      {/* 계정 정보 요약 */}
      <section className="rounded-xl border border-border bg-surface p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-fg">계정 정보</h2>
          <span className={`text-xs font-bold px-2 py-1 rounded-md ${ROLE_BADGE_STYLES[profile.role]}`}>
            {ROLE_LABELS[profile.role]}
          </span>
        </div>
        <dl className="text-sm space-y-1.5">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-fg-subtle">가입일</dt>
            <dd className="text-fg font-medium">{formatDate(profile.created_at)}</dd>
          </div>
        </dl>
      </section>

      {/* 프로필 정보 수정 */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-fg mb-4">프로필 정보</h2>
        <form onSubmit={handleProfileSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 dark:text-fg-muted">이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="이름"
              className={INPUT_CLASS}
            />
            {profileTouched && !nameValid && (
              <p className="text-xs text-red-600 dark:text-red-400">이름을 입력해주세요.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 dark:text-fg-muted">이메일</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className={INPUT_CLASS}
            />
            {profileTouched && !emailValid && (
              <p className="text-xs text-red-600 dark:text-red-400">올바른 이메일 형식이 아닙니다.</p>
            )}
            {email !== profile.email && emailValid && (
              <p className="text-xs text-fg-subtle">이메일을 변경하면 다음 로그인부터 새 이메일을 사용합니다.</p>
            )}
          </div>

          {profileError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700
              dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400">
              {profileError}
            </div>
          )}

          <div className="flex justify-end">
            <Button type="submit" isLoading={savingProfile} disabled={!profileDirty}>
              저장
            </Button>
          </div>
        </form>
      </section>

      {/* 비밀번호 변경 */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-fg mb-4">비밀번호 변경</h2>
        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 dark:text-fg-muted">현재 비밀번호</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="현재 비밀번호"
              autoComplete="current-password"
              className={INPUT_CLASS}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 dark:text-fg-muted">새 비밀번호</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="8자 이상"
              autoComplete="new-password"
              className={INPUT_CLASS}
            />
            {passwordTouched && newPassword.length > 0 && !passwordLengthValid && (
              <p className="text-xs text-red-600 dark:text-red-400">새 비밀번호는 8자 이상이어야 합니다.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 dark:text-fg-muted">새 비밀번호 확인</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="새 비밀번호 확인"
              autoComplete="new-password"
              className={INPUT_CLASS}
            />
            {passwordTouched && confirmPassword.length > 0 && !passwordMatch && (
              <p className="text-xs text-red-600 dark:text-red-400">새 비밀번호가 일치하지 않습니다.</p>
            )}
          </div>

          {passwordError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700
              dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400">
              {passwordError}
            </div>
          )}

          <div className="flex justify-end">
            <Button
              type="submit"
              isLoading={changingPassword}
              disabled={!currentPassword || !passwordLengthValid || !passwordMatch}
            >
              비밀번호 변경
            </Button>
          </div>
        </form>
      </section>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
