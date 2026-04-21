import React, { useRef, useState } from 'react'
import { View, Text, ActivityIndicator, TouchableOpacity, Alert } from 'react-native'
import { WebView } from 'react-native-webview'
import { Colors } from '../constants/colors'
import type { NFCeResult } from '../lib/ocr'

type Props = {
  url: string
  onSuccess: (result: NFCeResult) => void
  onError: (message: string) => void
  onCancel: () => void
}

// Debug script — captures raw HTML info to understand SEFAZ-RJ page structure
const EXTRACT_SCRIPT = `
(function() {
  try {
    const html = document.documentElement.outerHTML
    const text = document.body ? (document.body.innerText || '') : ''
    window.ReactNativeWebView.postMessage(JSON.stringify({
      debug: true,
      html_length: html.length,
      text_preview: text.substring(0, 2000),
      html_preview: html.substring(0, 3000),
      title: document.title,
      url: window.location.href,
      body_classes: document.body ? document.body.className : '',
      tables_count: document.querySelectorAll('table').length,
      tables_ids: Array.from(document.querySelectorAll('table')).map(function(t) { return t.id || t.className }).join(', '),
      h_tags: Array.from(document.querySelectorAll('h1,h2,h3,h4,h5')).map(function(h) { return h.innerText.trim() }).join(' | '),
      spans_count: document.querySelectorAll('span').length,
    }))
  } catch(e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ error: String(e) }))
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
          }, 3000)
        }}
        onMessage={({ nativeEvent }) => {
          setLoading(false)
          try {
            const data = JSON.parse(nativeEvent.data) as any
            if (data.debug) {
              Alert.alert('Debug HTML',
                'Title: ' + data.title + '\nURL: ' + data.url +
                '\nHTML length: ' + data.html_length +
                '\nTables: ' + data.tables_count + '\nTables IDs: ' + data.tables_ids +
                '\nH tags: ' + data.h_tags +
                '\n\nTEXT:\n' + data.text_preview
              )
              console.log('=== DEBUG SEFAZ ===')
              console.log('title:', data.title)
              console.log('url:', data.url)
              console.log('html_length:', data.html_length)
              console.log('tables:', data.tables_count, data.tables_ids)
              console.log('h_tags:', data.h_tags)
              console.log('text_preview:', data.text_preview)
              console.log('html_preview:', data.html_preview)
              console.log('=== FIM DEBUG ===')
              return
            }
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
