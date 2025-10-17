import { Suspense } from 'react'
import PublicChat from './public-chat'

interface ChatPageProps {
  params: Promise<{ slug: string }>
}

export default async function ChatPage({ params }: ChatPageProps) {
  const { slug } = await params
  const decodedSlug = decodeURIComponent(slug)

  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[#FBFAF9]"><p className="text-gray-600">Indlæser chatbot...</p></div>}>
      <PublicChat slug={decodedSlug} />
    </Suspense>
  )
}
