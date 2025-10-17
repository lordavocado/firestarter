import { NextResponse } from 'next/server'
import { getIndexes } from '@/lib/storage'

export async function GET() {
  const indexes = await getIndexes()
  return NextResponse.json({ indexes })
}
