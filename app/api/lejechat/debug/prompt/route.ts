import { NextRequest, NextResponse } from 'next/server'
import { streamText } from 'ai'
import { groq } from '@ai-sdk/groq'
import { anthropic } from '@ai-sdk/anthropic'
import { serverConfig as config } from '@/lejechat.config'
import { callOpenAIResponses } from '@/lib/openai-responses'

const detectActiveProvider = () => {
  if (config.ai.providers.openai.enabled) return 'openai'
  if (config.ai.providers.anthropic.enabled) return 'anthropic'
  if (config.ai.providers.groq.enabled) return 'groq'
  return null
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const message = typeof body?.message === 'string' ? body.message.trim() : ''

    if (!message) {
      return NextResponse.json({
        success: false,
        error: 'Angiv et testspørgsmål via { "message": "..." }'
      }, { status: 400 })
    }

    const provider = detectActiveProvider()
    if (!provider) {
      return NextResponse.json({
        success: false,
        error: 'Ingen AI-udbyder er aktiveret. Kontrollér OPENAI_API_KEY, GROQ_API_KEY eller ANTHROPIC_API_KEY.',
        provider
      }, { status: 400 })
    }

    if (provider === 'openai') {
      const answer = await callOpenAIResponses({
        input: [
          { role: 'system', content: 'Besvar kort på dansk og nævn hvis du mangler kontekst.' },
          { role: 'user', content: message },
        ],
      })

      return NextResponse.json({
        success: true,
        provider,
        answer,
      })
    }

    const model = provider === 'groq'
      ? groq('meta-llama/llama-4-scout-17b-16e-instruct')
      : anthropic('claude-3-5-sonnet-20241022')

    const result = await streamText({
      model,
      messages: [
        { role: 'system', content: 'Besvar kort på dansk og nævn hvis du mangler kontekst.' },
        { role: 'user', content: message }
      ],
      temperature: 0.2,
      maxTokens: 200,
    })

    let answer = ''
    for await (const chunk of result.textStream) {
      answer += chunk
    }

    return NextResponse.json({
      success: true,
      provider,
      answer: answer.trim(),
    })
  } catch (error) {
    console.error('Model debug probe failed', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Ukendt fejl',
    }, { status: 500 })
  }
}

export async function GET() {
  const provider = detectActiveProvider()
  return NextResponse.json({ provider, hasModel: Boolean(provider) })
}
