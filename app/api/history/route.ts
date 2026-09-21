export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const records = await prisma.generatedAudio.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return NextResponse.json({ records });
  } catch (err: any) {
    console.error('History fetch error:', err?.message);
    return NextResponse.json({ records: [] });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (id) {
      await prisma.generatedAudio.delete({
        where: { id },
      });
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('History delete error:', err?.message);
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  }
}
