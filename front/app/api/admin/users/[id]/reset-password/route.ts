import { NextResponse } from 'next/server';
import { isAxiosError } from 'axios';
import { auth } from '@/auth';
import { privateApi } from '@/lib/api/privateApi';
import type { AdminUserPasswordResetPayload } from '@/types/adminUsers';

/** BFF: 관리자 페이지에서 계정의 비밀번호를 강제로 재설정한다. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ message: '인증이 필요합니다.' }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json()) as AdminUserPasswordResetPayload;

  try {
    await privateApi.post(`/api/admin/users/${id}/reset-password`, body);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (isAxiosError(err) && err.response) {
      return NextResponse.json(err.response.data, { status: err.response.status });
    }
    return NextResponse.json({ message: '비밀번호 재설정 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
