import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/server/bffProxy';

export async function POST(request: NextRequest) {
  return proxyToBackend(request, { backendPath: '/api/marketing/rows' });
}

export async function DELETE(request: NextRequest) {
  return proxyToBackend(request, { backendPath: '/api/marketing/rows' });
}
