interface BaseMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high'
export type Verbosity = 'low' | 'medium' | 'high'

export interface OpenAIResponsesOptions {
  messages?: BaseMessage[]
  systemPrompt?: string
  userPrompt?: string
  reasoningEffort?: ReasoningEffort
  verbosity?: Verbosity
  maxOutputTokens?: number
  previousResponseId?: string
}

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'

const parseOutputText = (data: any): string => {
  if (!data) return ''

  if (typeof data.output_text === 'string') {
    return data.output_text
  }

  if (Array.isArray(data.output_text)) {
    const combined = data.output_text.filter((part) => typeof part === 'string').join('\n')
    if (combined.trim()) {
      return combined
    }
  }

  const collectFromContent = (content: any): string[] => {
    if (!content) return []
    if (typeof content === 'string') return [content]
    if (Array.isArray(content)) {
      return content.flatMap((item) => collectFromContent(item))
    }
    if (typeof content === 'object') {
      if (typeof content.text === 'string') {
        return [content.text]
      }
      if (Array.isArray(content.content)) {
        return collectFromContent(content.content)
      }
    }
    return []
  }

  if (Array.isArray(data.output)) {
    const parts = data.output.flatMap((item: any) => {
      if (!item) return []
      if (typeof item.text === 'string') return [item.text]
      if (Array.isArray(item.content)) return collectFromContent(item.content)
      if (item.type === 'output_text' && typeof item.text === 'string') return [item.text]
      return []
    })

    const combined = parts.join('\n')
    if (combined.trim()) {
      return combined
    }
  }

  return ''
}

export const callOpenAIResponses = async ({
  systemPrompt,
  userPrompt,
  messages,
  reasoningEffort,
  verbosity,
  maxOutputTokens,
  previousResponseId,
}: OpenAIResponsesOptions): Promise<string> => {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY er ikke sat')
  }

  let payloadInput: BaseMessage[] | undefined = messages

  if ((!payloadInput || payloadInput.length === 0) && systemPrompt && userPrompt) {
    payloadInput = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]
  }

  if (!payloadInput || payloadInput.length === 0) {
    throw new Error('OpenAI Responses kræver enten input eller system-/brugerspørgsmål')
  }

  const payload: Record<string, unknown> = {
    model: 'gpt-5-mini',
    input: payloadInput,
  }

  if (reasoningEffort) {
    payload.reasoning = { effort: reasoningEffort }
  }

  if (verbosity) {
    payload.text = { verbosity }
  }

  if (typeof maxOutputTokens === 'number' && !Number.isNaN(maxOutputTokens)) {
    payload.max_output_tokens = maxOutputTokens
  }

  if (previousResponseId) {
    payload.previous_response_id = previousResponseId
  }

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenAI Responses API-fejl: ${errorText}`)
  }

  const data = await response.json()
  const text = parseOutputText(data)

  if (!text.trim()) {
    throw new Error('OpenAI Responses API returnerede ikke noget svar')
  }

  return text.trim()
}
