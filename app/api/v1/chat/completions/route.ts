import { NextRequest, NextResponse } from 'next/server'
import { serverConfig as config } from '@/lejechat.config'
import { callOpenAIResponses } from '@/lib/openai-responses'

// CORS headers for API access
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Use-Groq, X-Use-OpenAI',
      'Access-Control-Max-Age': '86400',
    },
  })
}

// OpenAI-compatible chat completions endpoint
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { messages, model, stream = false } = body
    
    // Check if this is a Groq API request
    const useGroq = request.headers.get('X-Use-Groq') === 'true'
    const useOpenAI = request.headers.get('X-Use-OpenAI') === 'true'
    
    if (useGroq) {
      // Handle Groq API request
      const groqApiKey = process.env.GROQ_API_KEY
      
      if (!groqApiKey) {
        return NextResponse.json(
          { 
            error: {
              message: 'Groq API-nøgle er ikke konfigureret',
              type: 'server_error',
              code: 500
            }
          },
          { status: 500 }
        )
      }
      
      // Forward request to Groq API
      const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages,
          model,
          stream,
          temperature: body.temperature || config.ai.temperature,
          max_tokens: body.max_tokens || 2000 // Keep higher default for OpenAI-compatible endpoint
        })
      })
      
      if (!groqResponse.ok) {
        const errorData = await groqResponse.json()
        throw new Error(errorData.error?.message || 'Groq API-fejl')
      }
      
      const groqData = await groqResponse.json()
      
      return NextResponse.json(groqData, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Use-Groq, X-Use-OpenAI',
        }
      })
    }
    
    if (useOpenAI) {
      if (!process.env.OPENAI_API_KEY) {
        return NextResponse.json(
          {
            error: {
              message: 'OpenAI API-nøgle er ikke konfigureret',
              type: 'server_error',
              code: 500,
            },
          },
          { status: 500 }
        )
      }

      if (stream) {
        return NextResponse.json(
          {
            error: {
              message: 'Streaming er ikke understøttet for GPT-4.1-mini via dette endpoint endnu.',
              type: 'not_supported',
              code: 400,
            },
          },
          { status: 400 }
        )
      }

      try {
        const assistantContent = await callOpenAIResponses({ input: messages })

        const responsePayload = {
          id: `lejechat-openai-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: 'gpt-4.1-mini',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: assistantContent,
              },
              finish_reason: 'stop',
            },
          ],
        }

        return NextResponse.json(responsePayload, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Use-Groq, X-Use-OpenAI',
          },
        })
      } catch (error) {
        return NextResponse.json(
          {
            error: {
              message: error instanceof Error ? error.message : 'OpenAI Responses API-fejl',
              type: 'server_error',
              code: 500,
            },
          },
          { status: 500 }
        )
      }
    }
    
    // Original Firecrawl namespace logic
    let namespace = ''
    
    if (model?.startsWith('lejechat-')) {
      // Extract the domain part after "lejechat-"
      const domainPart = model.substring('lejechat-'.length)
      // For now, we'll need to look up the actual namespace based on the domain
      // This is a simplified version - in production you'd want to store a mapping
      namespace = domainPart
    }
    
    if (!namespace) {
      return NextResponse.json(
        { 
          error: {
            message: 'Ugyldigt modelnavn. Brug formatet: lejechat-<domæne>',
            type: 'invalid_request_error',
            code: 400
          }
        },
        { status: 400 }
      )
    }

    // Get the last user message for context search
    interface Message {
      role: string
      content: string
    }
    
    const lastUserMessage = messages.filter((m: Message) => m.role === 'user').pop()
    const query = lastUserMessage?.content || ''

    // Handle streaming for firecrawl models
    if (stream) {
      const contextResponse = await fetch(`${request.nextUrl.origin}/api/lejechat/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query, 
          namespace,
          messages: messages.slice(0, -1),
          stream: true
        })
      })
      
      if (!contextResponse.ok) {
        const error = await contextResponse.text()
        throw new Error(error || 'Kunne ikke hente kontekst')
      }
      
      // Transform Vercel AI SDK stream to OpenAI format
      const reader = contextResponse.body?.getReader()
      if (!reader) throw new Error('Intet svarindhold')
      
      const encoder = new TextEncoder()
      const decoder = new TextDecoder()
      
      const stream = new ReadableStream({
        async start(controller) {
          let buffer = ''
          
          // Send initial chunk
          controller.enqueue(encoder.encode(`data: {"id":"chatcmpl-${Date.now()}","object":"chat.completion.chunk","created":${Math.floor(Date.now() / 1000)},"model":"${model}","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}\n\n`))
          
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            
            const chunk = decoder.decode(value)
            buffer += chunk
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''
            
            for (const line of lines) {
              if (line.trim() === '') continue
              
              // Handle Vercel AI SDK format
              if (line.startsWith('0:')) {
                const content = line.slice(2)
                if (content.startsWith('"') && content.endsWith('"')) {
                  try {
                    const text = JSON.parse(content)
                    const data = {
                      id: `chatcmpl-${Date.now()}`,
                      object: 'chat.completion.chunk',
                      created: Math.floor(Date.now() / 1000),
                      model: model,
                      choices: [{
                        index: 0,
                        delta: { content: text },
                        finish_reason: null
                      }]
                    }
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
                  } catch {
                    // Skip invalid JSON
                  }
                }
              }
            }
          }
          
          // Send final chunk
          controller.enqueue(encoder.encode(`data: {"id":"chatcmpl-${Date.now()}","object":"chat.completion.chunk","created":${Math.floor(Date.now() / 1000)},"model":"${model}","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n`))
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        }
      })
      
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        }
      })
    }
    
    // Non-streaming response
    const contextResponse = await fetch(`${request.nextUrl.origin}/api/lejechat/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        query, 
        namespace,
        messages: messages.slice(0, -1),
        stream: false
      })
    })

    const contextData = await contextResponse.json()
    
    if (!contextResponse.ok) {
      throw new Error(contextData.error || 'Kunne ikke hente kontekst')
    }

    // Format the response in OpenAI format
    const completion = {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: contextData.answer
          },
          finish_reason: 'stop'
        }
      ]
    }

    // Add sources as metadata if available
    if (contextData.sources && contextData.sources.length > 0) {
      interface Source {
        title: string
        url: string
      }
      
      completion.choices[0].message.content += `\n\n**Kilder:**\n${contextData.sources.map((s: Source) => `- [${s.title}](${s.url})`).join('\n')}`
    }

    return NextResponse.json(completion, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    })
  } catch (error) {
    return NextResponse.json(
      { 
        error: {
          message: error instanceof Error ? error.message : 'Kunne ikke behandle chat-svaret',
          type: 'server_error',
          code: 500
        }
      },
      { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Use-Groq, X-Use-OpenAI',
        }
      }
    )
  }
}
