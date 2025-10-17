import { NextRequest } from 'next/server'
import { streamText } from 'ai'
import { groq } from '@ai-sdk/groq'
import { anthropic } from '@ai-sdk/anthropic'
import { searchIndex } from '@/lib/upstash-search'
import { serverConfig as config } from '@/lejechat.config'
import { callOpenAIResponses } from '@/lib/openai-responses'

// Get AI model at runtime on server
const getModel = () => {
  try {
    // Initialize models directly here to avoid module-level issues
    if (process.env.GROQ_API_KEY) {
      return groq('meta-llama/llama-4-scout-17b-16e-instruct')
    }
    if (process.env.ANTHROPIC_API_KEY) {
      return anthropic('claude-3-5-sonnet-20241022')
    }
    throw new Error('Ingen AI-udbyder er konfigureret. Angiv GROQ_API_KEY eller ANTHROPIC_API_KEY')
  } catch (error) {
    throw error
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Handle both direct query format and useChat format
    let query = body.query
    const namespace = body.namespace
    const stream = body.stream ?? false
    
    // If using useChat format, extract query from messages
    if (!query && body.messages && Array.isArray(body.messages)) {
      const lastUserMessage = body.messages.filter((m: { role: string }) => m.role === 'user').pop()
      query = lastUserMessage?.content
    }
    
    if (!query || !namespace) {
      return new Response(
        JSON.stringify({ error: 'Spørgsmål og navnerum er påkrævet' }), 
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    
    // Retrieve documents from Upstash Search
    interface SearchDocument {
      content?: {
        text?: string  // Searchable text
      }
      metadata?: {
        namespace?: string
        title?: string
        pageTitle?: string
        url?: string
        sourceURL?: string
        description?: string
        fullContent?: string  // Full content stored here
      }
      score?: number
    }
    
    let documents: SearchDocument[] = []
    
    try {
      // Search for documents - include namespace to improve relevance
      
      // Include namespace in search to boost relevance
      const searchQuery = `${query} ${namespace}`
      
      const searchResults = await searchIndex.search({
        query: searchQuery,
        limit: config.search.maxResults,
        reranking: true
      })
      
      
      // Filter to only include documents from the correct namespace
      documents = searchResults.filter((doc) => {
        const docNamespace = doc.metadata?.namespace
        const matches = docNamespace === namespace
        if (!matches && doc.metadata?.namespace) {
          // Only log first few mismatches to avoid spam
          if (documents.length < 3) {
          }
        }
        return matches
      })
      
      
      // If no results, try searching just for documents in this namespace
      if (documents.length === 0) {
        
        const fallbackResults = await searchIndex.search({
          query: namespace,
          limit: config.search.maxResults,
          reranking: true
        })
        
        
        // Filter for exact namespace match
        const namespaceDocs = fallbackResults.filter((doc) => {
          return doc.metadata?.namespace === namespace
        })
        
        
        // If we found documents in the namespace, search within their content
        if (namespaceDocs.length > 0) {
          // Score documents based on query relevance
          const queryLower = query.toLowerCase()
          documents = namespaceDocs.filter((doc) => {
            const content = (doc.content?.text || '').toLowerCase()
            const title = (doc.content?.title || '').toLowerCase()
            const url = (doc.content?.url || '').toLowerCase()
            
            return content.includes(queryLower) || 
                   title.includes(queryLower) || 
                   url.includes(queryLower)
          })
          
          
          // If still no results, return all namespace documents
          if (documents.length === 0) {
            documents = namespaceDocs
          }
        }
      }
      
    } catch (error) {
      console.error('Search failed', error)
      documents = []
    }
    
    // Check if we have any data for this namespace
    if (documents.length === 0) {
      
      const answer = `Jeg har ikke indekseret indhold for dette website. Sørg for at siden er blevet importeret først.`
      const sources: never[] = []
      
      if (stream) {
        const encoder = new TextEncoder()
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(`8:${JSON.stringify({ sources })}\n`))
            controller.enqueue(encoder.encode(`0:${JSON.stringify(answer)}\n`))
            controller.close()
          }
        })

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8'
          }
        })
      }

      return new Response(
        JSON.stringify({ answer, sources }), 
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Check if we have any AI provider configured
    try {
      const model = getModel()
      if (!model) {
        throw new Error('Ingen AI-model tilgængelig')
      }
    } catch {
      const answer = 'AI-tjenesten er ikke konfigureret. Angiv GROQ_API_KEY, OPENAI_API_KEY eller ANTHROPIC_API_KEY i miljøvariablerne.'
      return new Response(
        JSON.stringify({ answer, sources: [] }), 
        { headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    // Transform Upstash search results to expected format
    interface TransformedDocument {
      content: string
      url: string
      title: string
      description: string
      score: number
    }
    
    const transformedDocuments: TransformedDocument[] = documents.map((result) => {
      const title = result.metadata?.title || result.metadata?.pageTitle || 'Ingen titel'
      const description = result.metadata?.description || ''
      const url = result.metadata?.url || result.metadata?.sourceURL || ''
      
      // Get content from the document - prefer full content from metadata, fallback to searchable text
      const rawContent = result.metadata?.fullContent || result.content?.text || ''
      
      // Create structured content with clear metadata headers
      const structuredContent = `TITLE: ${title}
DESCRIPTION: ${description}
SOURCE: ${url}

${rawContent}`
      
      return {
        content: structuredContent,
        url: url,
        title: title,
        description: description,
        score: result.score || 0
      }
    })
    
    // Documents from Upstash are already scored by relevance
    // Sort by score and take top results
    const relevantDocs = transformedDocuments
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, config.search.maxSourcesDisplay) // Get many more sources for better coverage
    
    
    // If no matches, use more documents as context
    const docsToUse = relevantDocs.length > 0 ? relevantDocs : transformedDocuments.slice(0, 10)

    // Build context from relevant documents - use more content for better answers
    const contextDocs = docsToUse.slice(0, config.search.maxContextDocs) // Use top docs for richer context
    
    // Log document structure for debugging
    if (contextDocs.length > 0) {
    }
    
    const context = contextDocs
      .map((doc) => {
        const content = doc.content || ''
        if (!content) {
          return null
        }
        return content.substring(0, config.search.maxContextLength) + '...'
      })
      .filter(Boolean)
      .join('\n\n---\n\n')
    
    
    // If context is empty, log error
    if (!context || context.length < 100) {
      console.warn('Context too short for namespace', namespace, 'docs considered', docsToUse.length)
      const answer = 'Jeg fandt relevante sider, men kunne ikke udlede nok indhold til at besvare dit spørgsmål. Prøv at importere hjemmesiden igen med en højere sidelimit.'
      const sources = docsToUse.map((doc) => ({
        url: doc.url,
        title: doc.title,
        snippet: (doc.content || '').substring(0, config.search.snippetLength) + '...'
      }))
      
      return new Response(
        JSON.stringify({ answer, sources }), 
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Prepare sources
    const sources = docsToUse.map((doc) => ({
      url: doc.url,
      title: doc.title,
      snippet: (doc.content || '').substring(0, config.search.snippetLength) + '...'
    }))
    

    // Generate response using Vercel AI SDK
    try {
      const systemPrompt = config.ai.systemPrompt
      const userPrompt = `Spørgsmål: ${query}\n\nRelevant indhold fra websitet:\n${context}\n\nGiv et fyldestgørende svar ud fra oplysningerne.`

      if (process.env.OPENAI_API_KEY) {
        try {
          const answer = await callOpenAIResponses({ systemPrompt, userPrompt })
          return new Response(
            JSON.stringify({ answer, sources }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        } catch (openaiError) {
          const message = openaiError instanceof Error ? openaiError.message : 'Ukendt OpenAI-fejl'
          console.error('OpenAI Responses API fejlede', openaiError)
          const answer = `Fejl under generering af svar: ${message}`
          return new Response(
            JSON.stringify({ answer, sources }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        }
      }

      const providerModel = getModel()

      if (stream) {
        let result
        try {
          result = await streamText({
            model: providerModel,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            temperature: config.ai.temperature,
            maxTokens: config.ai.maxTokens
          })
        } catch (streamError) {
          throw streamError
        }

        const encoder = new TextEncoder()

        const stream = new ReadableStream({
          async start(controller) {
            const sourcesData = { sources }
            const sourcesLine = `8:${JSON.stringify(sourcesData)}\n`
            controller.enqueue(encoder.encode(sourcesLine))

            try {
              for await (const textPart of result.textStream) {
                const escaped = JSON.stringify(textPart)
                controller.enqueue(encoder.encode(`0:${escaped}\n`))
              }
            } catch (streamProcessingError) {
              console.error('Stream processing failed', streamProcessingError)
            }

            controller.close()
          }
        })

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8'
          }
        })
      } else {
        const result = await streamText({
          model: providerModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: config.ai.temperature,
          maxTokens: config.ai.maxTokens
        })

        let answer = ''
        for await (const textPart of result.textStream) {
          answer += textPart
        }

        return new Response(
          JSON.stringify({ answer, sources }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      }

    } catch (groqError) {
      const errorMessage = groqError instanceof Error ? groqError.message : 'Ukendt fejl'
      console.error('AI generation failed', { namespace, error: errorMessage })
      let answer = `Fejl under generering af svar: ${errorMessage}`
      
      if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        answer = 'Fejl: Groq API-godkendelse mislykkedes. Kontrollér din GROQ_API_KEY.'
      } else if (errorMessage.includes('rate limit')) {
        answer = 'Fejl: Groq API-rate limit er nået. Prøv igen senere.'
      }
      
      return new Response(
        JSON.stringify({ answer, sources }), 
        { headers: { 'Content-Type': 'application/json' } }
      )
    }
  } catch (error) {
    console.error('Query processing failed', error)
    return new Response(
      JSON.stringify({ error: 'Kunne ikke behandle forespørgslen' }), 
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
