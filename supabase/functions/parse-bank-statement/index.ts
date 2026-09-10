import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { extractText, getDocumentProxy } from 'npm:unpdf@0.12.1'
import { parseBradesco, StatementType } from './parser.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const FALLBACK = { transactions: [], message: 'Extração para este banco ainda não implementada.' }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/**
 * parse-bank-statement
 *
 * Recebe { bankId, statementType, pdfBase64 }, extrai o texto do PDF (unpdf) e
 * delega o parsing para `parser.ts` (lógica pura, testada em Jest). Devolve
 * { transactions: [...] }. Se o banco/tipo não for reconhecido ou nada for
 * extraído, mantém o fallback { transactions: [], message }.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Não autorizado' }, 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return json({ error: 'Usuário não autenticado' }, 401)

    const { bankId, statementType, pdfBase64 } = await req.json()

    if (!bankId || !statementType || !pdfBase64) {
      return json({ error: 'Dados inválidos: bankId, statementType e pdfBase64 são obrigatórios.' }, 400)
    }

    // Bancos não suportados → fallback amigável (o app volta pro pick)
    if (bankId !== 'bradesco') return json(FALLBACK)

    // ── PDF (base64) → texto ────────────────────────────────────────────────
    const pdfBytes = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0))
    const doc = await getDocumentProxy(pdfBytes)
    const { text } = await extractText(doc, { mergePages: true })

    // ── texto → lançamentos (parser puro) ────────────────────────────────────
    const transactions = parseBradesco(statementType as StatementType, text)

    if (transactions.length === 0) return json(FALLBACK)

    // Checksum/log só pra fatura de crédito (soma deve bater com "Total da fatura")
    if (statementType === 'credito') {
      const net = transactions.reduce((s, t) => s + (t.type === 'income' ? -t.amount : t.amount), 0)
      console.log(`[parse-bank-statement] credito: ${transactions.length} lançamentos, soma líquida R$ ${net.toFixed(2)}`)
    } else {
      console.log(`[parse-bank-statement] debito: ${transactions.length} lançamentos`)
    }

    return json({ transactions })
  } catch (err) {
    console.error('Erro geral:', err)
    return json({ error: 'Erro interno', details: String(err) }, 500)
  }
})
