export type AIProvider = 'claude' | 'gemini' | 'groq'

export const AI_PROVIDERS = [
  {
    id: 'claude' as AIProvider,
    label: 'Claude',
    emoji: '🤖',
    description: 'Anthropic — Alta qualidade',
    envKey: 'EXPO_PUBLIC_ANTHROPIC_API_KEY',
  },
  {
    id: 'gemini' as AIProvider,
    label: 'Gemini',
    emoji: '✨',
    description: 'Google — Rápido',
    envKey: 'EXPO_PUBLIC_GEMINI_API_KEY',
  },
  {
    id: 'groq' as AIProvider,
    label: 'Llama',
    emoji: '🦙',
    description: 'Groq — Gratuito',
    envKey: 'EXPO_PUBLIC_GROQ_API_KEY',
  },
]

export function getApiKey(provider: AIProvider): string {
  switch (provider) {
    case 'claude': return process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY || ''
    case 'gemini': return process.env.EXPO_PUBLIC_GEMINI_API_KEY || ''
    case 'groq':   return process.env.EXPO_PUBLIC_GROQ_API_KEY || ''
  }
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
      const response = await fetch('https://api.anthropic.com/v1/messages', {
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
      })
      if (!response.ok) throw new Error('Erro Claude: ' + await response.text())
      const data = await response.json()
      return data.content?.[0]?.text || ''
    }

    case 'gemini': {
      const body: any = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
      }
      if (systemPrompt) {
        body.system_instruction = { parts: [{ text: systemPrompt }] }
      }
      const response = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      )
      if (!response.ok) throw new Error('Erro Gemini: ' + await response.text())
      const data = await response.json()
      return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    }

    case 'groq': {
      const messages: any[] = []
      if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
      messages.push({ role: 'user', content: prompt })
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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
      })
      if (!response.ok) throw new Error('Erro Groq: ' + await response.text())
      const data = await response.json()
      return data.choices?.[0]?.message?.content || ''
    }
  }
}
