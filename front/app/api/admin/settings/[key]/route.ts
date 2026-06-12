import { NextResponse } from 'next/server';
import { isAxiosError } from 'axios';
import { auth } from '@/auth';
import { privateApi } from '@/lib/api/privateApi';
import type { FeatureFlagItem } from '@/types/featureFlags';

/** BFF: 관리자 페이지에서 기능 플래그를 켜고 끈다. */
export async function PATCH(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ message: '인증이 필요합니다.' }, { status: 401 });
  }

  const { key } = await params;
  const body = (await request.json()) as { value: boolean };

  try {
    const { data } = await privateApi.patch<FeatureFlagItem>(`/api/admin/settings/${key}`, body);
    return NextResponse.json(data);
  } catch (err) {
    if (isAxiosError(err) && err.response) {
      return NextResponse.json(err.response.data, { status: err.response.status });
    }
    return NextResponse.json({ message: '설정 변경 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
