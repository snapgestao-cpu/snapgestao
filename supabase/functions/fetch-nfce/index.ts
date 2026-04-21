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

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      }
    })

    if (!response.ok) {
      throw new Error(`Portal retornou ${response.status}`)
    }

    const html = await response.text()

    // Estabelecimento — primeira linha em destaque ou h4
    const merchantMatch =
      html.match(/<div[^>]*class="[^"]*text-center[^"]*"[^>]*>\s*<span[^>]*>(.*?)<\/span>/s) ||
      html.match(/<h4[^>]*>(.*?)<\/h4>/s)
    const merchant = (merchantMatch?.[1] ?? '')
      .replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().substring(0, 100) || 'Não identificado'

    // CNPJ
    const cnpjMatch = html.match(
      /CNPJ[:\s]*([0-9]{2}[\.\s]?[0-9]{3}[\.\s]?[0-9]{3}[\/\s]?[0-9]{4}[\-\s]?[0-9]{2})/
    )
    const cnpj = cnpjMatch?.[1]?.replace(/\D/g, '') ?? null

    // Data de emissão
    const dateMatch = html.match(/Emiss[ãa]o[:\s]*(\d{2}\/\d{2}\/\d{4})/)
    const emission_date = dateMatch
      ? dateMatch[1].split('/').reverse().join('-')
      : new Date().toISOString().split('T')[0]

    // Itens — tabela com id="tblItens" ou classe com "item"
    const items: Array<{
      name: string; quantity: number; unit: string; unitValue: number; totalValue: number
    }> = []

    const tableMatch =
      html.match(/<table[^>]*id="tblItens"[^>]*>(.*?)<\/table>/s) ||
      html.match(/<table[^>]*class="[^"]*item[^"]*"[^>]*>(.*?)<\/table>/s)

    if (tableMatch) {
      const rowRegex = /<tr[^>]*>(.*?)<\/tr>/gs
      let rowMatch
      while ((rowMatch = rowRegex.exec(tableMatch[1])) !== null) {
        const cells = [...rowMatch[1].matchAll(/<td[^>]*>(.*?)<\/td>/gs)]
          .map(m => m[1].replace(/<[^>]+>/g, '').trim())
          .filter(Boolean)
        if (cells.length >= 3) {
          const valueStr = cells[cells.length - 1].replace(/[^\d,]/g, '').replace(',', '.')
          const totalValue = parseFloat(valueStr)
          if (totalValue > 0) {
            const qtyStr = cells.length >= 4 ? cells[1].replace(',', '.') : '1'
            const quantity = parseFloat(qtyStr) || 1
            items.push({
              name: cells[0].replace(/\s+/g, ' ').trim(),
              quantity,
              unit: cells.length >= 4 ? (cells[2] || 'UN') : 'UN',
              unitValue: totalValue / quantity,
              totalValue,
            })
          }
        }
      }
    }

    // Fallback: divs com classe "produto"
    if (items.length === 0) {
      const productRegex = /class="[^"]*produto[^"]*"[^>]*>(.*?)<\/div>/gs
      let prodMatch
      while ((prodMatch = productRegex.exec(html)) !== null) {
        const text = prodMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
        const valueMatch = text.match(/(\d+[,\.]\d{2})\s*$/)
        if (valueMatch) {
          const totalValue = parseFloat(valueMatch[1].replace(',', '.'))
          if (totalValue > 0) {
            items.push({
              name: text.replace(valueMatch[0], '').trim(),
              quantity: 1, unit: 'UN',
              unitValue: totalValue, totalValue,
            })
          }
        }
      }
    }

    // Valor total
    const totalMatch =
      html.match(/Valor\s+[Aa]\s+[Pp]agar\s*R\$[:\s]*([\d\.,]+)/) ||
      html.match(/Total\s*R\$[:\s]*([\d\.,]+)/)
    const total = totalMatch
      ? parseFloat(totalMatch[1].replace(/\./g, '').replace(',', '.'))
      : items.reduce((s, i) => s + i.totalValue, 0)

    // Forma de pagamento
    const payment_method = /Cart[ãa]o\s+de\s+D[ée]bito/i.test(html) ? 'debit'
      : /Cart[ãa]o\s+de\s+Cr[eé]dito/i.test(html) ? 'credit'
      : /Pix/i.test(html) ? 'pix'
      : 'cash'

    return new Response(
      JSON.stringify({
        success: true,
        source: 'sefaz_rj',
        merchant,
        cnpj,
        emission_date,
        items,
        total,
        payment_method,
        raw_url: url,
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
