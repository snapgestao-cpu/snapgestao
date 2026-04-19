import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verificar Authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: corsHeaders },
      )
    }

    // Client com token do usuário para autenticação
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Usuário não autenticado' }),
        { status: 401, headers: corsHeaders },
      )
    }

    const { imageBase64, userId } = await req.json()

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: 'Dados inválidos' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── 1. Google Cloud Vision API ─────────────────────────────────────────
    const visionKey = Deno.env.get('GOOGLE_VISION_KEY')
    if (!visionKey) {
      return new Response(
        JSON.stringify({ error: 'GOOGLE_VISION_KEY não configurada.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const visionRes = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${visionKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: imageBase64 },
            features: [
              { type: 'TEXT_DETECTION', maxResults: 1 },
              { type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 },
            ],
          }],
        }),
      },
    )

    const visionData = await visionRes.json()

    if (!visionRes.ok) {
      console.error('Vision API error:', visionData)
      return new Response(
        JSON.stringify({ error: 'Erro na Vision API', details: visionData }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const fullText: string = visionData.responses?.[0]?.fullTextAnnotation?.text ?? ''

    // ── 2. Parse text ──────────────────────────────────────────────────────
    const lines = fullText.split('\n').map((l: string) => l.trim()).filter(Boolean)

    const merchant = lines[0] ?? 'Desconhecido'

    const totalLine = lines.find((l: string) =>
      /total|valor\s*a\s*pagar|v\.?\s*total/i.test(l),
    )
    const totalMatch = totalLine?.match(/(\d{1,3}(?:\.\d{3})*(?:,\d{2})?|\d+,\d{2})/)
    const total = totalMatch
      ? parseFloat(totalMatch[1].replace('.', '').replace(',', '.'))
      : 0

    const dateMatch = fullText.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{2,4})/)
    const receiptDate = dateMatch
      ? `${dateMatch[3].length === 2 ? '20' + dateMatch[3] : dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`
      : new Date().toISOString().split('T')[0]

    const cnpjMatch = fullText.match(/\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[\/\s]?\d{4}[\-\s]?\d{2}/)
    const cnpj = cnpjMatch?.[0]?.replace(/\D/g, '') ?? null

    const itemRegex = /^(.+?)\s+(\d{1,3}(?:\.\d{3})*(?:,\d{2})?|\d+,\d{2})\s*$/
    const items = lines
      .filter((l: string) => itemRegex.test(l))
      .map((l: string) => {
        const m = l.match(itemRegex)!
        return {
          name: m[1].trim(),
          value: parseFloat(m[2].replace('.', '').replace(',', '.')),
        }
      })
      .filter((item: { name: string; value: number }) =>
        item.value > 0 && item.value < 10000 &&
        !/TOTAL|SUBTOTAL|DESCONTO|TROCO|TAXA|CNPJ|CPF/i.test(item.name),
      )

    // ── 3. Supabase admin: save image + receipt ────────────────────────────
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const effectiveUserId = userId ?? user.id
    const imagePath = `${effectiveUserId}/${Date.now()}.jpg`
    const imageBytes = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0))

    await supabaseAdmin.storage
      .from('receipts')
      .upload(imagePath, imageBytes, { contentType: 'image/jpeg' })

    const { data: urlData } = supabaseAdmin.storage
      .from('receipts')
      .getPublicUrl(imagePath)

    const { data: receipt, error: dbErr } = await supabaseAdmin
      .from('receipts')
      .insert({
        user_id: effectiveUserId,
        image_url: urlData.publicUrl,
        ocr_data: { fullText, lines, items },
        total,
        merchant,
        merchant_cnpj: cnpj,
        receipt_date: receiptDate,
        processed: false,
      })
      .select()
      .single()

    if (dbErr) {
      return new Response(
        JSON.stringify({ error: 'Erro ao salvar recibo: ' + dbErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        receipt_id: receipt?.id,
        merchant,
        total,
        receipt_date: receiptDate,
        items,
        image_url: urlData.publicUrl,
        raw_text: fullText,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('Erro geral:', err)
    return new Response(
      JSON.stringify({ error: 'Erro interno', details: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
