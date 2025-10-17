'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MarkdownContent } from '@/components/chat/markdown-content'
import { ArrowLeft, Copy, Check, ExternalLink, Send } from 'lucide-react'
import { toast } from 'sonner'
import { useSearchParams } from 'next/navigation'
import { DEFAULT_QUICK_PROMPTS, normalizeQuickPrompts } from '@/lib/quick-prompts'

type Message = {
  role: 'user' | 'assistant'
  content: string
  sources?: Source[]
}

type Source = {
  url: string
  title: string
  snippet: string
}

type PublicSiteData = {
  url: string
  namespace: string
  slug: string
  pagesCrawled: number
  metadata: {
    title?: string
    description?: string
    favicon?: string
    ogImage?: string
    quickPrompts?: string[]
  }
}

const fallbackMetaTitle = (url: string) => {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

const createFallbackSiteData = (slug: string): PublicSiteData => {
  let url = slug
  try {
    url = slug.includes('.') ? `https://${slug}` : `https://${slug.replace(/-/g, '.')}`
  } catch {
    url = slug
  }
  return {
    url,
    namespace: slug,
    slug,
    pagesCrawled: 0,
    metadata: {
      quickPrompts: DEFAULT_QUICK_PROMPTS,
    },
  }
}

export default function PublicChat({ slug }: { slug: string }) {
  const searchParams = useSearchParams()
  const isEmbed = searchParams?.has('embed')
  const [siteData, setSiteData] = useState<PublicSiteData | null>(null)
  const [loading, setLoading] = useState(true)
  const [metaWarning, setMetaWarning] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)
  const assistantIndexRef = useRef<number | null>(null)
  const suggestionPrompts = useMemo(() => {
    const prompts = siteData?.metadata?.quickPrompts
    return normalizeQuickPrompts(prompts ?? DEFAULT_QUICK_PROMPTS)
  }, [siteData?.metadata?.quickPrompts])

  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') return ''
    return `${window.location.origin}/chat/${slug}`
  }, [slug])

  useEffect(() => {
    const fetchMeta = async () => {
      try {
        setLoading(true)
        const res = await fetch(`/api/lejechat/meta/${slug}`)
        if (!res.ok) {
          if (res.status === 404) {
            setMetaWarning('Chatbot metadata blev ikke fundet – vi bruger standardindstillinger.')
            setSiteData(createFallbackSiteData(slug))
            return
          }
          throw new Error('Kunne ikke hente chatbot metadata')
        }
        const data = await res.json()
        setSiteData({
          ...data.index,
          metadata: data.index.metadata || {},
        })
      } catch (err) {
        console.error(err)
        setMetaWarning('Kunne ikke hente fuld metadata – chatbotten bruger standardnavn og link.')
        setSiteData(createFallbackSiteData(slug))
      } finally {
        setLoading(false)
      }
    }

    fetchMeta()
  }, [slug])

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight
    }
  }, [messages])

  const handleCopyLink = async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      toast.success('Link kopieret')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Kunne ikke kopiere linket')
    }
  }

  const updateAssistantMessage = (updater: (message: Message) => Message) => {
    setMessages((prev) => {
      if (assistantIndexRef.current === null) return prev
      const next = [...prev]
      const existing = next[assistantIndexRef.current]
      if (!existing || existing.role !== 'assistant') {
        return prev
      }
      next[assistantIndexRef.current] = updater(existing)
      return next
    })
  }

  const recordInteraction = (userText: string) => {
    if (typeof window === 'undefined' || !siteData) return
    try {
      const key = 'lejechat_recent_interactions'
      const existing = window.localStorage.getItem(key)
      const parsed: Array<{ slug: string; message: string; origin: string; timestamp: string }> = existing ? JSON.parse(existing) : []
      const entry = {
        slug: siteData.slug,
        message: userText,
        origin: 'public',
        timestamp: new Date().toISOString(),
      }
      const updated = [entry, ...parsed].slice(0, 20)
      window.localStorage.setItem(key, JSON.stringify(updated))
    } catch (error) {
      console.warn('Kunne ikke gemme interaktion til diagnosticering', error)
    }
  }

  const sendMessage = async (rawText: string) => {
    if (!rawText.trim() || !siteData || isLoading) return

    const messageText = rawText.trim()
    const userMessage: Message = { role: 'user', content: messageText }
    setMessages((prev) => {
      const updated = [...prev, userMessage, { role: 'assistant', content: '', sources: [] }]
      assistantIndexRef.current = updated.length - 1
      return updated
    })
    setIsLoading(true)
    recordInteraction(messageText)

    try {
      const response = await fetch('/api/lejechat/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [userMessage],
          namespace: siteData.namespace,
          stream: false,
        }),
      })

      if (!response.ok) {
        let errorMessage = 'Kunne ikke hente svar'
        try {
          const errorData = await response.json()
          errorMessage = errorData?.error || errorData?.answer || errorMessage
        } catch {
          // ignore JSON parse errors
        }
        throw new Error(errorMessage)
      }

      const contentType = response.headers.get('content-type') || ''

      if (contentType.includes('application/json')) {
        const payload = await response.json()
        const answer = payload?.answer || payload?.error || 'Chatbotten kunne ikke danne et svar.'
        const sources = Array.isArray(payload?.sources) ? payload.sources : []

        updateAssistantMessage((existing) => ({
          ...existing,
          content: answer,
          sources,
        }))
        return
      }

      if (!response.body) {
        throw new Error('Chatbotten returnerede ingen data')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let content = ''
      let sources: Source[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (!line.trim()) continue

          if (line.startsWith('0:')) {
            const textContent = line.slice(2)
            if (textContent.startsWith('"') && textContent.endsWith('"')) {
              const text = JSON.parse(textContent)
              content += text
              updateAssistantMessage((existing) => ({
                ...existing,
                content,
                sources,
              }))
            }
          } else if (line.startsWith('8:')) {
            try {
              const jsonStr = line.slice(2)
              const data = JSON.parse(jsonStr)
              if (data && typeof data === 'object' && 'sources' in data) {
                sources = data.sources
                updateAssistantMessage((existing) => ({
                  ...existing,
                  sources,
                }))
              }
            } catch (err) {
              console.error('Kunne ikke parse streamingdata', err)
            }
          }
        }
      }

      if (!content.trim()) {
        updateAssistantMessage((existing) => ({
          ...existing,
          content: 'Chatbotten kunne ikke levere et svar. Prøv igen om et øjeblik.',
          sources,
        }))
      }
    } catch (err) {
      console.error(err)
      const fallbackMessage = err instanceof Error ? err.message : 'Kunne ikke hente svar'
      toast.error(fallbackMessage)
      updateAssistantMessage((existing) => ({
        ...existing,
        content: fallbackMessage,
        sources: [],
      }))
    } finally {
      setIsLoading(false)
      assistantIndexRef.current = null
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const value = input.trim()
    if (!value) return
    setInput('')
    await sendMessage(value)
  }

  const handleSuggestionClick = (suggestion: string) => {
    void sendMessage(suggestion)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FBFAF9]">
        <p className="text-gray-600">Indlæser chatbot...</p>
      </div>
    )
  }

  if (!isEmbed && !siteData && !metaWarning) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FBFAF9] px-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold text-[#36322F] mb-4">Ups!</h1>
          <p className="text-gray-600 mb-6">Chatbotten kunne ikke findes.</p>
          <Button asChild variant="orange">
            <Link href="/">Tilbage til forsiden</Link>
          </Button>
        </div>
      </div>
    )
  }

  const title = siteData.metadata.title || fallbackMetaTitle(siteData.url)
  let visitUrl = siteData.url
  try {
    const parsed = new URL(visitUrl)
    visitUrl = parsed.toString()
  } catch {
    visitUrl = `https://${visitUrl.replace(/^https?:\/\//, '')}`
  }

  return (
    <div className="min-h-screen bg-[#FBFAF9]">
      {!isEmbed && (
        <header className="border-b border-gray-200 bg-white/80 backdrop-blur">
          <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Link href="/" className="hidden md:inline-flex">
                <ArrowLeft className="w-5 h-5 text-gray-500" />
              </Link>
              <div>
                <h1 className="text-lg font-semibold text-[#36322F]">{title}</h1>
                <p className="text-sm text-gray-500 truncate">{siteData.url}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleCopyLink}>
                {copied ? (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Kopieret
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" />
                    Kopier link
                  </>
                )}
              </Button>
              <Button asChild variant="orange" size="sm">
                <Link href={visitUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2">
                  <ExternalLink className="w-4 h-4" />
                  Besøg website
                </Link>
              </Button>
            </div>
          </div>
        </header>
      )}

      <main className="max-w-5xl mx-auto px-4 py-8">
        {metaWarning && !isEmbed && (
          <div className="mb-4 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-700">
            {metaWarning}
          </div>
        )}
        <div className={`grid gap-6 ${isEmbed ? '' : 'lg:grid-cols-[2fr,1fr]'}`}>
          <section className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col h-[600px]">
            <div ref={scrollAreaRef} className="flex-1 overflow-y-auto p-6 space-y-6">
              {messages.length === 0 ? (
                <div className="text-center text-gray-600 py-20">
                  <p>Stil dit første spørgsmål om {title}.</p>
                  <div className="mt-6 flex flex-wrap justify-center gap-2">
                    {suggestionPrompts.map((suggestion, index) => (
                      <button
                        key={`${suggestion}-${index}`}
                        type="button"
                        onClick={() => handleSuggestionClick(suggestion)}
                        className="px-4 py-2 text-sm rounded-full border border-orange-200 text-orange-600 bg-orange-50 hover:bg-orange-100 transition"
                        disabled={isLoading}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((message, index) => (
                  <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-5 py-4 ${message.role === 'user' ? 'bg-orange-500 text-white' : 'bg-white border border-gray-200 text-gray-800 shadow-sm'}`}>
                      {message.role === 'user' ? (
                        <p className="text-[15px] leading-relaxed">{message.content}</p>
                      ) : (
                        <div className="prose prose-sm max-w-none prose-gray">
                          <MarkdownContent content={message.content} isStreaming={isLoading && index === messages.length - 1} />
                          {message.sources && message.sources.length > 0 && (
                            <div className="mt-4 border-t border-gray-200 pt-3 space-y-2">
                              <p className="text-sm font-medium text-gray-700">Kilder</p>
                              {message.sources.map((source, idx) => (
                                <a key={idx} href={source.url} target="_blank" rel="noopener noreferrer" className="block text-sm text-orange-600 hover:text-orange-700">
                                  {idx + 1}. {source.title}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="px-4 py-3 rounded-2xl bg-white border border-gray-200 text-gray-800 shadow-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" />
                      <span className="w-2 h-2 bg-orange-500 rounded-full animate-bounce [animation-delay:150ms]" />
                      <span className="w-2 h-2 bg-orange-500 rounded-full animate-bounce [animation-delay:300ms]" />
                    </div>
                  </div>
                </div>
              )}
            </div>
            <form onSubmit={handleSubmit} className="border-t border-gray-200 p-4">
              <div className="relative">
                <Input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={`Spørg til ${title}...`}
                  className="w-full pr-12"
                  disabled={isLoading}
                />
                <button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-orange-500 text-white hover:bg-orange-600 px-3 py-2 text-sm font-medium transition disabled:opacity-50"
                >
                  <div className="flex items-center gap-1">
                    <Send className="w-4 h-4" />
                    Send
                  </div>
                </button>
              </div>
            </form>
          </section>

          {!isEmbed && (
            <aside className="space-y-4">
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  {siteData.metadata.favicon ? (
                    <Image src={siteData.metadata.favicon} alt="favicon" width={36} height={36} className="rounded" />
                  ) : null}
                  <div>
                    <p className="text-sm font-semibold text-[#36322F]">{title}</p>
                    <p className="text-xs text-gray-500 truncate">{siteData.url}</p>
                  </div>
                </div>
                <div className="space-y-2 text-sm text-gray-600">
                  <p className="flex items-center justify-between">
                    <span>Sider indekseret</span>
                    <span>{siteData.pagesCrawled}</span>
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-dashed border-gray-300 bg-white/70 p-6 text-sm text-gray-600">
                <p className="font-semibold text-[#36322F] mb-2">Del chatbotten</p>
                <p className="mb-3">Send linket til kolleger eller til lejere, så de kan teste assistenten.</p>
                <code className="block truncate rounded-md bg-gray-100 px-3 py-2 text-xs text-gray-700">{shareUrl}</code>
              </div>
            </aside>
          )}
        </div>
      </main>
    </div>
  )
}
