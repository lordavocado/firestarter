'use client'

import { useEffect } from 'react'

interface MarkdownContentProps {
  content: string
  onSourceClick?: (index: number) => void
  isStreaming?: boolean
}

export function MarkdownContent({ content, onSourceClick, isStreaming = false }: MarkdownContentProps) {
  const parseMarkdown = (text: string) => {
    const codeBlocks: string[] = []
    let parsed = text.replace(/```([\s\S]*?)```/g, (_, code) => {
      const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`
      codeBlocks.push(`<pre class="bg-gray-50 border border-gray-200 p-4 rounded-lg overflow-x-auto my-4 text-sm"><code>${code.trim()}</code></pre>`)
      return placeholder
    })

    parsed = parsed.replace(/`([^`]+)`/g, '<code class="bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded text-sm font-mono">$1</code>')

    parsed = parsed.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-orange-600 hover:text-orange-700 underline">$1</a>')

    parsed = parsed.replace(/\[(\d+)\]/g, (_, num) => {
      return `<sup class="citation text-orange-600 cursor-pointer hover:text-orange-700 font-medium" data-citation="${num}">[${num}]</sup>`
    })

    parsed = parsed.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-gray-900">$1</strong>')
    parsed = parsed.replace(/\*(.+?)\*/g, '<em>$1</em>')

    const lines = parsed.split('\n')
    const processedLines = []
    let inList = false
    let listType = ''
    let inParagraph = false

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      const nextLine = i < lines.length - 1 ? lines[i + 1].trim() : ''

      if (line.match(/^#{1,3}\s/)) {
        if (inParagraph) {
          processedLines.push('</p>')
          inParagraph = false
        }
        if (line.match(/^###\s(.+)$/)) {
          processedLines.push(line.replace(/^###\s(.+)$/, '<h3 class="text-base font-semibold mt-4 mb-2 text-gray-900">$1</h3>'))
        } else if (line.match(/^##\s(.+)$/)) {
          processedLines.push(line.replace(/^##\s(.+)$/, '<h2 class="text-lg font-semibold mt-5 mb-3 text-gray-900">$1</h2>'))
        } else if (line.match(/^#\s(.+)$/)) {
          processedLines.push(line.replace(/^#\s(.+)$/, '<h1 class="text-xl font-bold mt-6 mb-3 text-gray-900">$1</h1>'))
        }
        continue
      }

      const bulletMatch = line.match(/^[-*]\s(.+)$/)
      const numberedMatch = line.match(/^(\d+)\.\s(.+)$/)

      if (bulletMatch || numberedMatch) {
        if (inParagraph) {
          processedLines.push('</p>')
          inParagraph = false
        }

        const newListType = bulletMatch ? 'ul' : 'ol'
        if (!inList) {
          listType = newListType
          processedLines.push(`<${listType} class="${listType === 'ul' ? 'list-disc' : 'list-decimal'} ml-6 my-3 space-y-1">`)
          inList = true
        } else if (listType !== newListType) {
          processedLines.push(`</${listType}>`)
          listType = newListType
          processedLines.push(`<${listType} class="${listType === 'ul' ? 'list-disc' : 'list-decimal'} ml-6 my-3 space-y-1">`)
        }

        const itemContent = bulletMatch ? bulletMatch[1] : numberedMatch![2]
        processedLines.push(`<li class="text-gray-700 leading-relaxed">${itemContent}</li>`)
        continue
      } else if (inList && line === '') {
        processedLines.push(`</${listType}>`)
        inList = false
        continue
      }

      if (line === '') {
        if (inParagraph) {
          processedLines.push('</p>')
          inParagraph = false
        }
        if (inList) {
          processedLines.push(`</${listType}>`)
          inList = false
        }
        continue
      }

      if (!inParagraph && !inList && !line.startsWith('<')) {
        processedLines.push('<p class="text-gray-700 leading-relaxed mb-3">')
        inParagraph = true
      }

      if (inParagraph) {
        processedLines.push(line + (nextLine && !nextLine.match(/^[-*#]|\d+\./) ? ' ' : ''))
      } else {
        processedLines.push(line)
      }
    }

    if (inParagraph) {
      processedLines.push('</p>')
    }
    if (inList) {
      processedLines.push(`</${listType}>`)
    }

    parsed = processedLines.join('\n')

    codeBlocks.forEach((block, index) => {
      parsed = parsed.replace(`__CODE_BLOCK_${index}__`, block)
    })

    return parsed
  }

  useEffect(() => {
    const citations = document.querySelectorAll('.citation')
    citations.forEach(citation => {
      citation.addEventListener('click', (e) => {
        const citationNum = parseInt((e.target as HTMLElement).getAttribute('data-citation') || '0')
        if (onSourceClick && citationNum > 0) {
          onSourceClick(citationNum - 1)
        }
      })
    })

    return () => {
      citations.forEach(citation => {
        citation.removeEventListener('click', () => {})
      })
    }
  }, [content, onSourceClick])

  return (
    <div className="relative">
      <div 
        className="prose prose-sm max-w-none prose-gray prose-headings:text-gray-900 prose-p:text-gray-700 prose-strong:text-gray-900 prose-code:text-orange-600 prose-code:bg-orange-50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-gray-100 prose-pre:text-gray-800 prose-li:text-gray-700 prose-a:text-orange-600 prose-a:no-underline hover:prose-a:underline"
        dangerouslySetInnerHTML={{ __html: parseMarkdown(content) }}
      />
      {isStreaming && (
        <span className="inline-block w-1 h-4 bg-gray-600 animate-pulse ml-1" />
      )}
    </div>
  )
}
