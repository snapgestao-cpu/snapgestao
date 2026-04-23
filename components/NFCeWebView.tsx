import React, { useRef, useState, useEffect } from 'react'
import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native'
import { WebView } from 'react-native-webview'
import { Colors } from '../constants/colors'
import type { NFCeResult } from '../lib/ocr'
import type { NFCeState } from '../lib/nfce-states'

type Props = {
  url: string
  state?: NFCeState | null
  onSuccess: (result: NFCeResult) => void
  onError: (message: string) => void
  onCancel: () => void
}

// Exported so ocr.tsx can call it before passing the URL
export function sanitizeNFCeUrl(raw: string): string {
  let url = raw.trim()
  url = url.replace(/^https?:\/\/https?:\/\//i, 'https://')
  url = url.replace(/^http:\/\/(https:\/\/)/i, '$1')
  if (!url.startsWith('https://') && !url.startsWith('http://')) {
    url = 'https://' + url
  }
  const idx = url.indexOf('?')
  if (idx > -1) {
    url = url.substring(0, idx + 1) + url.substring(idx + 1).replace(/\|/g, '%7C')
  }
  return url
}

// Generic fallbacks used when no state is provided
function genericIsRedirectUrl(url: string): boolean {
  return url.includes('QRCode?p=') || url.includes('qrcode?p=')
}

function genericIsFinalResultUrl(url: string): boolean {
  return (
    url.includes('resultadoQRCode') ||
    url.includes('resultadoNfce') ||
    url.includes('consultaChaveAcesso') ||
    url.includes('consultaDFe') ||
    (!genericIsRedirectUrl(url) && url !== 'about:blank' && url.length > 10)
  )
}

// Internal polling script — waits up to 15s for jQuery Mobile to render the body
const EXTRACT_SCRIPT = `
(function() {
  function tryExtract(attempt) {
    try {
      var bodyText = document.body ? document.body.innerText || '' : ''
      var bodyLen = bodyText.trim().length

      console.log('[Script] Tentativa ' + attempt + ' | bodyLength: ' + bodyLen)

      if (bodyText.includes('bloqueia acessos') || bodyText.includes('endereço IP')) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ error: 'blocked' }))
        return
      }

      if (bodyLen < 200) {
        if (attempt < 15) {
          setTimeout(function() { tryExtract(attempt + 1) }, 1000)
        } else {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            error: 'timeout',
            message: 'Página não carregou em 15s',
            bodyLength: bodyLen
          }))
        }
        return
      }

      console.log('[Script] Body pronto! Extraindo...')

      // ── ESTABELECIMENTO ──
      var merchantEl = document.getElementById('u20')
        || document.querySelector('.txtTopo')
        || document.querySelector('[class*="topo"]')
      var merchant = merchantEl ? merchantEl.innerText.trim() : 'Não identificado'

      // ── TABELA DE ITENS ──
      var tbl = document.getElementById('tabResult')
        || document.querySelector('table[data-filter]')
        || document.querySelector('table')

      console.log('[Script] Tabela:', tbl ? (tbl.id || tbl.className) : 'não encontrada')

      var items = []

      if (tbl) {
        var rows = tbl.querySelectorAll('tr')
        console.log('[Script] Linhas:', rows.length)

        rows.forEach(function(row) {
          var cells = row.querySelectorAll('td')
          if (cells.length < 2) return

          var rawName = cells[0].innerText.trim()
          var name = rawName
            .replace(/\\(Código[^)]+\\)/gi, '')
            .replace(/\\s+/g, ' ')
            .trim()

          if (!name || name.length < 3) return

          var infoText = cells.length > 1 ? cells[1].innerText : ''

          var qtdeMatch = infoText.match(/Qtde\\.?:?\\s*([\\d,]+)/i)
          var qty = qtdeMatch ? parseFloat(qtdeMatch[1].replace(',', '.')) : 1

          var unMatch = infoText.match(/UN:?\\s*(\\w+)/i)
          var unit = unMatch ? unMatch[1] : 'UN'

          var lastCell = cells[cells.length - 1]
          var totalText = lastCell.innerText.trim()
          var totalMatch = totalText.match(/([\\d\\.]+,[\\d]{2})/)
          var totalValue = totalMatch
            ? parseFloat(totalMatch[1].replace(/\\./g, '').replace(',', '.'))
            : 0

          if (totalValue > 0 && name.length > 2) {
            items.push({
              name: name,
              quantity: qty,
              unit: unit,
              unitValue: totalValue / qty,
              totalValue: totalValue
            })
          }
        })
      }

      // ── TOTAL ──
      var total = 0
      var totalMatch2 = bodyText.match(/Valor\\s+a\\s+pagar\\s+R\\$[:\\s]*\\n?\\s*([\\d\\.]+,[\\d]{2})/i)
        || bodyText.match(/Valor\\s+a\\s+pagar[^\\d]*([\\d\\.]+,[\\d]{2})/i)
      if (totalMatch2) total = parseFloat(totalMatch2[1].replace(/\\./g, '').replace(',', '.'))
      if (!total) total = items.reduce(function(s, i) { return s + i.totalValue }, 0)

      // ── DATA ──
      var dateMatch = bodyText.match(/Emiss[ãa]o[:\\s]*(\\d{2})\\/(\\d{2})\\/(\\d{4})/)
      var emissionDate = dateMatch
        ? dateMatch[3] + '-' + dateMatch[2] + '-' + dateMatch[1]
        : new Date().toISOString().split('T')[0]

      // ── CNPJ ──
      var cnpjMatch = bodyText.match(/CNPJ[:\\s]*([\\d\\.\\-\\/]+)/)
      var cnpj = cnpjMatch ? cnpjMatch[1].replace(/\\D/g, '') : null

      // ── PAGAMENTO ──
      var paymentMethod = 'debit'
      var payText = bodyText.toLowerCase()
      if (payText.includes('débito') || payText.includes('debito') ||
          payText.includes('cartão de débito') || payText.includes('cartao de debito'))
        paymentMethod = 'debit'
      else if (payText.includes('crédito') || payText.includes('credito') ||
          payText.includes('cartão de crédito') || payText.includes('cartao de credito'))
        paymentMethod = 'credit'
      else if (payText.includes('pix'))
        paymentMethod = 'pix'
      else if (payText.includes('dinheiro') || payText.includes('espécie') ||
          payText.includes('especie') || payText.includes('cash'))
        paymentMethod = 'cash'
      else if (payText.includes('transferência') || payText.includes('transferencia'))
        paymentMethod = 'transfer'
      console.log('[Script] Pagamento detectado:', paymentMethod)

      window.ReactNativeWebView.postMessage(JSON.stringify({
        success: items.length > 0,
        source: 'sefaz_rj',
        merchant: merchant,
        cnpj: cnpj,
        emission_date: emissionDate,
        items: items,
        total: total,
        payment_method: paymentMethod,
        error: items.length === 0 ? 'Itens não encontrados após ' + attempt + ' tentativas' : null
      }))

    } catch(e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ error: 'parse_error', message: String(e) }))
    }
  }

  tryExtract(1)
})()
`

export default function NFCeWebView({ url, state, onSuccess, onError, onCancel }: Props) {
  const webViewRef = useRef<WebView>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMessage, setLoadingMessage] = useState('Conectando à SEFAZ...')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  const scriptInjectedRef = useRef(false)
  const loadEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const finalUrlRef = useRef(sanitizeNFCeUrl(url))
  const sawRedirectRef = useRef(
    state ? state.isRedirectUrl(sanitizeNFCeUrl(url)) : genericIsRedirectUrl(sanitizeNFCeUrl(url))
  )

  const checkIsRedirect = (u: string) => state ? state.isRedirectUrl(u) : genericIsRedirectUrl(u)
  const checkIsFinal = (u: string) => state ? state.isFinalUrl(u) : genericIsFinalResultUrl(u)

  // Elapsed-seconds counter
  useEffect(() => {
    if (!loading) return
    const timer = setInterval(() => setElapsedSeconds(s => s + 1), 1000)
    return () => clearInterval(timer)
  }, [loading])

  // Global 35s timeout
  useEffect(() => {
    const globalTimeout = setTimeout(() => {
      setLoading(prev => {
        if (!prev) return prev
        console.log('[WebView] TIMEOUT GLOBAL 35s')
        onError('Tempo limite excedido.\n\nO portal da SEFAZ demorou demais.\nVerifique sua conexão e tente novamente.')
        return false
      })
    }, 35000)
    return () => {
      clearTimeout(globalTimeout)
      if (loadEndTimerRef.current) clearTimeout(loadEndTimerRef.current)
    }
  }, [])

  const injectScript = () => {
    if (scriptInjectedRef.current) return
    scriptInjectedRef.current = true
    console.log('[WebView] Injetando script de extração')
    webViewRef.current?.injectJavaScript(EXTRACT_SCRIPT + '; true;')
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
            {state ? `Consultando SEFAZ-${state.uf}...` : 'Consultando portal fiscal...'}
          </Text>
          <Text style={{ marginTop: 4, fontSize: 12, color: Colors.textMuted }}>
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

      {/* WebView — always hidden; data extracted via JS injection */}
      <WebView
        ref={webViewRef}
        source={{ uri: finalUrlRef.current }}
        style={{ flex: 1, opacity: 0 }}
        userAgent="Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebView/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
        javaScriptEnabled={true}
        domStorageEnabled={true}
        onNavigationStateChange={(navState) => {
          const navUrl = navState.url
          if (!navUrl || navUrl === 'about:blank') return

          console.log('[WebView] Navegando para:', navUrl.substring(0, 100))

          if (checkIsRedirect(navUrl)) {
            sawRedirectRef.current = true
            finalUrlRef.current = navUrl
            console.log('[WebView] URL de redirect — aguardando resultado...')
            return
          }

          if (sawRedirectRef.current && checkIsFinal(navUrl) && scriptInjectedRef.current) {
            console.log('[WebView] Resultado detectado após redirect — resetando scriptInjectedRef')
            scriptInjectedRef.current = false
          }

          finalUrlRef.current = navUrl
        }}
        onLoadStart={() => {
          console.log('[WebView] onLoadStart | URL:', finalUrlRef.current.substring(0, 100))
          setLoading(true)
          setLoadingMessage('Conectando à SEFAZ...')
        }}
        onLoadProgress={({ nativeEvent }) => {
          if (nativeEvent.progress > 0.5) setLoadingMessage('Carregando dados...')
        }}
        onLoadEnd={() => {
          const currentUrl = finalUrlRef.current

          console.log('[WebView] onLoadEnd | URL:', currentUrl.substring(0, 80),
            '| é redirect:', checkIsRedirect(currentUrl),
            '| é resultado:', checkIsFinal(currentUrl),
            '| já injetou:', scriptInjectedRef.current)

          if (loadEndTimerRef.current) {
            clearTimeout(loadEndTimerRef.current)
            loadEndTimerRef.current = null
          }

          if (scriptInjectedRef.current) {
            console.log('[WebView] onLoadEnd ignorado — script já injetado')
            return
          }

          if (checkIsRedirect(currentUrl)) {
            console.log('[WebView] onLoadEnd ignorado — ainda na URL de redirect')
            return
          }

          console.log('[WebView] Agendando injeção na página de resultado')
          setLoadingMessage('Extraindo itens...')
          loadEndTimerRef.current = setTimeout(injectScript, 1000)
        }}
        onMessage={({ nativeEvent }) => {
          try {
            const data = JSON.parse(nativeEvent.data) as any
            console.log('[WebView] Mensagem | success:', data.success, '| items:', data.items?.length ?? 0, '| error:', data.error)

            setLoading(false)

            if (data.error === 'blocked') {
              onError('Acesso bloqueado pela SEFAZ.\n\nTente em uma rede Wi-Fi diferente\nou use a opção OCR.')
              return
            }

            if (data.error === 'timeout') {
              onError('A página da SEFAZ demorou para carregar.\nVerifique sua conexão e tente novamente.')
              return
            }

            if (!data.success || !data.items?.length) {
              onError(data.error || 'Não foi possível extrair os itens.\nTente a opção OCR como alternativa.')
              return
            }

            console.log('[WebView] Extração bem-sucedida! Items:', data.items.length, '| merchant:', data.merchant)
            onSuccess(data as NFCeResult)
          } catch (e) {
            console.log('[WebView] Erro parse:', String(e))
            setLoading(false)
            onError('Erro ao processar resposta da SEFAZ.')
          }
        }}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent
          console.log('[WebView] ERRO | código:', (nativeEvent as any).code, '| desc:', nativeEvent.description)
          setLoading(false)
          onError('Erro de conexão com a SEFAZ.\nVerifique sua conexão e tente novamente.')
        }}
        onHttpError={({ nativeEvent }) => {
          console.log('[WebView] HTTP ERROR | status:', nativeEvent.statusCode, '| url:', nativeEvent.url?.substring(0, 100))
        }}
      />
    </View>
  )
}
