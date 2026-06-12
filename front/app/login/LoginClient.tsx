'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
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
        setSignInError('이메일 또는 비밀번호가 올바르지 않습니다.');
        return;
      }

      router.push('/');
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

      router.push('/');
      router.refresh();
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 409) {
        setSignUpError('이미 가입된 이메일입니다.');
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
                    로그인하기
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
                  <p className="mt-4 text-center text-xs">
                    <b className="text-slate-700">비밀번호를 잊으셨나요?</b>
                  </p>
                  <p className="mt-2 text-center text-xs text-slate-500">
                    <span>계정이 없으신가요? </span>
                    <button type="button" onClick={toggle} className="cursor-pointer font-bold text-slate-700">
                      회원가입하기
                    </button>
                  </p>
                </>
              }
            />
          </div>
        </div>
      </div>

      {/* CONTENT 영역 (데스크탑 안내 문구) */}
      <div className="pointer-events-none absolute top-0 left-0 z-[6] hidden h-screen w-full flex-wrap md:flex">
        <InfoPanel title="환영합니다" visible={signInVisible} direction="left" />
        <InfoPanel title="함께해요" visible={signUpVisible} direction="right" />
      </div>
    </div>
  );
}
