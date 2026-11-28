import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/server/bffProxy';

// 응답이 두 가지다 — 신규 백엔드는 JSON(시안 N장, base64), 아직 배포 전인 옛
// 백엔드는 이미지 1장 바이너리. `binary: true` 는 바디를 파싱하지 않고 백엔드
// Content-Type 그대로 흘려보내므로 양쪽 모두 안전하게 지나간다.
// X-AI-Provider 는 옛 응답에서만 쓰이며, 백엔드 배포 후 함께 지운다.
export async function POST(request: NextRequest) {
  return proxyToBackend(request, {
    backendPath: '/api/image-filter/edit',
    binary: true,
    passthroughHeaders: ['X-AI-Provider'],
  });
}
