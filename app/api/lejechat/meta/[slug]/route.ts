import { NextResponse } from 'next/server'
import { getIndexes } from '@/lib/storage'
import { normalizeQuickPrompts } from '@/lib/quick-prompts'

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const indexes = await getIndexes()
    const { slug } = await params
    const match = indexes.find((index) => (index.slug || index.namespace) === slug)

    if (!match) {
      return NextResponse.json({ error: 'Chatbot ikke fundet' }, { status: 404 })
    }

    const normalizedMetadata = {
      ...(match.metadata || {}),
      quickPrompts: normalizeQuickPrompts(match.metadata?.quickPrompts),
    }

    return NextResponse.json({ index: { ...match, metadata: normalizedMetadata } })
  } catch (error) {
    console.error('Failed to fetch chatbot metadata', error)
    return NextResponse.json({ error: 'Kunne ikke hente chatbot metadata' }, { status: 500 })
  }
}
