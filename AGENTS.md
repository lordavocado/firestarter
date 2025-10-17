# Repository Guidelines

## Projektstruktur og moduloversigt
- `app/` rummer Next.js-ruter; `app/page.tsx` er landingssiden for Lejechat, `app/lejechat/*` indeholder API-endpoints, `app/chat/[slug]` er den offentlige visning, og `app/embed/lejechat/route.ts` genererer embed-scriptet.
- `components/ui/` samler genbrugelige UI-komponenter med shadcn/ui-konventioner; forretningslogik hooks ligger i `hooks/`.
- `lib/` indeholder hjælpefunktioner til kontekst, lager og Upstash-integration; globale standarder og prompts defineres i `lejechat.config.ts`.
- Statisk materiale og build-konfiguration findes i `public/`, `tailwind.config.ts`, `postcss.config.mjs` og `components.json`.

## Build-, test- og udviklingskommandoer
- `pnpm install` (eller `bun install`) synkroniserer afhængigheder baseret på de eksisterende lockfiler.
- `pnpm dev` starter udviklingsserveren på http://localhost:3000 med Turbopack.
- `pnpm build` laver produktionsbuild, mens `pnpm start` kører den byggede applikation.
- `pnpm lint` kører ESLint via Next-konfigurationen; brug den før PR’er.

## Kodestil og navngivning
- TypeScript kører i strict-mode; brug `tsx` til React-visninger og path-aliaset `@/*` i stedet for dybe relative stier.
- Anvend 2 mellemrum som indrykning, `PascalCase` til komponenter, `camelCase` til hjælpefunktioner og kebab-case til rutesegmenter.
- Orden Tailwind-klasser efter layout → spacing → farver → state; udnyt `class-variance-authority` til gentagne varianter.
- Kommentér kun komplekse afsnit, fx domænespecifik boliglogik.

## Testretningslinjer
- Automatiske tests er endnu ikke sat op; følg den manuelle QA-tjekliste i `test-sources.md`, især efter ændringer i streaming- eller kildevisning.
- Når du tilføjer tests, placer komponent-specs i `__tests__/` og nævn planlagt runner (fx Vitest) i PR-beskrivelsen.
- Dokumentér nye manuelle testtrin direkte i PR’en for at holde tjeklisterne ajour.

## Commit- og pull-request-retningslinjer
- Historikken blander imperative commits og konventionelle præfikser; foretræk `type: kort emne` eller en klar, imperativ sætning under 72 tegn.
- Rebas før PR, link relevante issues, og beskriv miljøændringer som nye krav til API-nøgler.
- Del skærmbilleder eller GIF’er ved UI-ændringer og opfør de kommandoer/manuale tests du har kørt; noter eventuelle opfølgninger til næste agent.

## Miljø- og konfigurationsnoter
- Sekreter gemmes i `.env.local`; udfyld Firecrawl- og Udlejningsnøgler (`FIRECRAWL_API_KEY`, `UPSTASH_*`, `OPENAI_API_KEY` osv.) før builds.
- Juster chatbot-defaults i `lejechat.config.ts`; klientvenlige værdier ligger i `clientConfig`, serverlogik bør guards mod `typeof window`.
- Deploys målretter Vercel (`vercel.json`); afprøv lokale miljøvariabler, så de matcher produktionsopsætningen.
