'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSession, signIn } from 'next-auth/react';
import { isAxiosError } from 'axios';
import axios from 'axios';
import BackgroundCurve from '@/components/login/BackgroundCurve';
import AuthCard from '@/components/login/AuthCard';
import InfoPanel from '@/components/login/InfoPanel';
import type { TokenResponse } from '@/types/auth';

type Mode = 'sign-in' | 'sign-up' | null;

export default function LoginClient() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [signUpError, setSignUpError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMode('sign-in'), 200);
    return () => clearTimeout(timer);
  }, []);

  const toggle = () => {
    setSignInError(null);
    setSignUpError(null);
    setMode((prev) => (prev === 'sign-up' ? 'sign-in' : 'sign-up'));
  };

  const signUpVisible = mode === 'sign-up';
  const signInVisible = mode === 'sign-in' || mode === null;

  const handleSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSignInError(null);
    setPending(true);

    const formData = new FormData(event.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    try {
      const result = await signIn('credentials', { email, password, redirect: false });

      if (result?.error) {
        // code 에는 백엔드가 준 조치 가능한 사유(계정 잠금 등)가 실려 온다 —
        // Auth.js 기본 에러 코드("credentials")는 사용자용 문구가 아니므로 거른다.
        const reason = result.code && result.code !== 'credentials' ? result.code : null;
        setSignInError(reason ?? '이메일 또는 비밀번호가 올바르지 않습니다.');
        return;
      }

      const session = await getSession();
      const role = session?.user.role;
      router.push(role === 'dev' ? '/dev/companies' : role === 'admin' ? '/admin/users' : '/dashboard');
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  const handleSignUp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSignUpError(null);

    const formData = new FormData(event.currentTarget);
    const name = formData.get('name') as string;
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirmPassword') as string;

    if (password !== confirmPassword) {
      setSignUpError('비밀번호가 일치하지 않습니다.');
      return;
    }

    setPending(true);
    try {
      // BFF Route Handler를 통해 FastAPI 회원가입을 호출한다.
      await axios.post<TokenResponse>('/api/auth/register', { email, password, name });

      const result = await signIn('credentials', { email, password, redirect: false });
      if (result?.error) {
        setSignUpError('회원가입은 완료되었지만 로그인에 실패했습니다. 다시 로그인해주세요.');
        return;
      }

      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 409) {
        setSignUpError('이미 가입된 이메일입니다.');
      } else if (isAxiosError(err) && err.response?.status === 403) {
        // 운영 환경은 백엔드가 가입을 막는다(development 전용) — 원인 불명
        // "오류가 발생했습니다" 대신 실제 이유와 다음 행동을 안내한다.
        setSignUpError('현재 환경에서는 회원가입이 비활성화되어 있습니다. 관리자에게 계정 발급을 문의해 주세요.');
      } else {
        setSignUpError('회원가입 중 오류가 발생했습니다.');
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-slate-50">
      <BackgroundCurve mode={mode} />

      {/* 소개 페이지로 돌아가기 — 곡선 배경(z-6) 위에 떠 있어야 하므로 z-10.
          배경이 초록 곡선일 때도, 흰 여백일 때도 읽히도록 반투명 흰 알약으로 둔다. */}
      <Link
        href="/"
        className="absolute top-4 left-4 z-10 inline-flex items-center gap-1.5
          rounded-xl border border-slate-200/70 bg-white/85 px-3.5 py-2
          text-xs font-semibold text-slate-700 shadow-sm backdrop-blur
          transition-colors hover:bg-white hover:text-slate-900"
      >
        <i className="bx bx-left-arrow-alt text-base" />
        소개 페이지로
      </Link>

      {/* FORM 영역 */}
      <div className="relative flex h-screen flex-wrap">
        {/* SIGN UP */}
        <div className={`flex w-full flex-col items-center justify-center p-6 md:w-1/2 ${signUpVisible ? 'flex' : 'hidden md:flex'}`}>
          <div className="w-full max-w-md">
            <AuthCard
              visible={signUpVisible}
              onSubmit={handleSignUp}
              pending={pending}
              error={signUpError}
              fields={[
                { icon: 'bx bxs-user', type: 'text', name: 'name', placeholder: '이름', required: true, autoComplete: 'name' },
                { icon: 'bx bx-mail-send', type: 'email', name: 'email', placeholder: '이메일', required: true, autoComplete: 'email' },
                { icon: 'bx bxs-lock-alt', type: 'password', name: 'password', placeholder: '비밀번호', required: true, autoComplete: 'new-password' },
                { icon: 'bx bxs-lock-alt', type: 'password', name: 'confirmPassword', placeholder: '비밀번호 확인', required: true, autoComplete: 'new-password' },
              ]}
              submitLabel="회원가입"
              footer={
                <p className="mt-4 text-center text-xs text-slate-500">
                  <span>이미 계정이 있으신가요? </span>
                  <button type="button" onClick={toggle} className="cursor-pointer font-bold text-slate-700">
                    로그인
                  </button>
                </p>
              }
            />
          </div>
        </div>

        {/* SIGN IN */}
        <div className={`flex w-full flex-col items-center justify-center p-6 md:w-1/2 ${signInVisible ? 'flex' : 'hidden md:flex'}`}>
          <div className="w-full max-w-md">
            <AuthCard
              visible={signInVisible}
              onSubmit={handleSignIn}
              pending={pending}
              error={signInError}
              fields={[
                { icon: 'bx bxs-user', type: 'email', name: 'email', placeholder: '이메일', required: true, autoComplete: 'email' },
                { icon: 'bx bxs-lock-alt', type: 'password', name: 'password', placeholder: '비밀번호', required: true, autoComplete: 'current-password' },
              ]}
              submitLabel="로그인"
              footer={
                <>
                  {/* 셀프서비스 재설정 플로우는 아직 없다 — 클릭돼 보이는 가짜 링크 대신
                      실제로 할 수 있는 행동(관리자 문의)을 안내한다. */}
                  <p className="mt-4 text-center text-xs text-slate-500">
                    비밀번호를 잊으셨다면 관리자에게 재설정을 문의해 주세요.
                  </p>
                  <p className="mt-2 text-center text-xs text-slate-500">
                    <span>계정이 없으신가요? </span>
                    <button type="button" onClick={toggle} className="cursor-pointer font-bold text-slate-700">
                      회원가입
                    </button>
                  </p>
                </>
              }
            />
          </div>
        </div>
      </div>

      {/* CONTENT 영역 (데스크탑 안내 문구) */}
      <div className="pointer-events-none absolute top-0 left-0 z-6 hidden h-screen w-full flex-wrap md:flex">
        <InfoPanel title="환영합니다" visible={signInVisible} direction="left" />
        <InfoPanel title="함께해요" visible={signUpVisible} direction="right" />
      </div>
    </div>
  );
}
