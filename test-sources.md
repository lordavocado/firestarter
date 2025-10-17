# Test af kildevisning i Lejechat

## Nuværende implementering

Kilder fra RAG-søgeresultater sendes sammen med streaming-svaret via Vercel AI SDK:

1. **API-route** (`/api/lejechat/query/route.ts`)
   - Udarbejder kilder ud fra Upstash-searchresultater
   - Ved streaming sendes kilder som `8:{"sources": [...]}` i datafeedet
   - Hver kilde indeholder URL, titel og uddrag
2. **Dashboard** (`/app/dashboard/page.tsx`)
   - Lytter efter kildepakker i strømmen
   - Opdaterer seneste assistentbesked med kilder
   - Viser kilder under hver besked
3. **Visning**
   - Vises som sektionen "Kilder" under svaret
   - Hver kilde viser nummer, titel (60 tegn), uddrag (100 tegn) og klikbar URL

## Testtrin

1. Start udviklingsserveren: `pnpm dev`
2. Opret en chatbot med en udlejnings-URL (fx `https://www.lejebolig.dk`)
3. Når importen er færdig, stil et spørgsmål om ledighed eller lejevilkår
4. Bekræft at kilder vises under svaret med danske tekster
5. Klik på kilderne og bekræft, at de åbner i nye faner
6. Åbn det offentlige link (`/chat/<slug>`) fra dashboardet og bekræft, at kilderne vises på samme måde

## Forventet adfærd

- Svaret skal streames linje for linje
- Kilderne skal vises under svaret i korrekt rækkefølge
- Hver kilde skal være klikbar og åbne i et nyt vindue
- Uddraget skal give et kort overblik over relevante boligoplysninger
