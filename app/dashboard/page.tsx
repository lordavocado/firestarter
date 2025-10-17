'use client'

import { useState, useEffect, useRef, Suspense, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MarkdownContent } from "@/components/chat/markdown-content"
import { Send, Globe, Copy, Check, FileText, Database, ArrowLeft, ExternalLink, BookOpen } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
// Removed useChat - using custom implementation
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DEFAULT_QUICK_PROMPTS, normalizeQuickPrompts } from "@/lib/quick-prompts"

interface Source {
  url: string
  title: string
  snippet: string
}

interface SiteData {
  url: string
  namespace: string
  slug: string
  pagesCrawled: number
  metadata: {
    title: string
    description?: string
    favicon?: string
    ogImage?: string
    quickPrompts?: string[]
  }
  crawlId?: string
  crawlComplete?: boolean
  crawlDate?: string
  createdAt?: string
}

function DashboardContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [siteData, setSiteData] = useState<SiteData | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [copiedItem, setCopiedItem] = useState<string | null>(null)
  const [copiedSnippet, setCopiedSnippet] = useState(false)
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; sources?: Source[] }>>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showApiModal, setShowApiModal] = useState(false)
  const [activeTab, setActiveTab] = useState<'curl' | 'javascript' | 'python' | 'openai-js' | 'openai-python'>('curl')
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const chatFormRef = useRef<HTMLFormElement>(null)
  const [promptFields, setPromptFields] = useState<string[]>(DEFAULT_QUICK_PROMPTS)
  const [savingPrompts, setSavingPrompts] = useState(false)

  const recordInteraction = (prompt: string) => {
    if (typeof window === 'undefined' || !siteData) return
    try {
      const key = 'lejechat_recent_interactions'
      const existing = window.localStorage.getItem(key)
      const parsed: Array<{ slug: string; message: string; origin: string; timestamp: string }> = existing ? JSON.parse(existing) : []
      const entry = {
        slug: siteData.slug,
        message: prompt,
        origin: 'dashboard',
        timestamp: new Date().toISOString(),
      }
      const updated = [entry, ...parsed].slice(0, 20)
      window.localStorage.setItem(key, JSON.stringify(updated))
    } catch (error) {
      console.warn('Kunne ikke gemme interaktion til diagnosticering', error)
    }
  }

  useEffect(() => {
    const el = scrollAreaRef.current
    if (!el) return
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el
      const atBottom = scrollHeight - scrollTop - clientHeight < 20
      setAutoScroll(atBottom)
    }
    el.addEventListener('scroll', handleScroll)
    return () => {
      el.removeEventListener('scroll', handleScroll)
    }
  }, [])

  useEffect(() => {
    setPromptFields(normalizeQuickPrompts(siteData?.metadata?.quickPrompts))
  }, [siteData?.metadata?.quickPrompts])

  const sanitizedPromptFields = useMemo(() => promptFields.map((prompt) => prompt.trim()), [promptFields])
  const savedQuickPrompts = useMemo(() => normalizeQuickPrompts(siteData?.metadata?.quickPrompts), [siteData?.metadata?.quickPrompts])
  const suggestionPrompts = useMemo(() => {
    const current = siteData?.metadata?.quickPrompts
    if (current && current.length > 0) {
      return normalizeQuickPrompts(current)
    }
    return DEFAULT_QUICK_PROMPTS
  }, [siteData?.metadata?.quickPrompts])
  const hasPromptChanges = useMemo(() => {
    if (sanitizedPromptFields.length !== savedQuickPrompts.length) return true
    return sanitizedPromptFields.some((value, index) => value !== savedQuickPrompts[index])
  }, [sanitizedPromptFields, savedQuickPrompts])

  const handlePromptChange = (index: number, value: string) => {
    setPromptFields((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  const resetPrompts = () => {
    setPromptFields(DEFAULT_QUICK_PROMPTS)
  }

  const persistQuickPrompts = async () => {
    if (!siteData) return
    const trimmed = promptFields.map((prompt) => prompt.trim())
    if (trimmed.some((prompt) => prompt.length === 0)) {
      toast.error('Udfyld alle tre starterspørgsmål før du gemmer.')
      return
    }

    const normalized = normalizeQuickPrompts(trimmed)

    setSavingPrompts(true)
    try {
      const updatedSiteData: SiteData = {
        ...siteData,
        metadata: {
          ...siteData.metadata,
          quickPrompts: normalized,
        },
      }
      setSiteData(updatedSiteData)
      setPromptFields(normalized)

      if (typeof window !== 'undefined') {
        sessionStorage.setItem('lejechat_current_data', JSON.stringify(updatedSiteData))

        try {
          const stored = window.localStorage.getItem('lejechat_indexes')
          if (stored) {
            const indexes = JSON.parse(stored)
            const indexPosition = Array.isArray(indexes)
              ? indexes.findIndex((item: { namespace?: string }) => item?.namespace === updatedSiteData.namespace)
              : -1
            if (indexPosition >= 0) {
              indexes[indexPosition] = {
                ...indexes[indexPosition],
                metadata: {
                  ...(indexes[indexPosition]?.metadata || {}),
                  quickPrompts: normalized,
                },
              }
              window.localStorage.setItem('lejechat_indexes', JSON.stringify(indexes))
            }
          }
        } catch (storageError) {
          console.warn('Kunne ikke opdatere lokale starterspørgsmål', storageError)
        }
      }

      try {
        await fetch('/api/indexes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedSiteData),
        })
      } catch (apiError) {
        console.warn('Kunne ikke synkronisere starterspørgsmål til serveren', apiError)
      }

      toast.success('Starterspørgsmål opdateret')
    } finally {
      setSavingPrompts(false)
    }
  }

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || !siteData) return

    let processedInput = input.trim()
    
    // Check if the input looks like a URL without protocol
    const urlPattern = /^(?!https?:\/\/)([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(\/.*)?$/
    if (urlPattern.test(processedInput)) {
      processedInput = 'https://' + processedInput
    }

    const userMessage = { role: 'user' as const, content: processedInput }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)
    recordInteraction(processedInput)
    
    try {
      const response = await fetch('/api/lejechat/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [userMessage],
          namespace: siteData.namespace,
          stream: false
        })
      })

      if (!response.ok) {
        throw new Error('Kunne ikke hente svar')
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let sources: Source[] = []
      let content = ''
      let hasStartedStreaming = false

      if (!reader) throw new Error('No response body')

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.trim() === '') continue
          
          
          // Handle Vercel AI SDK streaming format
          if (line.startsWith('0:')) {
            // Text content chunk
            const textContent = line.slice(2)
            if (textContent.startsWith('"') && textContent.endsWith('"')) {
              const text = JSON.parse(textContent)
              content += text
              
              // Add assistant message on first content
              if (!hasStartedStreaming) {
                hasStartedStreaming = true
                setMessages(prev => [...prev, { 
                  role: 'assistant' as const, 
                  content: content, 
                  sources: sources 
                }])
              } else {
                // Update the last message with new content
                setMessages(prev => {
                  const newMessages = [...prev]
                  const lastMessage = newMessages[newMessages.length - 1]
                  if (lastMessage && lastMessage.role === 'assistant') {
                    lastMessage.content = content
                    lastMessage.sources = sources
                  }
                  return newMessages
                })
              }
              scrollToBottom()
            }
          } else if (line.startsWith('8:')) {
            // Streaming data chunk (sources, etc)
            try {
              const jsonStr = line.slice(2)
              const data = JSON.parse(jsonStr)
              
              // Check if this is the sources data
              if (data && typeof data === 'object' && 'sources' in data) {
                sources = data.sources
                
                // Update the last message with sources
                setMessages(prev => {
                  const newMessages = [...prev]
                  const lastMessage = newMessages[newMessages.length - 1]
                  if (lastMessage && lastMessage.role === 'assistant') {
                    lastMessage.sources = sources
                  }
                  return newMessages
                })
              } else if (Array.isArray(data)) {
                // Legacy format support
                const sourcesData = data.find(item => item && typeof item === 'object' && 'type' in item && item.type === 'sources')
                if (sourcesData && sourcesData.sources) {
                  sources = sourcesData.sources
                }
              }
            } catch {
              console.error('Failed to parse streaming data')
            }
          } else if (line.startsWith('e:') || line.startsWith('d:')) {
            // End metadata - we can ignore these
          }
        }
      }
    } catch {
      toast.error('Kunne ikke hente svar')
      console.error('Query failed')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    // Get namespace from URL params
    const namespaceParam = searchParams.get('namespace')
    
    if (namespaceParam) {
      // Try to load data for this specific namespace
      const storedIndexes = localStorage.getItem('lejechat_indexes')
      if (storedIndexes) {
        const indexes = JSON.parse(storedIndexes)
        const matchingIndex = indexes.find((idx: { namespace: string }) => idx.namespace === namespaceParam)
        if (matchingIndex) {
          const normalizedMatch = {
            ...matchingIndex,
            slug: matchingIndex.slug || matchingIndex.namespace,
            metadata: {
              ...(matchingIndex.metadata || {}),
              quickPrompts: normalizeQuickPrompts(matchingIndex.metadata?.quickPrompts),
            },
          }
          setSiteData(normalizedMatch)
          // Also update sessionStorage for consistency
          sessionStorage.setItem('lejechat_current_data', JSON.stringify(normalizedMatch))
          // Clear messages when namespace changes
          setMessages([])
        } else {
          // Namespace not found in stored indexes
          router.push('/indexes')
        }
      } else {
        router.push('/indexes')
      }
    } else {
      // Fallback to sessionStorage if no namespace param
      const data = sessionStorage.getItem('lejechat_current_data')
      if (data) {
        const parsedData = JSON.parse(data)
        const normalizedParsed = {
          ...parsedData,
          slug: parsedData.slug || parsedData.namespace,
          metadata: {
            ...(parsedData.metadata || {}),
            quickPrompts: normalizeQuickPrompts(parsedData.metadata?.quickPrompts),
          },
        }
        setSiteData(normalizedParsed)
        // Add namespace to URL for consistency
        router.replace(`/dashboard?namespace=${parsedData.namespace}`)
      } else {
        router.push('/indexes')
      }
    }
  }, [router, searchParams])

  const scrollToBottom = () => {
    if (scrollAreaRef.current && autoScroll) {
      scrollAreaRef.current.scrollTo({
        top: scrollAreaRef.current.scrollHeight,
        behavior: 'smooth'
      })
    }
  }

  const handleDelete = () => {
    // Remove from localStorage
    const storedIndexes = localStorage.getItem('lejechat_indexes')
    if (storedIndexes && siteData) {
      const indexes = JSON.parse(storedIndexes)
      const updatedIndexes = indexes.filter((idx: { namespace: string }) => idx.namespace !== siteData.namespace)
      localStorage.setItem('lejechat_indexes', JSON.stringify(updatedIndexes))
    }
    
    sessionStorage.removeItem('lejechat_current_data')
    router.push('/indexes')
  }

  const copyToClipboard = (text: string, itemId: string) => {
    navigator.clipboard.writeText(text)
    setCopiedItem(itemId)
    setTimeout(() => setCopiedItem(null), 2000)
  }


  const namespace = siteData?.namespace ?? ''
  const slug = siteData?.slug ?? ''

  // Get dynamic API URL based on current location
  const getApiUrl = () => {
    if (typeof window === 'undefined') return 'http://localhost:3001/api/v1/chat/completions'
    const protocol = window.location.protocol
    const host = window.location.host
    return `${protocol}//${host}/api/v1/chat/completions`
  }
  const apiUrl = getApiUrl()
  
  const modelName = namespace ? `lejechat-${namespace}` : ''
  
  const embedSnippet = useMemo(() => {
    if (!slug) return ''
    if (typeof window === 'undefined') {
      return `<script src="/embed/lejechat?slug=${slug}" defer></script>`
    }
    return `<script src="${window.location.origin}/embed/lejechat?slug=${slug}" defer></script>`
  }, [slug])

  const lastIndexedTimestamp = siteData?.createdAt || siteData?.crawlDate || ''
  const lastIndexedText = useMemo(() => {
    if (!lastIndexedTimestamp) return 'Ukendt'
    const date = new Date(lastIndexedTimestamp)
    if (Number.isNaN(date.getTime())) return 'Ukendt'
    return date.toLocaleString('da-DK', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  }, [lastIndexedTimestamp])

  const isIndexing = siteData?.crawlComplete === false
  const crawlStatusLabel = isIndexing ? 'Indekserer indhold' : 'Klar til spørgsmål'
  const crawlStatusClasses = isIndexing
    ? 'bg-amber-100 text-amber-700 border border-amber-200'
    : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
  const crawlStatusDescription = isIndexing
    ? 'Vi henter stadig sider – svarene bliver endnu bedre om et øjeblik.'
    : 'Denne chatbot bruger den seneste import og kan deles med lejere med det samme.'

  if (!siteData) {
    return (
      <div className="min-h-screen bg-[#FBFAF9] flex items-center justify-center">
        <div className="text-gray-600">Indlæser...</div>
      </div>
    )
  }
  
  const curlCommand = `# Standardforespørgsel
curl ${apiUrl} \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_LEJECHAT_API_KEY" \\
  -d '{
    "model": "${modelName}",
    "messages": [
      {"role": "user", "content": "Dit spørgsmål her"}
    ]
  }'

# Streamingforespørgsel (SSE-format)
curl ${apiUrl} \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_LEJECHAT_API_KEY" \\
  -H "Accept: text/event-stream" \\
  -N \\
  -d '{
    "model": "${modelName}",
    "messages": [
      {"role": "user", "content": "Dit spørgsmål her"}
    ],
    "stream": true
  }'`
  
  const openaiJsCode = `import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: 'YOUR_LEJECHAT_API_KEY',
  baseURL: '${apiUrl.replace('/chat/completions', '')}',
});

const completion = await openai.chat.completions.create({
  model: '${modelName}',
  messages: [
    { role: 'user', content: 'Dit spørgsmål her' }
  ],
});

console.log(completion.choices[0].message.content);

// Streaming-eksempel
const stream = await openai.chat.completions.create({
  model: '${modelName}',
  messages: [
    { role: 'user', content: 'Dit spørgsmål her' }
  ],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || '');
}`
  
const openaiPythonCode = `from openai import OpenAI

client = OpenAI(
    api_key="YOUR_LEJECHAT_API_KEY",
    base_url="${apiUrl.replace('/chat/completions', '')}"
)

completion = client.chat.completions.create(
    model="${modelName}",
    messages=[
        {"role": "user", "content": "Dit spørgsmål her"}
    ]
)

print(completion.choices[0].message.content)

# Streaming-eksempel
stream = client.chat.completions.create(
    model="${modelName}",
    messages=[
        {"role": "user", "content": "Dit spørgsmål her"}
    ],
    stream=True
)

for chunk in stream:
    if chunk.choices[0].delta.content is not None:
        print(chunk.choices[0].delta.content, end="")`
  
const jsCode = `// Using fetch API
const response = await fetch('${apiUrl}', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_LEJECHAT_API_KEY'
  },
  body: JSON.stringify({
    model: '${modelName}',
    messages: [
      { role: 'user', content: 'Dit spørgsmål her' }
    ]
  })
});

const data = await response.json();
console.log(data.choices[0].message.content);`
  
const pythonCode = `import requests

response = requests.post(
    '${apiUrl}',
    headers={
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YOUR_LEJECHAT_API_KEY'
    },
    json={
        'model': '${modelName}',
        'messages': [
            {'role': 'user', 'content': 'Dit spørgsmål her'}
        ]
    }
)

data = response.json()
print(data['choices'][0]['message']['content'])`
  

  return (
    <div className="min-h-screen bg-[#FBFAF9]">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/indexes')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div className="flex items-center gap-3">
                {siteData.metadata.favicon ? (
                  <Image 
                    src={siteData.metadata.favicon} 
                    alt={siteData.metadata.title}
                    width={32}
                    height={32}
                    className="w-8 h-8"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.parentElement?.querySelector('.fallback-icon')?.classList.remove('hidden');
                    }}
                  />
                ) : (
                  <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                    <Globe className="w-5 h-5 text-gray-400" />
                  </div>
                )}
                <div>
                  <h1 className="text-xl font-semibold text-[#36322F]">
                    {siteData.metadata.title.length > 50 
                      ? siteData.metadata.title.substring(0, 47) + '...' 
                      : siteData.metadata.title}
                  </h1>
                  <p className="text-sm text-gray-600">{siteData.url}</p>
                </div>
              </div>
            </div>
            
            <Button
              onClick={() => setShowDeleteModal(true)}
              variant="code"
              size="sm"
            >
              Slet
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex flex-col lg:flex-row gap-6 lg:h-[600px]">
          {/* Stats Cards - Show at top on mobile */}
          <div className="lg:w-1/4 flex flex-col gap-4 lg:h-full">
            <div className="relative bg-white rounded-xl border border-gray-200 overflow-hidden flex-1">
              {/* OG Image Background */}
              {siteData.metadata.ogImage && (
                <div className="absolute inset-0 z-0">
                  <Image 
                    src={siteData.metadata.ogImage} 
                    alt=""
                    fill
                    className="object-contain opacity-30"
                    onError={(e) => {
                      e.currentTarget.parentElement!.style.display = 'none';
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-br from-white/70 via-white/60 to-white/70"></div>
                </div>
              )}
              
              <div className="relative z-10 p-6 h-full flex flex-col">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-[#36322F]">
                    {siteData.metadata.title.length > 30 
                      ? siteData.metadata.title.substring(0, 27) + '...' 
                      : siteData.metadata.title}
                  </h2>
                  <p className="text-xs text-gray-600">Vidensbase</p>
                </div>
                
                <div className="space-y-2 flex-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-gray-700">
                      <FileText className="w-4 h-4" />
                      <span className="text-sm font-medium">Sider</span>
                    </div>
                    <span className="text-lg font-semibold text-[#36322F]">{siteData.pagesCrawled}</span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-gray-700">
                      <Database className="w-4 h-4" />
                      <span className="text-sm font-medium">Tekststykker</span>
                    </div>
                    <span className="text-lg font-semibold text-[#36322F]">{Math.round(siteData.pagesCrawled * 3)}</span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-gray-700">
                      <Globe className="w-4 h-4" />
                      <span className="text-sm font-medium">Navnerum</span>
                    </div>
                    <span className="text-xs font-mono text-gray-800 break-all">{siteData.namespace.split('-').slice(0, -1).join('.')}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-700">Status</span>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${crawlStatusClasses}`}>
                  {crawlStatusLabel}
                </span>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                {crawlStatusDescription}
              </p>
              <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-500">
                <span className="block text-gray-600 font-medium">Senest opdateret</span>
                <span className="block text-gray-700 mt-1">{lastIndexedText}</span>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
              <h2 className="text-lg font-semibold text-[#36322F] mb-2">Starterspørgsmål</h2>
              <p className="text-xs text-gray-600 mb-4">
                Vælg de tre spørgsmål lejere oftest stiller. De vises i chat-knappen som hurtige genveje.
              </p>
              <div className="space-y-3">
                {promptFields.map((prompt, index) => (
                  <div key={index}>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Spørgsmål {index + 1}</label>
                    <Input
                      value={prompt}
                      onChange={(event) => handlePromptChange(index, event.target.value)}
                      placeholder={`F.eks. ${DEFAULT_QUICK_PROMPTS[index]}`}
                      disabled={savingPrompts}
                    />
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-2 mt-4">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={resetPrompts}
                  disabled={savingPrompts}
                >
                  Nulstil til standard
                </Button>
                <Button
                  type="button"
                  variant="orange"
                  size="sm"
                  onClick={persistQuickPrompts}
                  disabled={!hasPromptChanges || savingPrompts}
                >
                  {savingPrompts ? 'Gemmer…' : 'Gem starterspørgsmål'}
                </Button>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 border border-gray-200 flex flex-col flex-1">
              <h2 className="text-lg font-semibold text-[#36322F] mb-4">Hurtig start</h2>
              <div className="space-y-4 flex-1">
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">1. Test i dashboardet</h3>
                  <p className="text-xs text-gray-600">Brug chatpanelet til at teste svar og justere dine spørgsmål</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">2. Få API-adgang</h3>
                  <p className="text-xs text-gray-600">Se integrationskode på flere sprog nedenfor</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">3. Implementer hvor som helst</h3>
                  <p className="text-xs text-gray-600">Udrul chatbot-script eller OpenAI-kompatibelt endpoint</p>
                </div>
              </div>
              <div className="mt-8">
                <Button
                  onClick={() => setShowApiModal(true)}
                  variant="orange"
                  className="w-full"
                >
                  Vis integrationskode
                </Button>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 border border-dashed border-gray-300 flex flex-col gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[#36322F] mb-2">Indsæt på dit website</h2>
                <p className="text-xs text-gray-600">
                  Kopier scriptet og placer det lige før <code>&lt;/body&gt;</code> for at få Lejechat som flydende chatknap.
                </p>
              </div>
              <div className="flex items-start gap-2">
                <code className="block rounded-md bg-gray-100 px-3 py-2 text-[11px] text-gray-700 leading-5 flex-1 whitespace-pre-wrap">{embedSnippet}</code>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(embedSnippet)
                      setCopiedSnippet(true)
                      setTimeout(() => setCopiedSnippet(false), 2000)
                    } catch {
                      toast.error('Kunne ikke kopiere snippet')
                    }
                  }}
                >
                  {copiedSnippet ? 'Kopieret' : 'Kopier'}
                </Button>
              </div>
              <p className="text-xs text-gray-500">Tilpas farve, tekst og placering via URL-parametre `accent`, `label` og `position=bottom-left`.</p>
            </div>
          </div>

          {/* Chat Panel and Kilder - Show below on mobile */}
          <div className="lg:w-3/4 lg:h-full">
            <div className="flex flex-col lg:flex-row gap-6 lg:h-full">
              {/* Chat Panel */}
              <div className="w-full lg:w-2/3 bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden h-[500px] lg:h-full">
                <div ref={scrollAreaRef} className="flex-1 overflow-y-auto p-6 pb-0">
                  {messages.length === 0 && (
                    <div className="text-center py-20">
                      <div className="mb-4">
                        {siteData.metadata.favicon && (
                          <Image 
                            src={siteData.metadata.favicon} 
                            alt={siteData.metadata.title}
                            width={64}
                            height={64}
                            className="w-16 h-16 mx-auto mb-4 opacity-50"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        )}
                      </div>
                      <h3 className="text-lg font-semibold text-[#36322F] mb-2">
                        Chat med {siteData.metadata.title}
                      </h3>
                      <p className="text-gray-600">
                        Spørg om deres {siteData.pagesCrawled} indekserede sider
                      </p>
                      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                        {suggestionPrompts.map((prompt, index) => (
                          <button
                            key={`${prompt}-${index}`}
                            type="button"
                            onClick={() => {
                              if (isLoading) return
                              setInput(prompt)
                              setTimeout(() => {
                                chatFormRef.current?.requestSubmit()
                              }, 0)
                            }}
                            className="px-4 py-2 rounded-full border border-orange-200 bg-orange-50 text-sm text-orange-600 hover:bg-orange-100 transition disabled:opacity-50"
                            disabled={isLoading}
                          >
                            {prompt}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                
                  {messages.map((message, index) => (
              <div
                key={index}
                className={`mb-6 ${message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}`}
              >
                <div className={`max-w-[85%] ${message.role === 'user' ? 'ml-12' : 'mr-12'}`}>
                  <div
                    className={`px-5 py-4 rounded-2xl ${
                      message.role === 'user'
                        ? 'bg-orange-500 text-white'
                        : 'bg-white border border-gray-200 text-gray-800 shadow-sm'
                    }`}
                  >
                    {message.role === 'user' ? (
                      <p className="text-[15px] leading-relaxed">{message.content}</p>
                    ) : (
                      <div className="prose prose-sm max-w-none prose-gray">
                        <MarkdownContent 
                          content={message.content} 
                          isStreaming={isLoading && index === messages.length - 1 && message.content !== ''}
                        />
                      </div>
                    )}
                  </div>
                
                </div>
              </div>
              ))}
              
              {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
                <div className="flex justify-start mb-6">
                  <div className="max-w-[85%] mr-12">
                    <div className="px-5 py-4 rounded-2xl bg-white border border-gray-200 text-gray-800 shadow-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                        <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse delay-75" />
                        <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse delay-150" />
                      </div>
                    </div>
                  </div>
                </div>
              )}
                </div>
                
                
                <form ref={chatFormRef} onSubmit={handleSubmit} className="p-4 border-t border-gray-200">
                  <div className="relative">
                    <Input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder={`Spørg til ${siteData.metadata.title}...`}
                      className="w-full pr-12 placeholder:text-gray-400"
                      disabled={isLoading}
                    />
                    <button
                      type="submit"
                      disabled={isLoading || !input.trim()}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-orange-600 hover:text-orange-700 disabled:opacity-50 transition-colors"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </form>
              </div>
              
              {/* Kilder Panel - Shows on right side when available */}
              <div className="hidden lg:block lg:w-1/3">
                <div className="bg-white rounded-xl p-6 border border-gray-200 flex flex-col h-full overflow-hidden">
                  {(() => {
                    const lastAssistantMessage = messages.filter(m => m.role === 'assistant').pop()
                    const hasSources = lastAssistantMessage?.sources && lastAssistantMessage.sources.length > 0
                    
                    if (hasSources) {
                      return (
                        <>
                          <div className="flex items-center justify-between mb-4 animate-fade-in">
                            <h2 className="text-lg font-semibold text-[#36322F] flex items-center gap-2">
                              <BookOpen className="w-5 h-5 text-orange-500" />
                              Kilder
                            </h2>
                            <span className="text-xs text-gray-500 bg-orange-50 px-2 py-1 rounded-full">
                              {lastAssistantMessage.sources?.length || 0} henvisninger
                            </span>
                          </div>
                          
                          <div className="space-y-3 flex-1 overflow-y-auto">
                            {lastAssistantMessage.sources?.map((source, idx) => (
                              <a
                                key={idx}
                                href={source.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block p-4 bg-gradient-to-br from-gray-50 to-gray-100 hover:from-orange-50 hover:to-orange-100 rounded-lg border border-gray-200 hover:border-orange-300 transition-all duration-300 group animate-fade-in hover:shadow-md"
                                style={{
                                  animationDelay: `${idx * 100}ms`,
                                  animationDuration: '0.5s',
                                  animationFillMode: 'both'
                                }}
                              >
                                <div className="flex items-start gap-3">
                                  <span className="text-sm font-medium text-orange-500 flex-shrink-0 bg-orange-100 w-8 h-8 rounded-full flex items-center justify-center">
                                    {idx + 1}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <h4 className="text-sm font-medium text-gray-800 group-hover:text-orange-600 transition-colors line-clamp-2 mb-1">
                                      {source.title}
                                    </h4>
                                    {source.snippet && (
                                      <p className="text-xs text-gray-600 line-clamp-3 mb-2 leading-relaxed">
                                        {source.snippet}
                                      </p>
                                    )}
                                    <p className="text-xs text-gray-500 truncate flex items-center gap-1 group-hover:text-orange-500 transition-colors">
                                      <ExternalLink className="w-3 h-3" />
                                      {new URL(source.url).hostname}
                                    </p>
                                  </div>
                                </div>
                              </a>
                            ))}
                          </div>
                        </>
                      )
                    }
                    
                    // Default knowledge base view when no sources
                    return (
                      <>
                        <div className="flex items-center justify-between mb-4">
                          <h2 className="text-lg font-semibold text-[#36322F] flex items-center gap-2">
                            <Database className="w-5 h-5 text-gray-400" />
                            Vidensbase
                          </h2>
                        </div>
                        
                        <div className="space-y-3 p-3 flex-1">
                          <div className="text-center py-8">
                            <div className="relative">
                              <Database className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-20 h-20 bg-gray-200 rounded-full animate-ping opacity-20"></div>
                              </div>
                            </div>
                            <p className="text-sm font-medium text-gray-700 mb-1">
                              {siteData.pagesCrawled} indekserede sider
                            </p>
                            <p className="text-xs text-gray-500 mb-6">
                              Klar til at besvare spørgsmål om {siteData.metadata.title}
                            </p>
                            <div className="space-y-2 text-left">
                              <div className="flex items-center justify-between p-3 bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg border border-gray-200">
                                <span className="text-xs text-gray-600">Samlede tekststykker</span>
                                <span className="text-xs font-medium text-gray-800 bg-white px-2 py-1 rounded">
                                  {Math.round(siteData.pagesCrawled * 3)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between p-3 bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg border border-gray-200">
                                <span className="text-xs text-gray-600">Indekseringsdato</span>
                                <span className="text-xs font-medium text-gray-800 bg-white px-2 py-1 rounded">
                                  {(() => {
                                    const dateString = siteData.crawlDate || siteData.createdAt;
                                    return dateString ? new Date(dateString).toLocaleDateString('da-DK') : 'Ikke tilgængelig';
                                  })()}
                                </span>
                              </div>
                              <div className="flex items-center justify-between p-3 bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg border border-gray-200">
                                <span className="text-xs text-gray-600">Navnerum</span>
                                <span className="text-xs font-mono text-gray-800 truncate max-w-[140px] bg-white px-2 py-1 rounded">
                                  {siteData.namespace.split('-').slice(0, -1).join('.')}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </>
                    )
                  })()}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`/chat/${siteData.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2">
                  <ExternalLink className="w-4 h-4" />
                  Åbn offentlig chatbot
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Slet Confirmation Modal */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent className="sm:max-w-md bg-white z-50">
          <DialogHeader>
            <DialogTitle>Slet indeks</DialogTitle>
            <DialogDescription>
              Er du sikker på, at du vil slette indekset for {siteData.metadata.title}? Denne handling kan ikke fortrydes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2">
            <Button
              variant="code"
              onClick={() => setShowDeleteModal(false)}
              className="font-medium"
            >
              Annuller
            </Button>
            <Button
              variant="orange"
              onClick={handleDelete}
              className="font-medium"
            >
              Slet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* API Modal */}
      <Dialog open={showApiModal} onOpenChange={setShowApiModal}>
        <DialogContent className="sm:max-w-3xl bg-white z-50 max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>API-adgang</DialogTitle>
            <DialogDescription>
              Brug dette indeks med enhver OpenAI-kompatibel API-klient.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3 mb-6">
            <div>
              <span className="text-sm text-gray-600">Modelnavn:</span>
              <code className="ml-2 text-sm text-orange-600">{modelName}</code>
            </div>
            <div>
              <span className="text-sm text-gray-600">Endpoint:</span>
              <code className="ml-2 text-sm text-gray-700">/api/v1/chat/completions</code>
            </div>
          </div>
          
          {/* Language tabs */}
          <div className="mb-6">
            <div className="flex flex-wrap gap-2 mb-6 p-1 bg-gray-100 rounded-lg">
              <button
                onClick={() => setActiveTab('curl')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                  activeTab === 'curl'
                    ? 'bg-white text-orange-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                cURL
              </button>
              <button
                onClick={() => setActiveTab('openai-js')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                  activeTab === 'openai-js'
                    ? 'bg-white text-orange-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                OpenAI JS
              </button>
              <button
                onClick={() => setActiveTab('openai-python')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                  activeTab === 'openai-python'
                    ? 'bg-white text-orange-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                OpenAI Python
              </button>
              <button
                onClick={() => setActiveTab('javascript')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                  activeTab === 'javascript'
                    ? 'bg-white text-orange-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                JavaScript
              </button>
              <button
                onClick={() => setActiveTab('python')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                  activeTab === 'python'
                    ? 'bg-white text-orange-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                Python
              </button>
            </div>
            
            {/* Tab content */}
            <div className="bg-gray-900 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-300">
                  {activeTab === 'curl' && 'cURL-kommando'}
                  {activeTab === 'javascript' && 'JavaScript (Fetch API)'}
                  {activeTab === 'python' && 'Python (Requests)'}
                  {activeTab === 'openai-js' && 'OpenAI SDK til JavaScript'}
                  {activeTab === 'openai-python' && 'OpenAI SDK til Python'}
                </span>
                <button
                  onClick={() => copyToClipboard(
                    activeTab === 'curl' ? curlCommand : 
                    activeTab === 'javascript' ? jsCode : 
                    activeTab === 'python' ? pythonCode :
                    activeTab === 'openai-js' ? openaiJsCode :
                    openaiPythonCode, 
                    activeTab
                  )}
                  className="text-sm text-orange-400 hover:text-orange-300 flex items-center gap-1 transition-colors"
                >
                  {copiedItem === activeTab ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copiedItem === activeTab ? 'Kopieret!' : 'Kopier'}
                </button>
              </div>
              <pre className="text-sm text-gray-100 overflow-x-auto">
                <code className="language-bash">
                  {activeTab === 'curl' && curlCommand}
                  {activeTab === 'javascript' && jsCode}
                  {activeTab === 'python' && pythonCode}
                  {activeTab === 'openai-js' && openaiJsCode}
                  {activeTab === 'openai-python' && openaiPythonCode}
                </code>
              </pre>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-yellow-50 to-red-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-center items-center min-h-[60vh]">
            <div className="text-center">
              <div className="w-12 h-12 text-orange-600 mx-auto mb-4 animate-spin">
                <Database className="w-full h-full" />
              </div>
              <p className="text-gray-600">Indlæser dashboard...</p>
            </div>
          </div>
        </div>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  )
}
