import { NextResponse } from 'next/server';
import { isAxiosError } from 'axios';
import { auth } from '@/auth';
import { privateApi } from '@/lib/api/privateApi';
import type { PasswordChangePayload } from '@/types/auth';

/** BFF: 프로필 페이지에서 현재 비밀번호 확인 후 비밀번호를 변경한다. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ message: '인증이 필요합니다.' }, { status: 401 });
  }

  const body = (await request.json()) as PasswordChangePayload;

  try {
    await privateApi.post('/api/auth/me/password', body);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (isAxiosError(err) && err.response) {
      return NextResponse.json(err.response.data, { status: err.response.status });
    }
    return NextResponse.json({ message: '비밀번호 변경 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
