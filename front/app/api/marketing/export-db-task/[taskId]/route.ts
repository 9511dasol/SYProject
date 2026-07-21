import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/server/bffProxy';

export async function GET(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  return proxyToBackend(request, { backendPath: `/api/marketing/export-db-task/${taskId}` });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  return proxyToBackend(request, { backendPath: `/api/marketing/export-db-task/${taskId}` });
}
