import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    success: true,
    service: '@ai-content-os/web',
    status: 'healthy',
    version: '0.2.0',
    timestamp: new Date().toISOString(),
  });
}
