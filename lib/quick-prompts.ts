export const DEFAULT_QUICK_PROMPTS = [
  'Har I ledige lejeboliger i København næste måned?',
  'Kan man få en bolig med altan og 3 værelser?',
  'Hvad er depositum og overtagelsesdato på den seneste bolig?'
]

export const normalizeQuickPrompts = (input?: string[]): string[] => {
  const base = Array.isArray(input) && input.length ? input : DEFAULT_QUICK_PROMPTS
  const trimmed = base
    .map((prompt) => (typeof prompt === 'string' ? prompt.trim() : ''))
    .filter((prompt) => prompt.length > 0)

  const filled = [...trimmed]
  for (const prompt of DEFAULT_QUICK_PROMPTS) {
    if (filled.length >= 3) break
    filled.push(prompt)
  }
  while (filled.length < 3) {
    filled.push('')
  }
  return filled.slice(0, 3)
}
