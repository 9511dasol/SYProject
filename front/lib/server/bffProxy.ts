import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

const BACKEND_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export interface ProxyOptions {
  /** FastAPI 쪽 경로 (예: '/api/marketing/upload') */
  backendPath: string;
  /** true면 응답 바디를 JSON 파싱하지 않고 그대로(Blob) 전달한다 — Excel 다운로드 등 */
  binary?: boolean;
}

/**
 * 로그인한 사용자만 FastAPI 백엔드를 호출할 수 있도록 감싸는 공용 BFF 프록시.
 * NextAuth 세션의 accessToken을 Authorization 헤더에 실어 전달하므로
 * 브라우저는 FastAPI 주소를 몰라도 되고, FastAPI 쪽 엔드포인트도 인증 없이는 호출되지 않는다.
 *
 * - GET/DELETE: 들어온 쿼리스트링을 그대로 전달, 바디 없음
 * - multipart/form-data 요청(파일 업로드): 브라우저 FormData를 그대로 전달
 *   (axios의 Node 어댑터는 네이티브 FormData의 멀티파트 경계를 제대로 못 만들어서
 *   반드시 fetch로 전달해야 한다 — Content-Type을 직접 지정하면 안 됨, fetch가 자동으로 채움)
 * - 그 외 POST/PATCH: JSON 바디를 그대로 전달
 */
export async function proxyToBackend(
  request: NextRequest,
  opts: ProxyOptions,
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ message: '인증이 필요합니다.' }, { status: 401 });
  }

  const url = new URL(opts.backendPath, BACKEND_URL);
  request.nextUrl.searchParams.forEach((value, key) => url.searchParams.append(key, value));

  const headers: HeadersInit = { Authorization: `Bearer ${session.accessToken}` };
  const init: RequestInit = { method: request.method, headers };

  const contentType = request.headers.get('content-type') ?? '';
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'DELETE';

  if (hasBody && contentType.includes('multipart/form-data')) {
    init.body = await request.formData();
  } else if (hasBody) {
    const raw = await request.text();
    if (raw) {
      init.body = raw;
      (headers as Record<string, string>)['Content-Type'] = 'application/json';
    }
  }

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    return NextResponse.json({ message: '백엔드 서버에 연결할 수 없습니다.' }, { status: 502 });
  }

  if (opts.binary) {
    if (!response.ok) {
      const errText = await response.text();
      return new NextResponse(errText, {
        status: response.status,
        headers: { 'Content-Type': response.headers.get('content-type') ?? 'application/json' },
      });
    }
    const buffer = await response.arrayBuffer();
    return new NextResponse(buffer, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') ?? 'application/octet-stream',
        'Content-Disposition': response.headers.get('content-disposition') ?? 'attachment',
      },
    });
  }

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  return NextResponse.json(data, { status: response.status });
}
