export const LANGUAGES = {
  EN: 'English',
  CZ: 'Czech'
} as const;

export const DEFAULT_LANGUAGE = 'EN' as const;

export const TRANSLATION_ERROR_MESSAGES = {
  API_KEY_MISSING: (provider: string) => `Chybí ${provider} API klíč.`,
  QUOTA_EXCEEDED: (provider: string) => `Překročena kvóta pro ${provider}. Zkuste to později.`,
  TRANSLATION_FAILED: 'Překlad se nezdařil: Neznámá chyba',
  INVALID_JSON: 'AI returned invalid JSON format'
} as const;

export const TRANSLATION_PROMPT_API_KEY = (provider: string) => 
  `⚠️ Pro překlad je nutný API klíč
Vložte Gemini nebo Claude API klíč (aktuálně vybráno: ${provider}).

💡 Klíč se automaticky rozpozná.
V nastavení lze změnit defaultni model.`;
