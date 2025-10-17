import { NextResponse } from 'next/server'
import { serverConfig as config } from '@/lejechat.config'

export async function GET() {
  const providers = config.ai.providers
  const activeProvider = Object.entries(providers).find(([, provider]) => provider.enabled)
  const summary = {
    active: activeProvider ? activeProvider[0] : null,
    hasOpenAI: providers.openai.enabled,
    hasAnthropic: providers.anthropic.enabled,
    hasGroq: providers.groq.enabled,
  }

  return NextResponse.json(summary)
}
