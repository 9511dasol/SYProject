import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/server/bffProxy';

export async function POST(request: NextRequest, { params }: { params: Promise<{ undoId: string }> }) {
  const { undoId } = await params;
  return proxyToBackend(request, { backendPath: `/api/marketing/undo/${undoId}` });
}
