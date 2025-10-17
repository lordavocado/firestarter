import { groq } from '@ai-sdk/groq'
import { anthropic } from '@ai-sdk/anthropic'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// AI provider configuration
const AI_PROVIDERS = {
  groq: {
    model: groq('meta-llama/llama-4-scout-17b-16e-instruct'),
    enabled: !!process.env.GROQ_API_KEY,
  },
  openai: {
    model: null,
    enabled: !!process.env.OPENAI_API_KEY,
  },
  anthropic: {
    model: anthropic('claude-3-5-sonnet-20241022'),
    enabled: !!process.env.ANTHROPIC_API_KEY,
  },
}

// Get the active AI provider
function getAIModel() {
  // Only check on server side
  if (typeof window !== 'undefined') {
    return null
  }
  // Priority: OpenAI (GPT-4o) > Anthropic (Claude 3.5 Sonnet) > Groq
  if (AI_PROVIDERS.anthropic.enabled) return AI_PROVIDERS.anthropic.model
  if (AI_PROVIDERS.groq.enabled) return AI_PROVIDERS.groq.model
  throw new Error('Ingen AI-udbyder er konfigureret. Angiv OPENAI_API_KEY, ANTHROPIC_API_KEY eller GROQ_API_KEY')
}

// Rate limiter factory
function createRateLimiter(identifier: string, requests = 50, window = '1 d') {
  if (typeof window !== 'undefined') {
    return null
  }
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null
  }
  
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  })
  
  return new Ratelimit({
    redis,
    limiter: Ratelimit.fixedWindow(requests, window),
    analytics: true,
    prefix: `lejechat:ratelimit:${identifier}`,
  })
}

const config = {
  app: {
    name: 'Lejechat',
    url: process.env.NEXT_PUBLIC_URL || 'http://localhost:3000',
    logoPath: '/lejechat-logo.svg',
  },

  ai: {
    model: null as unknown,
    reasoningEffort:
      (process.env.GPT5_REASONING_EFFORT as 'minimal' | 'low' | 'medium' | 'high') || 'medium',
    verbosity: (process.env.GPT5_VERBOSITY as 'low' | 'medium' | 'high') || 'medium',
    maxOutputTokens: process.env.GPT5_MAX_OUTPUT_TOKENS
      ? Number(process.env.GPT5_MAX_OUTPUT_TOKENS)
      : 800,
    systemPrompt: `Du er en hjælpsom udlejningsassistent. Når en bruger spørger til boliger, skal du svare på dansk og kun bruge konteksten nedenfor. Hvis du ikke kan finde svar i materialet, skal du sige det tydeligt. Besvar også spørgsmål om depositum, inflytningsdatoer og kontaktmuligheder, hvis oplysningerne findes i teksterne.`,
    providers: AI_PROVIDERS,
  },

  crawling: {
    defaultLimit: 10,
    maxLimit: 100,
    minLimit: 10,
    limitOptions: [10, 25, 50, 100],
    scrapeTimeout: 15000,
    cacheMaxAge: 604800,
  },

  search: {
    maxResults: 100,
    maxContextDocs: 10,
    maxContextLength: 1500,
    maxSourcesDisplay: 20,
    snippetLength: 200,
  },

  storage: {
    maxIndexes: 50,
    localStorageKey: 'lejechat_indexes',
    redisPrefix: {
      indexes: 'lejechat:indexes',
      index: 'lejechat:index:',
    },
  },

  rateLimits: {
    create: createRateLimiter('create', 20, '1 d'),
    query: createRateLimiter('query', 100, '1 h'),
    scrape: createRateLimiter('scrape', 50, '1 d'),
  },

  features: {
    enableCreation: process.env.DISABLE_CHATBOT_CREATION !== 'true',
    enableRedis: !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
    enableSearch: !!(process.env.UPSTASH_SEARCH_REST_URL && process.env.UPSTASH_SEARCH_REST_TOKEN),
  },
}

export type Config = typeof config

// Client-safe config (no AI model initialization)
export const clientConfig = {
  app: config.app,
  crawling: config.crawling,
  search: config.search,
  storage: config.storage,
  features: config.features,
}

// Server-only config (includes AI model)
export const serverConfig = config

// Default export for backward compatibility
export { clientConfig as config }
