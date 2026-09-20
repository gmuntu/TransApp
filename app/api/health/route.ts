export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    hasLlmKey: Boolean(process.env.ABACUSAI_API_KEY),
    timestamp: new Date().toISOString(),
  });
}
