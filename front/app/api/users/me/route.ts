import { NextResponse } from 'next/server';
import { isAxiosError } from 'axios';
import { auth } from '@/auth';
import { privateApi } from '@/lib/api/privateApi';

/**
 * BFF Route Handler 예시: privateApi가 NextAuth 세션의 accessToken을
 * Authorization 헤더에 자동으로 주입해 FastAPI(/api/auth/me)로 전달한다.
 */
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ message: '인증이 필요합니다.' }, { status: 401 });
  }

  try {
    const { data } = await privateApi.get('/api/auth/me');
    return NextResponse.json(data);
  } catch (err) {
    if (isAxiosError(err) && err.response) {
      return NextResponse.json(err.response.data, { status: err.response.status });
    }
    return NextResponse.json({ message: '사용자 정보 조회 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
