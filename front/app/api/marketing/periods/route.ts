import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/server/bffProxy';

export async function GET(request: NextRequest) {
  return proxyToBackend(request, { backendPath: '/api/marketing/periods' });
}
