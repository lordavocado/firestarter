# Lejechat – Chatbots til danske udlejningsboliger

<div align="center">
  <img src="https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExNGVhOTdxaDhxZGJ6bnAwaDB3bWp3bXpnYzN1NDBrazJ1MGpvOG51aCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/ZAOM1psWWVQYeAaS38/giphy.gif" alt="Lejechat demo" width="100%" />
</div>

Lejechat gør det nemt for danske ejendomsadministratorer at bygge en chatbot, der kan svare på spørgsmål om ledige lejemål, indflytningsdatoer, depositum og andre leasingdetaljer. Platformen importerer sider fra jeres boligsite, indeksere indholdet og udstiller en dansk chatoplevelse samt et OpenAI-kompatibelt API.

Ved at kombinere automatisk crawling, kontekstuel søgning og streaming-svar kan du give potentielle lejere øjeblikkelige, korrekte svar – uden at holde dine boligdata opdateret manuelt.

## Teknologi-stack

- **Firecrawl** til at hente boligannoncer og metadata
- **Upstash Search** til semantisk søgning på boligindhold
- **Vercel AI SDK** til streaming-svar i chatten
- **Next.js 15** med App Router til UI og API-endpoints
- **Groq, OpenAI eller Anthropic** som LLM-backend (valgfrit per miljø)

## Opsætning

### Påkrævede nøgler

| Tjeneste           | Formål                                   | Hvor hentes den |
| ------------------ | ----------------------------------------- | ---------------- |
| Firecrawl          | Import af boligannoncer                   | [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys) |
| Upstash Search     | Semantisk søgning og vektorindeks         | [console.upstash.com](https://console.upstash.com) |
| LLM-udbyder        | Groq, OpenAI eller Anthropic til svar     | Udbyderens konsol |

### Hurtig start

1. Klon repoet
2. Opret `.env.local` med dine nøgler:
   ```env
   FIRECRAWL_API_KEY=din_firecrawl_nøgle
   
   # Upstash Search
   UPSTASH_SEARCH_REST_URL=...
   UPSTASH_SEARCH_REST_TOKEN=...
   
   # Vælg mindst én LLM-udbyder
   OPENAI_API_KEY=...
   # ANTHROPIC_API_KEY=...
   # GROQ_API_KEY=...
   ```
3. Installer pakker: `pnpm install`
4. Start dev-server: `pnpm dev`
5. Åbn [http://localhost:3000](http://localhost:3000)

## Eksempel

**Input:** en boligside, fx `https://www.lejebolig.dk`

**Output:** en Lejechat-chatbot, der forstår dine annoncer og kan svare på spørgsmål som "Hvilke 3-værelses lejligheder er ledige i Aarhus?".

## Arkitektur – fra import til svar

### 1. Import af boligwebsite
1. **URL-indsendelse:** frontend kalder `/api/lejechat/create`
2. **Firecrawl import:** sider hentes som Markdown + HTML
3. **Indeksering:** dokumenter gemmes i Upstash Search med navnerum<br>`<domæne>-<timestamp>` (fx `lejebolig-dk-1718394041`)
4. **Metadata:** titler, beskrivelser og favicons gemmes i Redis/localStorage via `lib/storage`

### 2. Svarpipeline (RAG)
1. **Brugerspørgsmål:** `/api/lejechat/query` slår op i det relevante navnerum
2. **Semantisk søgning:** top-dokumenter hentes og formateres som dansk kontekst
3. **LLM-prompt:** systemprompten i `lejechat.config.ts` rammer en dansk tone og begrænser svar til importerede data
4. **Streaming:** Vercel AI SDK streamer svaret og referencer til dashboardet

### 3. Deling og embed
- Hver chatbot får automatisk et slug og et link i formatet `/chat/<slug>`
- Kopiér embed-snippet fra dashboardet eller brug:

  ```html
  <script src="https://din-lejechat-installation/embed/lejechat?slug=<slug>" defer></script>
  ```

- Tilpas farve og launcher-tekst via URL-parametre, fx `&accent=%23f97316&label=Start%20chat`
- Scriptet tilføjer en flydende knap i nederste højre hjørne, der åbner Lejechat i et indlejret panel

### 3. Deling og offentlig visning
- Hver chatbot får automatisk et slug og et link i formatet `/chat/<slug>`
- Linket kan deles fra dashboardet eller indeksoversigten og åbner en offentlig chatvisning uden administrationsfunktioner
- Den offentlige visning bruger den samme RAG-pipeline og viser kildehenvisninger, så lejere kan verificere svarene

### API-adgang i OpenAI-format

```ts
import OpenAI from 'openai'

const lejechat = new OpenAI({
  apiKey: 'any-string',
  baseURL: 'https://din-lejechat-installation.vercel.app/api/v1/chat/completions'
})

const svar = await lejechat.chat.completions.create({
  model: 'lejechat-lejebolig-dk-12345',
  messages: [{ role: 'user', content: 'Er der altan og husdyr tilladt?' }]
})

console.log(svar.choices[0].message.content)
```

## Nøglefunktioner

- **Dansk brugeroplevelse:** alle UI-tekster og prompts er oversat til dansk boliglingo
- **Hurtig import:** fra URL til chat på under et minut
- **Kilder og streaming:** svar kommer med klikbare reference-links til annoncerne
- **OpenAI-kompatibelt API:** brug samme endpoint i interne systemer og workflows
- **Delbart offentligt link:** del chatbotten via `/chat/<slug>` og lad lejere teste den med det samme
- **Embed-widget:** indlæs Lejechat på dine egne sider med et `<script>`
- **Konfigurerbar kontekst:** justér temperatur, tokens og rate limits i `lejechat.config.ts`

## Konfiguration

`lejechat.config.ts` styrer navngivning, prompt og grænser.

```ts
const config = {
  app: {
    name: 'Lejechat',
    logoPath: '/lejechat-logo.svg',
  },
  ai: {
    systemPrompt: 'Du er en hjælpsom udlejningsassistent...'
  },
  crawling: {
    defaultLimit: 10,
    limitOptions: [10, 25, 50, 100],
  },
  storage: {
    localStorageKey: 'lejechat_indexes',
  },
}
```

Ændr prioriteten mellem Groq/OpenAI/Anthropic ved at slette eller tilføje API-nøgler i `.env.local`. Funktionen `getAIModel()` vælger første gyldige udbyder.

## Bidrag og licens

Vi tager imod PR’er, der forbedrer boligprompten, tilføjer automatiske tests eller udvider søgeoplevelsen. Åbn gerne en issue med idéer til danske ejendomsflows.

Lejechat er MIT-licenseret – se `LICENSE`.
