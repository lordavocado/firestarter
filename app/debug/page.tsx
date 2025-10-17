'use client'

import { useEffect, useState } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function DebugPage() {
  const [namespace, setNamespace] = useState('lejechat-dev-1749845075753')
  interface DebugResults {
    [key: string]: unknown
  }
  const [results, setResults] = useState<DebugResults | null>(null)
  const [loading, setLoading] = useState(false)
  type RecentInteraction = {
    slug: string
    message: string
    origin: string
    timestamp: string
  }
  const [recentInteractions, setRecentInteractions] = useState<RecentInteraction[]>([])

  const runDebug = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/lejechat/debug?namespace=${namespace}`)
      const data = await response.json()
      setResults(data)
    } catch (error) {
      setResults({ error: error instanceof Error ? error.message : 'Ukendt fejl' })
    } finally {
      setLoading(false)
    }
  }

  const loadInteractions = () => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem('lejechat_recent_interactions')
      const parsed: RecentInteraction[] = raw ? JSON.parse(raw) : []
      setRecentInteractions(parsed)
    } catch (error) {
      console.warn('Kunne ikke indlæse lokale interaktioner', error)
      setRecentInteractions([])
    }
  }

  const clearInteractions = () => {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem('lejechat_recent_interactions')
    setRecentInteractions([])
  }

  const formatTimestamp = (value: string) => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString('da-DK', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: 'short'
    })
  }

  useEffect(() => {
    loadInteractions()
  }, [])

  return (
    <div className="min-h-screen bg-[#FBFAF9] p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Lejechat fejlsøgning</h1>
        
        <div className="bg-white rounded-lg p-6 shadow-sm">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Navnerum</label>
              <Input
                value={namespace}
                onChange={(e) => setNamespace(e.target.value)}
                placeholder="Angiv navnerum til fejlsøgning"
              />
            </div>
            
            <Button onClick={runDebug} disabled={loading}>
              {loading ? 'Kører...' : 'Kør fejlsøgning'}
            </Button>
          </div>
          
          {results && (
            <div className="mt-6">
              <h2 className="text-lg font-semibold mb-2">Resultater:</h2>
              <pre className="bg-gray-100 p-4 rounded overflow-auto text-xs">
                {JSON.stringify(results, null, 2)}
              </pre>
            </div>
          )}
        </div>
        
        <div className="mt-6 bg-white rounded-lg p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Vejledning:</h2>
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>Gå til indeksoversigten og importer en hjemmeside</li>
            <li>Notér navnerummet der bliver genereret (vises i svaret)</li>
            <li>Indtast navnerummet ovenfor og klik på &quot;Kør fejlsøgning&quot;</li>
            <li>Så ser du hvilke dokumenter der ligger i Upstash</li>
          </ol>
        </div>

        <div className="mt-6 bg-white rounded-lg p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Seneste forespørgsler (lokal browser)</h2>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={loadInteractions}>
                Opdater
              </Button>
              <Button variant="ghost" size="sm" onClick={clearInteractions}>
                Ryd
              </Button>
            </div>
          </div>
          {recentInteractions.length === 0 ? (
            <p className="text-sm text-gray-600">Ingen forespørgsler registreret endnu. Stil et spørgsmål i dashboardet eller den offentlige chatbot for at se dem her.</p>
          ) : (
            <ul className="space-y-3 text-sm">
              {recentInteractions.map((interaction, index) => (
                <li key={`${interaction.timestamp}-${index}`} className="p-3 border border-gray-200 rounded-lg bg-gray-50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-700">{interaction.message}</span>
                    <span className="text-xs text-gray-500">{formatTimestamp(interaction.timestamp)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>Slug: <code className="text-gray-700">{interaction.slug}</code></span>
                    <span>{interaction.origin === 'public' ? 'Offentligt link' : 'Dashboard'}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
