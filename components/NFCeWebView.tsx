import React, { useRef, useState } from 'react'
import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native'
import { WebView } from 'react-native-webview'
import { Colors } from '../constants/colors'
import type { NFCeResult } from '../lib/ocr'

type Props = {
  url: string
  onSuccess: (result: NFCeResult) => void
  onError: (message: string) => void
  onCancel: () => void
}

// Injected after page load — runs in the WebView JS context
const EXTRACT_SCRIPT = `
(function() {
  try {
    const bodyText = document.body ? (document.body.innerText || '') : ''

    if (bodyText.includes('bloqueia acessos') ||
        bodyText.includes('endere\\u00e7o IP') ||
        bodyText.includes('acesso negado')) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        error: 'blocked',
        message: 'IP bloqueado pela SEFAZ'
      }))
      return
    }

    // ── ESTABELECIMENTO ──
    let merchant = ''
    const h4 = document.querySelector('h4')
    if (h4) merchant = h4.innerText.trim()
    if (!merchant) {
      const divs = document.querySelectorAll('div')
      for (const d of divs) {
        const t = (d.innerText || '').trim()
        if (t.length > 5 && t.length < 100 &&
            t === t.toUpperCase() &&
            !t.includes('CNPJ') && !t.includes('NFC') &&
            !t.includes('\\n')) {
          merchant = t
          break
        }
      }
    }

    // ── CNPJ ──
    const pageText = document.body ? document.body.innerText : ''
    const cnpjMatch = pageText.match(/\\d{2}\\.\\d{3}\\.\\d{3}\\/\\d{4}-\\d{2}/)
    const cnpj = cnpjMatch ? cnpjMatch[0].replace(/\\D/g, '') : null

    // ── DATA ──
    const dateMatch = pageText.match(/(\\d{2})\\/(\\d{2})\\/(\\d{4})/)
    const emissionDate = dateMatch
      ? dateMatch[3] + '-' + dateMatch[2] + '-' + dateMatch[1]
      : new Date().toISOString().split('T')[0]

    // ── ITENS ──
    const items = []

    // Estratégia 1: table#tblItens
    const tbl = document.getElementById('tblItens')
    if (tbl) {
      tbl.querySelectorAll('tr').forEach(function(row) {
        const cells = row.querySelectorAll('td')
        if (cells.length >= 2) {
          const name = cells[0].innerText.trim()
          const lastVal = cells[cells.length - 1].innerText.trim()
          const val = parseFloat(lastVal.replace(/\\./g, '').replace(',', '.'))
          if (name && val > 0 && val < 100000) {
            const qty = cells.length >= 4
              ? (parseFloat((cells[1].innerText || '1').replace(',', '.')) || 1)
              : 1
            items.push({
              name: name,
              quantity: qty,
              unit: cells.length >= 4 ? (cells[2].innerText.trim() || 'UN') : 'UN',
              unitValue: val / qty,
              totalValue: val
            })
          }
        }
      })
    }

    // Estratégia 2: texto puro linha a linha
    if (items.length === 0) {
      const allText = []
      document.querySelectorAll('span, td, div, p').forEach(function(el) {
        if (el.children.length === 0) {
          const t = (el.innerText || '').trim()
          if (t) allText.push(t)
        }
      })

      for (var i = 0; i < allText.length; i++) {
        var line = allText[i]
        if (line.length > 4 &&
            /^[A-Z\\u00C0-\\u00FF]/.test(line) &&
            /[A-Z]{3,}/.test(line) &&
            !/^(CNPJ|CPF|TOTAL|VALOR|FORMA|DATA|NFC|SERIE|CHAVE|PROTOCOLO|DANFE)/.test(line)) {

          var totalVal = 0
          var qty = 1
          var unit = 'UN'

          for (var j = 1; j <= 5 && i + j < allText.length; j++) {
            var next = allText[i + j]

            var qtdeM = next.match(/Qtde\\.?:?\\s*([\\d,]+)/i)
            if (qtdeM) qty = parseFloat(qtdeM[1].replace(',', '.')) || 1

            var unM = next.match(/\\bUN:?\\s*(\\w+)/i)
            if (unM) unit = unM[1]

            var totM = next.match(/(?:Vl\\.?\\s*Total|Total)\\s*R?\\$?\\s*([\\d\\.]+,[\\d]{2})/i)
            if (totM) {
              totalVal = parseFloat(totM[1].replace(/\\./g, '').replace(',', '.'))
              break
            }

            var unitM = next.match(/Vl\\.?\\s*Unit\\.?:?\\s*([\\d\\.]+,[\\d]{2})/i)
            if (unitM) {
              var uv = parseFloat(unitM[1].replace(/\\./g, '').replace(',', '.'))
              totalVal = uv * qty
            }
          }

          if (totalVal > 0 && totalVal < 100000) {
            items.push({
              name: line,
              quantity: qty,
              unit: unit,
              unitValue: totalVal / qty,
              totalValue: totalVal
            })
          }
        }
      }
    }

    // ── TOTAL ──
    var total = 0
    var totalMatch = pageText.match(/Valor\\s+a\\s+pagar\\s*R?\\$?\\s*([\\d\\.]+,[\\d]{2})/i)
    if (totalMatch) {
      total = parseFloat(totalMatch[1].replace(/\\./g, '').replace(',', '.'))
    }
    if (!total) total = items.reduce(function(s, it) { return s + it.totalValue }, 0)

    // ── PAGAMENTO ──
    var pm = 'debit'
    if (/d\\u00e9bito|debito/i.test(pageText)) pm = 'debit'
    else if (/cr\\u00e9dito|credito/i.test(pageText)) pm = 'credit'
    else if (/pix/i.test(pageText)) pm = 'pix'
    else if (/dinheiro|esp\\u00e9cie/i.test(pageText)) pm = 'cash'

    window.ReactNativeWebView.postMessage(JSON.stringify({
      success: items.length > 0,
      source: 'sefaz_rj',
      merchant: merchant,
      cnpj: cnpj,
      emission_date: emissionDate,
      items: items,
      total: total,
      payment_method: pm,
      error: items.length === 0 ? 'Itens n\\u00e3o encontrados na p\\u00e1gina' : null
    }))

  } catch(e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      error: 'parse_error',
      message: String(e)
    }))
  }
})()
`

export default function NFCeWebView({ url, onSuccess, onError, onCancel }: Props) {
  const webViewRef = useRef<WebView>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMessage, setLoadingMessage] = useState('Conectando à SEFAZ...')

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        padding: 16, paddingTop: 52,
        backgroundColor: Colors.primary, gap: 12,
      }}>
        <TouchableOpacity onPress={onCancel} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={{ color: '#fff', fontSize: 18 }}>✕</Text>
        </TouchableOpacity>
        <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600', flex: 1 }}>
          Buscando dados do cupom...
        </Text>
      </View>

      {/* Loading overlay */}
      {loading && (
        <View style={{
          position: 'absolute', top: 88, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(255,255,255,0.97)',
          justifyContent: 'center', alignItems: 'center', zIndex: 10,
        }}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={{ marginTop: 16, fontSize: 15, color: Colors.textDark, fontWeight: '600' }}>
            {loadingMessage}
          </Text>
          <Text style={{ marginTop: 8, fontSize: 12, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: 32 }}>
            Buscando dados estruturados da SEFAZ-RJ
          </Text>
        </View>
      )}

      {/* WebView — opaque while loading, hidden after data extracted */}
      <WebView
        ref={webViewRef}
        source={{ uri: url }}
        style={{ flex: 1, opacity: loading ? 0 : 0 }}
        userAgent="Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebView/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
        javaScriptEnabled={true}
        domStorageEnabled={true}
        onLoadStart={() => {
          setLoading(true)
          setLoadingMessage('Conectando à SEFAZ...')
        }}
        onLoadProgress={({ nativeEvent }) => {
          if (nativeEvent.progress > 0.5) setLoadingMessage('Carregando dados...')
        }}
        onLoadEnd={() => {
          setLoadingMessage('Extraindo itens...')
          // Wait 1.5s for page JS to finish rendering before extracting
          setTimeout(() => {
            webViewRef.current?.injectJavaScript(EXTRACT_SCRIPT + '; true;')
          }, 1500)
        }}
        onMessage={({ nativeEvent }) => {
          setLoading(false)
          try {
            const data = JSON.parse(nativeEvent.data) as any
            if (data.error === 'blocked') {
              onError('Acesso bloqueado pela SEFAZ.\n\nTente conectar em uma rede Wi-Fi diferente ou use a opção OCR.')
              return
            }
            if (data.error || !data.success) {
              onError(data.message || 'Não foi possível extrair os itens.')
              return
            }
            onSuccess(data as NFCeResult)
          } catch {
            onError('Erro ao processar resposta da SEFAZ.')
          }
        }}
        onError={() => {
          setLoading(false)
          onError('Erro de conexão com o portal da SEFAZ.')
        }}
      />
    </View>
  )
}
