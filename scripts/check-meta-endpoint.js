#!/usr/bin/env node
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const ts = require('typescript')

class FakeNextResponse {
  constructor(body, init = {}) {
    this._body = body
    this.status = init.status ?? 200
    this.headers = init.headers ?? {}
  }

  static json(body, init) {
    return new FakeNextResponse(body, init)
  }

  async json() {
    return this._body
  }
}

const routePath = path.join(__dirname, '..', 'app', 'api', 'lejechat', 'meta', '[slug]', 'route.ts')
const routeSource = fs.readFileSync(routePath, 'utf8')
const compiledRoute = ts.transpileModule(routeSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: 'route.ts',
}).outputText

function loadRouteWith(getIndexesImpl) {
  const sandboxModule = { exports: {} }
  const sandbox = {
    module: sandboxModule,
    exports: sandboxModule.exports,
    require: (id) => {
      if (id === 'next/server') {
        return { NextResponse: FakeNextResponse }
      }
      if (id === '@/lib/storage') {
        return { getIndexes: getIndexesImpl }
      }
      if (id === '@/lib/quick-prompts') {
        return { normalizeQuickPrompts: (value) => (Array.isArray(value) && value.length ? value : ['A', 'B', 'C']) }
      }
      throw new Error(`Unexpected import: ${id}`)
    },
  }
  vm.runInNewContext(compiledRoute, sandbox, { filename: 'meta-route.js' })
  return sandboxModule.exports.GET
}

async function runScenario(name, getIndexesImpl, slug) {
  const GET = loadRouteWith(getIndexesImpl)
  const request = new Request(`https://example.com/api/lejechat/meta/${slug}`)
  const response = await GET(request, { params: { slug } })
  const body = await response.json()
  return { name, status: response.status ?? response._init?.status ?? 200, body }
}

async function main() {
  const sampleIndex = {
    url: 'https://lejechat.dk/demo',
    namespace: 'demo-ns',
    slug: 'demo-slug',
    pagesCrawled: 12,
    createdAt: new Date('2024-11-21T10:00:00.000Z').toISOString(),
    metadata: {
      title: 'Lejechat Demo',
      description: 'Eksempel chatbot for test',
      favicon: 'https://lejechat.dk/favicon.ico',
    },
  }

  const scenarios = [
    await runScenario(
      'Redis adapter returns a matching index',
      async () => [sampleIndex],
      'demo-slug'
    ),
    await runScenario(
      'Storage available but slug missing',
      async () => [sampleIndex],
      'ukendt-slug'
    ),
    await runScenario(
      'No adapter / empty index list',
      async () => [],
      'demo-slug'
    ),
  ]

  scenarios.forEach((scenario) => {
    console.info(`\n[${scenario.name}]`)
    console.info(`Status: ${scenario.status}`)
    console.info('Body:', scenario.body)
  })

  assert.strictEqual(scenarios[0].status, 200, 'Expected 200 when slug exists')
  assert.deepStrictEqual(scenarios[0].body.index.slug, 'demo-slug', 'Response should include matching index')
  assert.strictEqual(scenarios[1].status, 404, 'Expected 404 when slug missing')
  assert.strictEqual(scenarios[2].status, 404, 'Expected 404 when storage returns empty list')

  console.info('\n✅ Metadata endpoint behaves as expected across simulated storage scenarios.')
}

main().catch((error) => {
  console.error('Metadata endpoint verification failed:', error)
  process.exit(1)
})
