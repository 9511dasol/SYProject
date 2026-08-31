'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson, sendJson } from '@/lib/api/authFetch';
import { formatDate } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';
import Alert from '@/components/ui/Alert';
import Button from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import Spinner from '@/components/ui/Spinner';
import { useToast } from '@/components/providers/ToastProvider';
import type { PasswordChangePayload, ProfileUpdatePayload, UserProfile, UserRole } from '@/types/auth';

const ROLE_LABELS: Record<UserRole, string> = {
  user: '일반 사용자',
  admin: '관리자',
};

const ROLE_BADGE_STYLES: Record<UserRole, string> = {
  user: 'bg-surface-2 text-fg-muted',
  admin: 'bg-primary-soft text-primary',
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ProfileClient() {
  const { update } = useSession();
  const queryClient = useQueryClient();
  const { toast: addToast } = useToast();

  const profileQuery = useQuery({
    queryKey: queryKeys.me(),
    queryFn: () => fetchJson<UserProfile>('/api/users/me', undefined, '프로필 조회 실패'),
  });
  const profile = profileQuery.data ?? null;
  const loadError = profileQuery.error;

  /*
    폼 값은 서버 값에서 파생시키고, 사용자가 손댄 뒤부터 draft 를 쓴다.
    조회 결과를 state 로 복사해 두면 백그라운드 재조회가 입력 중인 값을 덮어쓴다.
  */
  const [draftName, setDraftName] = useState<string | null>(null);
  const [draftEmail, setDraftEmail] = useState<string | null>(null);
  const name = draftName ?? profile?.name ?? '';
  const email = draftEmail ?? profile?.email ?? '';
  const setName = setDraftName;
  const setEmail = setDraftEmail;

  const [profileTouched, setProfileTouched] = useState(false);

  // ── 비밀번호 변경 폼 ──────────────────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordTouched, setPasswordTouched] = useState(false);

  // ── 실시간 유효성 검사 ────────────────────────────────────────────────────────
  const nameValid = name.trim().length > 0;
  const emailValid = EMAIL_REGEX.test(email);
  const profileDirty = !!profile && (name !== profile.name || email !== profile.email);

  const passwordLengthValid = newPassword.length >= 8;
  const passwordMatch = newPassword.length > 0 && newPassword === confirmPassword;

  const profileMutation = useMutation({
    mutationFn: (payload: ProfileUpdatePayload) =>
      sendJson<UserProfile>('/api/users/me', 'PATCH', payload, '프로필 수정 실패'),
    onSuccess: async (updated) => {
      queryClient.setQueryData(queryKeys.me(), updated);
      // 서버 값이 새 기준이 되므로 draft 를 버린다
      setDraftName(null);
      setDraftEmail(null);
      setProfileTouched(false);
      // 사이드바 프로필이 세션을 읽으므로 세션도 갱신해야 이름이 바로 바뀐다
      await update({ name: updated.name, email: updated.email });
      addToast('success', '프로필 정보를 수정했습니다.');
    },
    onError: (err) => addToast('error', err.message),
  });

  const passwordMutation = useMutation({
    mutationFn: (payload: PasswordChangePayload) =>
      sendJson('/api/users/me/password', 'POST', payload, '비밀번호 변경 실패'),
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordTouched(false);
      addToast('success', '비밀번호를 변경했습니다.');
    },
    onError: (err) => addToast('error', err.message),
  });

  const savingProfile = profileMutation.isPending;
  const changingPassword = passwordMutation.isPending;
  // 폼 안에 보여줄 오류 — 클라이언트 검증 실패와 서버 오류를 같은 자리에 쓴다
  const [localProfileError, setLocalProfileError] = useState<string | null>(null);
  const [localPasswordError, setLocalPasswordError] = useState<string | null>(null);
  const profileError = localProfileError ?? profileMutation.error?.message ?? null;
  const passwordError = localPasswordError ?? passwordMutation.error?.message ?? null;

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setProfileTouched(true);
    setLocalProfileError(null);

    if (!nameValid) {
      setLocalProfileError('이름을 입력해주세요.');
      return;
    }
    if (!emailValid) {
      setLocalProfileError('올바른 이메일 형식이 아닙니다.');
      return;
    }
    if (!profile || !profileDirty) return;

    const payload: ProfileUpdatePayload = {};
    if (name !== profile.name) payload.name = name;
    if (email !== profile.email) payload.email = email;
    profileMutation.mutate(payload);
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordTouched(true);
    setLocalPasswordError(null);

    if (!currentPassword) {
      setLocalPasswordError('현재 비밀번호를 입력해주세요.');
      return;
    }
    if (!passwordLengthValid) {
      setLocalPasswordError('새 비밀번호는 8자 이상이어야 합니다.');
      return;
    }
    if (!passwordMatch) {
      setLocalPasswordError('새 비밀번호가 일치하지 않습니다.');
      return;
    }
    passwordMutation.mutate({
      current_password: currentPassword,
      new_password: newPassword,
    });
  };

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 min-h-[60vh] px-6 text-center">
        <i className="bx bx-error-circle text-3xl text-fg-subtle" />
        <div>
          <h2 className="text-lg font-bold text-fg">프로필을 불러올 수 없습니다</h2>
          <p className="mt-1 text-sm text-fg-subtle">{loadError.message}</p>
        </div>
        {/* 재시도 수단이 없으면 사용자는 새로고침 말고 할 수 있는 게 없다 */}
        <Button
          variant="outline"
          size="md"
          onClick={() => profileQuery.refetch()}
          isLoading={profileQuery.isFetching}
        >
          <i className="bx bx-refresh text-base" />
          다시 시도
        </Button>
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
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
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
          <Input
            label="이름"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="이름"
            error={profileTouched && !nameValid ? '이름을 입력해주세요.' : null}
          />
          <Input
            label="이메일"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            error={profileTouched && !emailValid ? '올바른 이메일 형식이 아닙니다.' : null}
            hint={
              email !== profile.email && emailValid
                ? '이메일을 변경하면 다음 로그인부터 새 이메일을 사용합니다.'
                : undefined
            }
          />

          {profileError && <Alert>{profileError}</Alert>}

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
          <Input
            label="현재 비밀번호"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="현재 비밀번호"
            autoComplete="current-password"
          />
          <Input
            label="새 비밀번호"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="8자 이상"
            autoComplete="new-password"
            error={
              passwordTouched && newPassword.length > 0 && !passwordLengthValid
                ? '새 비밀번호는 8자 이상이어야 합니다.'
                : null
            }
          />
          <Input
            label="새 비밀번호 확인"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="새 비밀번호 확인"
            autoComplete="new-password"
            error={
              passwordTouched && confirmPassword.length > 0 && !passwordMatch
                ? '새 비밀번호가 일치하지 않습니다.'
                : null
            }
          />

          {passwordError && <Alert>{passwordError}</Alert>}

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
    </div>
  );
}
