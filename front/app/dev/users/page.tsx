import type { Metadata } from 'next';
import DevUsersClient from '@/app/dev/users/DevUsersClient';
import DevGate from '@/components/ui/DevGate';

export const metadata: Metadata = {
  title: '전체 계정 관리',
  description: '전 기업 계정 조회·생성·수정·삭제·잠금 해제',
};

export default function DevUsersPage() {
  return (
    <DevGate>
      <DevUsersClient />
    </DevGate>
  );
}
