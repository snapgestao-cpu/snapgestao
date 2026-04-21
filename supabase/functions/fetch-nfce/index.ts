import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { url } = await req.json()

    if (!url) {
      return new Response(
        JSON.stringify({ error: 'URL não fornecida' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('URL acessada:', url)

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      }
    })

    console.log('Status da resposta:', response.status)
    console.log('Content-Type:', response.headers.get('content-type'))

    const html = await response.text()
    console.log('HTML length:', html.length)
    console.log('HTML recebido (primeiros 3000 chars):')
    console.log(html.substring(0, 3000))

    // Retornar o HTML para debug
    return new Response(
      JSON.stringify({
        success: false,
        debug: true,
        http_status: response.status,
        html_length: html.length,
        html_preview: html.substring(0, 3000),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('Erro ao buscar NFC-e:', err)
    return new Response(
      JSON.stringify({ error: 'Erro ao buscar dados do cupom', details: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
