import { NextResponse } from 'next/server';
import { isAxiosError } from 'axios';
import { publicApi } from '@/lib/api/publicApi';
import type { RegisterPayload, TokenResponse } from '@/types/auth';

/**
 * BFF Route Handler 예시: 클라이언트는 이 엔드포인트만 호출하고,
 * 실제 FastAPI(/api/auth/register) 호출은 서버에서만 일어난다.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as RegisterPayload;

  if (!body.email || !body.password) {
    return NextResponse.json({ message: '이메일과 비밀번호를 입력해주세요.' }, { status: 400 });
  }

  try {
    const { data } = await publicApi.post<TokenResponse>('/api/auth/register', body);
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    if (isAxiosError(err) && err.response) {
      return NextResponse.json(err.response.data, { status: err.response.status });
    }
    return NextResponse.json({ message: '회원가입 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
