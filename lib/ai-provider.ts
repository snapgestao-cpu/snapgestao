/**
 * Criador: Diego Manhães
 * Data: 07/05/2026
 * Modificado em: 07/05/2026
 *
 * Abstração de provedores de IA — Claude (Anthropic) e Llama (Groq).
 * Seleção automática por plano: Free → Groq/Llama, Premium → Claude.
 * Gemini desabilitado — Free usa Groq/Llama, Premium usa Claude.
 */

import { Plan } from '../constants/plans'

export type AIProvider = 'claude' | 'groq'
// | 'gemini' // Gemini desabilitado

export const AI_PROVIDER_INFO = {
  claude: {
    name: 'Claude',
    model: 'claude-haiku-4-5-20251001',
    label: 'Claude (Anthropic)',
    description: 'IA avançada com análises mais precisas e personalizadas',
    badge: '⭐ Premium',
    emoji: '🤖',
  },
  groq: {
    name: 'Llama',
    model: 'llama-3.3-70b-versatile',
    label: 'Llama 3.3 (Groq)',
    description: 'IA eficiente para análises financeiras essenciais',
    badge: 'Gratuito',
    emoji: '🦙',
  },
  // gemini: {
  //   name: 'Gemini',
  //   model: 'gemini-2.5-flash',
  //   label: 'Gemini (Google)',
  //   description: 'IA do Google',
  //   badge: '',
  //   emoji: '✨',
  // },
}

export function getAIProvider(plan: Plan): AIProvider {
  return plan === 'premium' ? 'claude' : 'groq'
}

// Mantido para compatibilidade com código legado que usa AI_PROVIDERS
export const AI_PROVIDERS = [
  {
    id: 'claude' as AIProvider,
    label: AI_PROVIDER_INFO.claude.name,
    emoji: AI_PROVIDER_INFO.claude.emoji,
    description: AI_PROVIDER_INFO.claude.description,
    envKey: 'EXPO_PUBLIC_ANTHROPIC_API_KEY',
  },
  // {
  //   id: 'gemini' as AIProvider,
  //   label: 'Gemini',
  //   emoji: '✨',
  //   description: 'Google — Rápido',
  //   envKey: 'EXPO_PUBLIC_GEMINI_API_KEY',
  // },
  {
    id: 'groq' as AIProvider,
    label: AI_PROVIDER_INFO.groq.name,
    emoji: AI_PROVIDER_INFO.groq.emoji,
    description: 'Groq — Leve e eficiente',
    envKey: 'EXPO_PUBLIC_GROQ_API_KEY',
  },
]

export function getApiKey(provider: AIProvider): string {
  switch (provider) {
    case 'claude': return process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY || ''
    // case 'gemini': return process.env.EXPO_PUBLIC_GEMINI_API_KEY || ''
    case 'groq':   return process.env.EXPO_PUBLIC_GROQ_API_KEY || ''
  }
}

const AI_TIMEOUT_MS = 90_000

function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer))
}

export async function callAI(
  provider: AIProvider,
  prompt: string,
  systemPrompt?: string
): Promise<string> {
  const apiKey = getApiKey(provider)
  if (!apiKey) {
    throw new Error(
      `Chave da API ${provider} não configurada. Verifique o arquivo .env.`
    )
  }

  switch (provider) {

    case 'claude': {
      let response: Response
      try {
        response = await fetchWithTimeout(
          'https://api.anthropic.com/v1/messages',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 4096,
              system: systemPrompt || '',
              messages: [{ role: 'user', content: prompt }],
            }),
          },
          AI_TIMEOUT_MS
        )
      } catch (e: any) {
        if (e?.name === 'AbortError') throw new Error('A IA demorou muito para responder. Tente novamente.')
        throw e
      }
      if (!response.ok) throw new Error('Erro Claude: ' + await response.text())
      const data = await response.json()
      return data.content?.[0]?.text || ''
    }

    // case 'gemini': { ... }

    case 'groq': {
      const messages: any[] = []
      if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
      messages.push({ role: 'user', content: prompt })
      let response: Response
      try {
        response = await fetchWithTimeout(
          'https://api.groq.com/openai/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + apiKey,
            },
            body: JSON.stringify({
              model: 'llama-3.3-70b-versatile',
              max_tokens: 4096,
              temperature: 0.7,
              messages,
            }),
          },
          AI_TIMEOUT_MS
        )
      } catch (e: any) {
        if (e?.name === 'AbortError') throw new Error('A IA demorou muito para responder. Tente novamente.')
        throw e
      }
      if (!response.ok) throw new Error('Erro Groq: ' + await response.text())
      const data = await response.json()
      return data.choices?.[0]?.message?.content || ''
    }
  }
}
