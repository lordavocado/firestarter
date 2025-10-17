import { Redis } from '@upstash/redis'
import { normalizeQuickPrompts } from './quick-prompts'

export interface IndexMetadata {
  url: string
  namespace: string
  slug: string
  pagesCrawled: number
  createdAt: string
  metadata?: {
    title?: string
    description?: string
    favicon?: string
    ogImage?: string
    quickPrompts?: string[]
  }
}

const ensureSlug = (index: Omit<IndexMetadata, 'slug'> & { slug?: string }): IndexMetadata => {
  const fallbackSlug = index.slug ?? index.namespace;
  return {
    ...index,
    slug: fallbackSlug,
    metadata: {
      ...(index.metadata || {}),
      quickPrompts: normalizeQuickPrompts(index.metadata?.quickPrompts),
    },
  };
};

interface StorageAdapter {
  getIndexes(): Promise<IndexMetadata[]>
  getIndex(namespace: string): Promise<IndexMetadata | null>
  saveIndex(index: IndexMetadata): Promise<void>
  deleteIndex(namespace: string): Promise<void>
}

class FileStorageAdapter implements StorageAdapter {
  private async getFilePath() {
    const { join } = await import('path')
    return process.env.LEJECHAT_STORAGE_PATH || join(process.cwd(), '.lejechat-indexes.json')
  }

  private async readFile(): Promise<IndexMetadata[]> {
    try {
      const fs = await import('fs/promises')
      const filePath = await this.getFilePath()
      const data = await fs.readFile(filePath, 'utf8')
      const parsed = JSON.parse(data) as Array<Omit<IndexMetadata, 'slug'> & { slug?: string }>
      return parsed.map(ensureSlug)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return []
      }
      console.warn('Kunne ikke læse indexfilen', error)
      return []
    }
  }

  private async writeFile(indexes: IndexMetadata[]): Promise<void> {
    const fs = await import('fs/promises')
    const path = await import('path')
    const filePath = await this.getFilePath()
    const dir = path.dirname(filePath)
    try {
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(filePath, JSON.stringify(indexes, null, 2), 'utf8')
    } catch (error) {
      console.warn('Kunne ikke skrive indexfilen', error)
    }
  }

  async getIndexes(): Promise<IndexMetadata[]> {
    return this.readFile()
  }

  async getIndex(namespace: string): Promise<IndexMetadata | null> {
    const indexes = await this.readFile()
    const match = indexes.find((item) => item.namespace === namespace)
    return match ? { ...match } : null
  }

  async saveIndex(index: IndexMetadata): Promise<void> {
    const normalized = ensureSlug(index)
    const indexes = await this.readFile()
    const existingIndex = indexes.findIndex((item) => item.namespace === normalized.namespace)
    if (existingIndex !== -1) {
      indexes[existingIndex] = normalized
    } else {
      indexes.unshift(normalized)
    }
    await this.writeFile(indexes.slice(0, 50))
  }

  async deleteIndex(namespace: string): Promise<void> {
    const indexes = await this.readFile()
    const filtered = indexes.filter((item) => item.namespace !== namespace)
    await this.writeFile(filtered)
  }
}

class LocalStorageAdapter implements StorageAdapter {
  private readonly STORAGE_KEY = 'lejechat_indexes'

  async getIndexes(): Promise<IndexMetadata[]> {
    if (typeof window === 'undefined') return []
    
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY)
      return stored ? (JSON.parse(stored) as Array<Omit<IndexMetadata, 'slug'> & { slug?: string }>).map(ensureSlug) : []
    } catch {
      console.error('Failed to get stored indexes')
      return []
    }
  }

  async getIndex(namespace: string): Promise<IndexMetadata | null> {
    const indexes = await this.getIndexes()
    return indexes.find(i => i.namespace === namespace) || null
  }

  async saveIndex(index: IndexMetadata): Promise<void> {
    const normalized = ensureSlug(index)
    if (typeof window === 'undefined') {
      throw new Error('localStorage is not available on the server')
    }
    
    const indexes = await this.getIndexes()
    const existingIndex = indexes.findIndex(i => i.namespace === normalized.namespace)
    
    if (existingIndex !== -1) {
      indexes[existingIndex] = normalized
    } else {
      indexes.unshift(normalized)
    }
    
    // Keep only the last 50 indexes
    const limitedIndexes = indexes.slice(0, 50)
    
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(limitedIndexes))
    } catch (error) {
      throw error
    }
  }

  async deleteIndex(namespace: string): Promise<void> {
    if (typeof window === 'undefined') {
      throw new Error('localStorage is not available on the server')
    }
    
    const indexes = await this.getIndexes()
    const filteredIndexes = indexes.filter(i => i.namespace !== namespace)
    
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filteredIndexes))
    } catch (error) {
      throw error
    }
  }
}

class RedisStorageAdapter implements StorageAdapter {
  private redis: Redis
  private readonly INDEXES_KEY = 'lejechat:indexes'
  private readonly INDEX_KEY_PREFIX = 'lejechat:index:'

  constructor() {
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      throw new Error('Redis configuration missing')
    }
    
    this.redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  }

  async getIndexes(): Promise<IndexMetadata[]> {
    try {
      const indexes = await this.redis.get<Array<Omit<IndexMetadata, 'slug'> & { slug?: string }>>(this.INDEXES_KEY)
      return indexes ? indexes.map(ensureSlug) : []
    } catch {
      console.error('Failed to get indexes from Redis')
      return []
    }
  }

  async getIndex(namespace: string): Promise<IndexMetadata | null> {
    try {
      const index = await this.redis.get<Omit<IndexMetadata, 'slug'> & { slug?: string }>(`${this.INDEX_KEY_PREFIX}${namespace}`)
      return index ? ensureSlug(index) : null
    } catch {
      console.error('Failed to get index from Redis')
      return null
    }
  }

  async saveIndex(index: IndexMetadata): Promise<void> {
    const normalized = ensureSlug(index)
    try {
      // Save individual index
      await this.redis.set(`${this.INDEX_KEY_PREFIX}${normalized.namespace}`, normalized)
      
      // Update indexes list
      const indexes = await this.getIndexes()
      const existingIndex = indexes.findIndex(i => i.namespace === normalized.namespace)
      
      if (existingIndex !== -1) {
        indexes[existingIndex] = normalized
      } else {
        indexes.unshift(normalized)
      }
      
      // Keep only the last 50 indexes
      const limitedIndexes = indexes.slice(0, 50)
      await this.redis.set(this.INDEXES_KEY, limitedIndexes)
    } catch (error) {
      throw error
    }
  }

  async deleteIndex(namespace: string): Promise<void> {
    try {
      // Delete individual index
      await this.redis.del(`${this.INDEX_KEY_PREFIX}${namespace}`)
      
      // Update indexes list
      const indexes = await this.getIndexes()
      const filteredIndexes = indexes.filter(i => i.namespace !== namespace)
      await this.redis.set(this.INDEXES_KEY, filteredIndexes)
    } catch (error) {
      throw error
    }
  }
}

// Factory function to get the appropriate storage adapter
function getStorageAdapter(): StorageAdapter {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return new RedisStorageAdapter()
  }

  if (typeof window === 'undefined') {
    return new FileStorageAdapter()
  }

  return new LocalStorageAdapter()
}

// Lazy initialization to avoid errors at module load time
let storage: StorageAdapter | null = null

function getStorage(): StorageAdapter | null {
  if (!storage) {
    try {
      storage = getStorageAdapter()
      let adapterName = 'Ukendt'
      if (storage instanceof RedisStorageAdapter) adapterName = 'Redis'
      else if (storage instanceof LocalStorageAdapter) adapterName = 'LocalStorage'
      else if (storage instanceof FileStorageAdapter) adapterName = 'File'
      console.info('[Lejechat] Storage adapter initialiseret:', adapterName)
    } catch (error) {
      console.warn('[Lejechat] Ingen storage-adapter tilgængelig', error)
      return null
    }
  }
  return storage
}

export const getIndexes = async (): Promise<IndexMetadata[]> => {
  const adapter = getStorage()
  if (!adapter) {
    return []
  }
  
  try {
    return await adapter.getIndexes()
  } catch {
    console.error('Failed to get indexes')
    return []
  }
}

export const getIndex = async (namespace: string): Promise<IndexMetadata | null> => {
  const adapter = getStorage()
  if (!adapter) {
    return null
  }
  
  try {
    return await adapter.getIndex(namespace)
  } catch {
    console.error('Failed to get index')
    return null
  }
}

export const saveIndex = async (index: IndexMetadata): Promise<void> => {
  const adapter = getStorage()
  if (!adapter) {
    console.warn('No storage adapter available - index not saved')
    return
  }
  
  try {
    return await adapter.saveIndex(index)
  } catch {
    // Don't throw - this allows the app to continue functioning
    console.error('Failed to save index')
  }
}

export const deleteIndex = async (namespace: string): Promise<void> => {
  const adapter = getStorage()
  if (!adapter) {
    console.warn('No storage adapter available - index not deleted')
    return
  }
  
  try {
    return await adapter.deleteIndex(namespace)
  } catch {
    // Don't throw - this allows the app to continue functioning
    console.error('Failed to delete index')
  }
}
