import { NextResponse } from 'next/server'
import { buildEmbedScript } from '@/lib/embed-script'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const slugParam = searchParams.get('slug') || ''
  const accent = searchParams.get('accent') || '#f97316'
  const label = searchParams.get('label') || 'Spørg Lejechat'
  const positionParam = searchParams.get('position')
  const origin = process.env.NEXT_PUBLIC_URL || ''

  const script = buildEmbedScript({
    slug: slugParam,
    accent,
    label,
    origin,
    position: positionParam === 'bottom-left' ? 'bottom-left' : undefined,
  })

  return new NextResponse(script, {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
