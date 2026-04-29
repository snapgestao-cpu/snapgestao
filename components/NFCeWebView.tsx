import React, { useRef, useState, useEffect } from 'react'
import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native'
import { WebView } from 'react-native-webview'
import { Colors } from '../constants/colors'
import type { NFCeResult } from '../lib/ocr'
import type { NFCeState } from '../lib/nfce-states'

type Props = {
  url: string
  state?: NFCeState | null
  chaveAcesso?: string | null
  stateCode?: string
  onSuccess: (result: NFCeResult) => void
  onError: (message: string) => void
  onCancel: () => void
}

// Exported so ocr.tsx can call it before passing the URL — called ONCE per QR scan
export function sanitizeNFCeUrl(raw: string): string {
  let url = raw.trim()

  // Strip any prefix before "http" — e.g. "<qrcode>https://..."
  const httpIdx = url.indexOf('http')
  if (httpIdx > 0) {
    url = url.substring(httpIdx)
  }

  // Fix double-protocol http://https://
  url = url.replace(/^https?:\/\/https?:\/\//i, 'https://')

  if (!url.startsWith('https://') && !url.startsWith('http://')) {
    url = 'https://' + url
  }

  // Encode pipes in query string only
  const idx = url.indexOf('?')
  if (idx > -1) {
    const base = url.substring(0, idx)
    const query = url.substring(idx + 1)
    url = base + '?' + query.replace(/\|/g, '%7C')
  }

  console.log('[URL] Sanitizada:', url)
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
    url.includes('resultadoDFe') ||
    url.includes('consultaChaveAcesso') ||
    url.includes('ConsultaChaveDeAcesso') ||
    url.includes('consultaChaveAcesso.xhtml') ||
    url.includes('consultaDFe') ||
    (!genericIsRedirectUrl(url) && url !== 'about:blank' && url.length > 10)
  )
}

function buildChaveAcessoUrl(chave: string, stateCode: string): string {
  if (stateCode === '33') {
    return 'https://consultadfe.fazenda.rj.gov.br/consultaDFe/paginas/consultaChaveAcesso.faces'
  }
  if (stateCode === '35') {
    return 'https://www.nfce.fazenda.sp.gov.br/NFCeConsultaPublica/Paginas/ConsultaChaveDeAcesso.aspx'
  }
  if (stateCode === '31') {
    return 'https://portalsped.fazenda.mg.gov.br/portalnfce/system/pages/consultaNFCe/consultaChaveAcesso.xhtml'
  }
  return 'https://consultadfe.fazenda.rj.gov.br/consultaDFe/paginas/consultaChaveAcesso.faces'
}

function isChaveAcessoUrl(url: string): boolean {
  return (
    url.includes('consultaChaveAcesso') ||
    url.includes('ConsultaChaveDeAcesso')
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
      // Prioridade: "Valor a pagar" (após desconto). Fallback: subtotal - desconto. Último: soma dos itens.
      var total = 0
      var totalPatterns = [
        /Valor\\s+a\\s+pagar[\\s\\S]{0,60}?([\\d\\.]+,[\\d]{2})/i,
        /Valor\\s+pago[\\s\\S]{0,60}?([\\d\\.]+,[\\d]{2})/i,
        /Total\\s+a\\s+pagar[\\s\\S]{0,60}?([\\d\\.]+,[\\d]{2})/i,
      ]
      for (var pi = 0; pi < totalPatterns.length; pi++) {
        var tm = bodyText.match(totalPatterns[pi])
        if (tm) { total = parseFloat(tm[1].replace(/\\./g, '').replace(',', '.')); break }
      }
      if (!total) {
        var subtotalMatch = bodyText.match(/Valor\\s+Total[\\s\\S]{0,30}?([\\d\\.]+,[\\d]{2})/i)
        var descontoMatch = bodyText.match(/Desconto[\\s\\S]{0,30}?([\\d\\.]+,[\\d]{2})/i)
        if (subtotalMatch) {
          var sub = parseFloat(subtotalMatch[1].replace(/\\./g, '').replace(',', '.'))
          var desc = descontoMatch ? parseFloat(descontoMatch[1].replace(/\\./g, '').replace(',', '.')) : 0
          total = sub - desc
        }
      }
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

export default function NFCeWebView({ url, state, chaveAcesso, stateCode, onSuccess, onError, onCancel }: Props) {
  const webViewRef = useRef<WebView>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMessage, setLoadingMessage] = useState('Conectando à SEFAZ...')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [tentativaAlternativa, setTentativaAlternativa] = useState(false)

  const scriptInjectedRef = useRef(false)
  const loadEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // url is already sanitized by ocr.tsx — do NOT call sanitizeNFCeUrl again here
  const finalUrlRef = useRef(url)
  const sawRedirectRef = useRef(
    state ? state.isRedirectUrl(url) : genericIsRedirectUrl(url)
  )

  const checkIsRedirect = (u: string) => state ? state.isRedirectUrl(u) : genericIsRedirectUrl(u)
  const checkIsFinal = (u: string) => {
    if (state) {
      return state.isFinalUrl(u) ||
        u.includes('resultadoQRCode') ||
        u.includes('resultadoNfce') ||
        u.includes('resultadoDFe')
    }
    return genericIsFinalResultUrl(u)
  }

  // Reset flags when url prop changes
  useEffect(() => {
    setTentativaAlternativa(false)
    scriptInjectedRef.current = false
    finalUrlRef.current = url
  }, [url])

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
        mixedContentMode="always"
        onNavigationStateChange={(navState) => {
          const navUrl = navState.url
          if (!navUrl || navUrl === 'about:blank') return

          console.log('[WebView] Navegando para:', navUrl.substring(0, 100))

          // Chegou na página de consulta por chave — preencher e submeter formulário
          if (isChaveAcessoUrl(navUrl) && chaveAcesso && !scriptInjectedRef.current) {
            console.log('[WebView] Página de chave carregada — preenchendo formulário')
            scriptInjectedRef.current = true  // evitar double-fill

            setTimeout(() => {
              const fillScript = `
(function() {
  try {
    var input =
      document.querySelector('input[type="text"]') ||
      document.querySelector('input[name*="chave"]') ||
      document.querySelector('input[id*="chave"]') ||
      document.querySelector('input[maxlength="44"]') ||
      document.querySelector('input[maxlength="48"]') ||
      document.querySelector('input');

    if (input) {
      input.value = '${chaveAcesso}';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      console.log('[Form] Campo preenchido com chave');

      var btn =
        document.querySelector('input[type="submit"]') ||
        document.querySelector('button[type="submit"]') ||
        document.querySelector('button') ||
        document.querySelector('input[type="button"]');

      if (btn) {
        console.log('[Form] Clicando no botão');
        btn.click();
      } else {
        var form = document.querySelector('form');
        if (form) {
          console.log('[Form] Submetendo form');
          form.submit();
        }
      }
    } else {
      console.log('[Form] Campo não encontrado');
      var inputs = document.querySelectorAll('input');
      console.log('[Form] Inputs encontrados:', inputs.length);
      inputs.forEach(function(inp, i) {
        console.log('[Form] Input ' + i + ':', inp.type, inp.name, inp.id, inp.maxLength);
      });
    }
  } catch(e) {
    console.log('[Form] Erro:', String(e));
  }
})();`
              // Reset scriptInjectedRef so EXTRACT_SCRIPT can run on the result page
              scriptInjectedRef.current = false
              webViewRef.current?.injectJavaScript(fillScript + '; true;')
            }, 2000)
            return
          }

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

          // Chave-acesso page handled by onNavigationStateChange fill script
          if (isChaveAcessoUrl(currentUrl)) {
            console.log('[WebView] onLoadEnd ignorado — URL de consulta por chave')
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

            if (data.error === 'blocked') {
              setLoading(false)
              onError('Acesso bloqueado pela SEFAZ.\n\nTente em uma rede Wi-Fi diferente\nou use a opção OCR.')
              return
            }

            if (data.error === 'timeout') {
              console.log('[WebView] Timeout detectado')

              if (chaveAcesso && !tentativaAlternativa) {
                console.log('[WebView] Tentando URL alternativa com chave:', chaveAcesso.substring(0, 10))
                const altUrl = buildChaveAcessoUrl(chaveAcesso, stateCode || '33')
                console.log('[WebView] URL alternativa:', altUrl)

                setTentativaAlternativa(true)
                setLoadingMessage('Tentando consulta por chave de acesso...')
                scriptInjectedRef.current = false
                sawRedirectRef.current = false
                finalUrlRef.current = altUrl

                webViewRef.current?.injectJavaScript(
                  `window.location.href = '${altUrl}'; true;`
                )
                return
              }

              setLoading(false)
              onError(
                'Não foi possível carregar o cupom.\n\n' +
                'O portal da SEFAZ demorou para responder.\n' +
                'Verifique sua conexão e tente novamente.'
              )
              return
            }

            if (!data.success || !data.items?.length) {
              setLoading(false)
              onError(data.error || 'Não foi possível extrair os itens.\nTente a opção OCR como alternativa.')
              return
            }

            console.log('[WebView] Extração bem-sucedida! Items:', data.items.length, '| merchant:', data.merchant)
            setLoading(false)
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
