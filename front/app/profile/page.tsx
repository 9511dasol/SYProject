import type { Metadata } from 'next';
import ProfileClient from '@/app/profile/ProfileClient';

export const metadata: Metadata = {
  title: '프로필 설정',
  description: '계정 정보 조회 및 이메일 · 비밀번호 변경',
};

export default function ProfilePage() {
  return <ProfileClient />;
}
