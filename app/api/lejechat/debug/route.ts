import { NextRequest, NextResponse } from 'next/server'
import { searchIndex } from '@/lib/upstash-search'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const namespace = searchParams.get('namespace')
    
    
    // Try different search approaches
    interface DebugResults {
      namespaceSearch?: {
        count: number
        items: unknown[]
      }
      namespaceSearchError?: string
      allSearch?: {
        count: number
        items: unknown[]
      }
      allSearchError?: string
      semanticSearch?: {
        count: number
        items: unknown[]
      }
      semanticSearchError?: string
    }
    const results: DebugResults = {}
    
    // 1. Search with namespace filter
    if (namespace) {
      try {
        const namespaceSearch = await searchIndex.search({
          query: '*',
          filter: `metadata.namespace = "${namespace}"`,
          limit: 10
        })
        results.namespaceSearch = {
          count: namespaceSearch.length,
          items: namespaceSearch
        }
      } catch (e) {
        results.namespaceSearchError = e instanceof Error ? e.message : String(e)
      }
    }
    
    // 2. Search without filter
    try {
      const allSearch = await searchIndex.search({
        query: namespace || 'test',
        limit: 10
      })
      results.allSearch = {
        count: allSearch.length,
        items: allSearch
      }
    } catch (e) {
      results.allSearchError = e instanceof Error ? e.message : String(e)
    }
    
    // 3. Try semantic search
    try {
      const semanticSearch = await searchIndex.search({
        query: 'udlejningshjemmeside indhold',
        limit: 10
      })
      results.semanticSearch = {
        count: semanticSearch.length,
        items: semanticSearch
      }
    } catch (e) {
      results.semanticSearchError = e instanceof Error ? e.message : String(e)
    }
    
    return NextResponse.json({
      success: true,
      namespace: namespace,
      results: results,
      upstashUrl: process.env.UPSTASH_SEARCH_REST_URL ? 'Konfigureret' : 'Ikke konfigureret',
      upstashToken: process.env.UPSTASH_SEARCH_REST_TOKEN ? 'Konfigureret' : 'Ikke konfigureret'
    })
  } catch (error) {
    return NextResponse.json(
      { 
        error: 'Fejl i debug-endpoint',
        details: error instanceof Error ? error.message : 'Ukendt fejl'
      },
      { status: 500 }
    )
  }
}