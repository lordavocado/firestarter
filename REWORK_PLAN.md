# Rental Chatbot Rework Plan

## 1. Objective & Scope
- Reposition the product for Danish rental property managers who need fast availability chatbots for their listings.
- Localize all user-facing copy, docs, and configuration defaults to Danish while preserving existing functionality (crawling, indexing, chat).
- Ensure the experience reflects rental vocabulary (lejebolig, lejeaftale, indflytningsdato) without introducing new features or APIs.

## 2. Branding & Naming
- Select new product name (working title: `Lejechat`) and confirm Danish tagline.
- Replace brand references across source: `app/layout.tsx`, `app/page.tsx`, `app/dashboard/*`, `app/indexes/*`, `components/ui/*`, `lejechat.config.ts`, and metadata components.
- Update logos/icons in `public/` (favicon, social preview) to match new brand; ensure Next.js metadata pulls new assets.
- Adjust environment variables or config keys only where names appear in UI copy; keep actual key names intact to avoid breaking functionality.
- Introduce shareable embed widget: `/embed/lejechat` script and iframe-based `/chat/[slug]?embed=1` view.

## 3. Language & Tone Localization
- Audit all user-visible strings (buttons, dialogs, toast messages, error states) and translate to formal yet friendly Danish; files: `app/**/*.tsx`, `components/ui/**/*`, `hooks/useStorage.ts`, `lib/context-processor.ts` (error messaging), `lib/utils.ts` (helpers with copy), API route responses under `app/api/*`.
- Convert README, `AGENTS.md`, onboarding modals, and any inline documentation to Danish while preserving technical accuracy.
- Ensure date/number formatting matches Danish locale where displayed (e.g., use `Intl.DateTimeFormat('da-DK')` if needed) without altering data structures.

## 4. Domain-Specific UX Adjustments
- Update hero section to explain rental listing chatbot workflow (crawl boligportal URL → chat answers about availability, deposit, floorplans).
- Refresh feature highlights and benefit cards to reference ejendomsadministration, boligoversigt, and booking pipeline.
- Replace default demo URL with a representative Danish rental showcase (e.g., `https://lejebolig.dk` placeholder) and adjust placeholder text accordingly.
- Review forms and dialogs for domain relevance (e.g., rename "Crawl pages" to "Importer udlejningsannoncer").

## 5. System Prompt & Configuration
- Adapt `lejechat.config.ts` to:
  - Update `systemPrompt` to Danish instructions focusing on availability questions and property details.
  - Ensure feature flags text reflects rental jargon (e.g., `enableCreation` description).
  - Confirm rate limit messages remain English-only in logs if not user-facing.
- Update any server-side validation/messages returned by API routes (`app/api/lejechat/create`, `app/api/lejechat/query`) to Danish.

## 6. Data & Content Model Alignment
- Verify that crawled metadata mapping suits property listings (titles, addresses, unit descriptions). Add Danish field aliases only through copy; avoid new schema fields.
- Adjust snippets, reference labels, and dashboard table headers to highlight unit availability, monthly rent, move-in date where existing fields already capture generic metadata.
- Ensure Upstash namespace naming remains valid but optionally add Danish prefix in non-breaking manner.

## 7. Documentation & Support Materials
- Rewrite `README.md` to cover Danish rental use case, setup instructions, and sample workflows (e.g., "Sådan bygger du en chatbot til dine udlejningsannoncer").
- Update deployment instructions (`vercel.json` notes, environment variable descriptions) with Danish explanations.
- Refresh `test-sources.md` to describe QA steps in the context of availability answers, including manual verification checklist in Danish.
- Update any badges, GIFs, or screenshots to show the new brand and rental scenario.

## 8. Testing & QA Plan
- Create localization test checklist ensuring every route renders Danish copy and no residual English remains.
- Run existing `pnpm lint` and manual end-to-end walkthroughs: chatbot creation from Danish rental site, query flow verifying references are property specific.
- Validate fallback behavior when environment keys missing displays Danish messaging.
- Document domain-focused manual QA steps in PR templates or contributor guide.

## 9. Operational Considerations
- Confirm `.env.local` guidance includes Danish comments/examples (e.g., placeholder API keys with Danish labels).
- Ensure analytics or rate limiting logs remain interpretable (English acceptable internally) and do not leak English to UI.
- Plan timeline: discovery of string inventory, localization implementation, asset replacement, QA, documentation updates.
- Identify stakeholders for Danish language review and legal compliance (e.g., rental regulations disclaimers) before release.

## 10. Deliverables
- Updated codebase with Danish localization and rental-market positioning.
- New branding assets and metadata.
- Danish documentation set (README, AGENTS.md, test guide, any onboarding content).
- QA report confirming parity of functionality with localized experience.
