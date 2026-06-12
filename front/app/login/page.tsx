import type { Metadata } from 'next';
import LoginClient from './LoginClient';

export const metadata: Metadata = {
  title: '로그인',
  description: '마케팅 AI 대시보드 로그인',
};

export default function LoginPage() {
  return <LoginClient />;
}
