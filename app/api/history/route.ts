export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const records = await prisma.generatedAudio.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return NextResponse.json({ records });
  } catch (err: any) {
    console.error('History fetch error:', err?.message);
    return NextResponse.json({ records: [] });
  }
}
