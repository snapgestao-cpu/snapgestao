import React, { useRef, useState, useEffect } from 'react'
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

const EXTRACT_SCRIPT = `
(function() {
  try {
    // ── ESTABELECIMENTO ──
    const merchantEl = document.getElementById('u20')
      || document.querySelector('.txtTopo')
    const merchant = merchantEl
      ? merchantEl.innerText.trim()
      : 'Não identificado'

    // ── CNPJ ──
    let cnpj = null
    const cnpjMatch = document.body.innerText.match(
      /CNPJ[:\\s]*([\\d\\.\\-\\/]+)/
    )
    if (cnpjMatch) {
      cnpj = cnpjMatch[1].replace(/\\D/g, '')
    }

    // ── DATA ──
    const dateMatch = document.body.innerText.match(
      /Emiss[ãa]o[:\\s]*(\\d{2})\\/(\\d{2})\\/(\\d{4})/
    )
    const emissionDate = dateMatch
      ? dateMatch[3]+'-'+dateMatch[2]+'-'+dateMatch[1]
      : new Date().toISOString().split('T')[0]

    // ── ITENS via tabela tabResult ──
    const items = []
    const tbl = document.getElementById('tabResult')

    if (tbl) {
      const rows = tbl.querySelectorAll('tr')
      rows.forEach(function(row) {
        const cells = row.querySelectorAll('td')
        if (cells.length < 2) return

        let rawName = ''
        const nameCell = cells[0]
        const nameLink = nameCell.querySelector('a, span, b')
        if (nameLink) {
          rawName = nameLink.innerText.trim()
        } else {
          const walker = document.createTreeWalker(
            nameCell,
            NodeFilter.SHOW_TEXT,
            null,
            false
          )
          const textParts = []
          let node
          while ((node = walker.nextNode())) {
            const t = node.textContent.trim()
            if (t) textParts.push(t)
          }
          rawName = textParts.join(' ')
        }
        const name = rawName
          .replace(/\\(Código[^)]+\\)/gi, '')
          .replace(/\\s+/g, ' ')
          .trim()

        if (!name || name.length < 3) return

        const infoText = cells.length > 1 ? cells[1].innerText : ''

        const qtdeMatch = infoText.match(/Qtde\\.?:?\\s*([\\d,]+)/i)
        const qty = qtdeMatch
          ? parseFloat(qtdeMatch[1].replace(',', '.'))
          : 1

        const unMatch = infoText.match(/UN:?\\s*(\\w+)/i)
        const unit = unMatch ? unMatch[1] : 'UN'

        const unitMatch = infoText.match(
          /Vl\\.?\\s*Unit\\.?[:\\s]+([\\d\\.]+,[\\d]{2})/i
        )
        const unitValue = unitMatch
          ? parseFloat(unitMatch[1].replace(/\\./g, '').replace(',', '.'))
          : 0

        const lastCell = cells[cells.length - 1]
        const totalText = lastCell.innerText.trim()
        const totalMatch = totalText.match(/([\\d\\.]+,[\\d]{2})/)
        const totalValue = totalMatch
          ? parseFloat(totalMatch[1].replace(/\\./g, '').replace(',', '.'))
          : unitValue * qty

        if (totalValue > 0 && name.length > 2) {
          items.push({
            name: name,
            quantity: qty,
            unit: unit,
            unitValue: unitValue || totalValue / qty,
            totalValue: totalValue
          })
        }
      })
    }

    // ── TOTAL A PAGAR ──
    let total = 0
    const pageText = document.body.innerText

    const totalMatch = pageText.match(
      /Valor\\s+a\\s+pagar\\s+R\\$[:\\s]*\\n?\\s*([\\d\\.]+,[\\d]{2})/i
    ) || pageText.match(
      /Valor\\s+a\\s+pagar[^\\d]*([\\d\\.]+,[\\d]{2})/i
    )

    if (totalMatch) {
      total = parseFloat(totalMatch[1].replace(/\\./g, '').replace(',', '.'))
    }
    if (!total) {
      total = items.reduce(function(s, i) { return s + i.totalValue }, 0)
    }

    // ── DESCONTOS ──
    const discountMatch = pageText.match(
      /Descontos\\s+R\\$[:\\s]*\\n?\\s*([\\d\\.]+,[\\d]{2})/i
    )
    const discount = discountMatch
      ? parseFloat(discountMatch[1].replace(/\\./g, '').replace(',', '.'))
      : 0

    // ── FORMA DE PAGAMENTO ──
    let paymentMethod = 'debit'
    if (/débito|debito|Débito/i.test(pageText)) paymentMethod = 'debit'
    else if (/crédito|credito|Crédito/i.test(pageText)) paymentMethod = 'credit'
    else if (/[Pp]ix/i.test(pageText)) paymentMethod = 'pix'
    else if (/[Dd]inheiro|[Ee]spécie/i.test(pageText)) paymentMethod = 'cash'

    window.ReactNativeWebView.postMessage(JSON.stringify({
      success: items.length > 0,
      source: 'sefaz_rj',
      merchant: merchant,
      cnpj: cnpj,
      emission_date: emissionDate,
      items: items,
      total: total,
      discount: discount,
      payment_method: paymentMethod,
      error: items.length === 0
        ? 'Itens não encontrados na tabela tabResult'
        : null
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
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  // Elapsed-seconds counter — runs while loading
  useEffect(() => {
    if (!loading) return
    const timer = setInterval(() => setElapsedSeconds(s => s + 1), 1000)
    return () => clearInterval(timer)
  }, [loading])

  // 30-second timeout
  useEffect(() => {
    const timeout = setTimeout(() => {
      setLoading(prev => {
        if (prev) {
          console.log('[WebView] TIMEOUT — 30s sem resposta')
          onError('Tempo limite excedido.\n\nO portal da SEFAZ demorou demais. Verifique sua conexão e tente novamente.')
          return false
        }
        return prev
      })
    }, 30000)
    return () => clearTimeout(timeout)
  }, [])

  const finishLoading = (ok: boolean) => {
    setLoading(false)
    setElapsedSeconds(0)
  }

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
          <Text style={{ marginTop: 8, fontSize: 12, color: Colors.textMuted }}>
            {elapsedSeconds}s
          </Text>
          {elapsedSeconds > 10 && (
            <Text style={{ marginTop: 8, fontSize: 12, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: 32 }}>
              Isso está demorando mais que o normal.{'\n'}Verifique sua conexão.
            </Text>
          )}
          {elapsedSeconds > 15 && (
            <TouchableOpacity
              onPress={onCancel}
              style={{
                marginTop: 16, paddingHorizontal: 24, paddingVertical: 10,
                backgroundColor: Colors.background, borderRadius: 20,
                borderWidth: 1, borderColor: Colors.border,
              }}
            >
              <Text style={{ fontSize: 14, color: Colors.textMuted }}>Cancelar</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* WebView — always opacity 0 (data extracted via JS injection) */}
      <WebView
        ref={webViewRef}
        source={{ uri: url }}
        style={{ flex: 1, opacity: 0 }}
        userAgent="Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebView/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
        javaScriptEnabled={true}
        domStorageEnabled={true}
        onLoadStart={() => {
          console.log('[WebView] Iniciando carregamento | URL:', url)
          setLoading(true)
          setLoadingMessage('Conectando à SEFAZ...')
        }}
        onLoadProgress={({ nativeEvent }) => {
          console.log('[WebView] Progresso:', Math.round(nativeEvent.progress * 100) + '%')
          if (nativeEvent.progress > 0.5) setLoadingMessage('Carregando dados...')
        }}
        onLoadEnd={() => {
          console.log('[WebView] Carregamento concluído — aguardando 3s para injetar JS')
          setLoadingMessage('Extraindo itens...')
          setTimeout(() => {
            console.log('[WebView] Injetando script de extração')
            webViewRef.current?.injectJavaScript(EXTRACT_SCRIPT + '; true;')
          }, 3000)
        }}
        onMessage={({ nativeEvent }) => {
          console.log('[WebView] Mensagem recebida do JS')
          finishLoading(true)
          try {
            const data = JSON.parse(nativeEvent.data) as any
            console.log('[WebView] success:', data.success, '| items:', data.items?.length ?? 0, '| merchant:', data.merchant, '| error:', data.error)
            if (data.error === 'blocked') {
              console.log('[WebView] IP BLOQUEADO pela SEFAZ')
              onError('Acesso bloqueado pela SEFAZ.\n\nTente conectar em uma rede Wi-Fi diferente ou use a opção OCR.')
              return
            }
            if (data.error || !data.success) {
              console.log('[WebView] Falha na extração:', data.error || data.message)
              onError(data.message || 'Não foi possível extrair os itens.')
              return
            }
            console.log('[WebView] Extração bem-sucedida!')
            onSuccess(data as NFCeResult)
          } catch (e) {
            console.log('[WebView] Erro ao fazer parse:', String(e), '| raw:', nativeEvent.data?.substring(0, 200))
            onError('Erro ao processar resposta da SEFAZ.')
          }
        }}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent
          console.log('[WebView] ERRO de carregamento | código:', (nativeEvent as any).code, '| desc:', nativeEvent.description, '| url:', nativeEvent.url)
          finishLoading(false)
          onError('Erro de conexão com o portal da SEFAZ.\n' + nativeEvent.description)
        }}
        onHttpError={({ nativeEvent }) => {
          console.log('[WebView] HTTP ERROR | status:', nativeEvent.statusCode, '| url:', nativeEvent.url)
        }}
      />
    </View>
  )
}
