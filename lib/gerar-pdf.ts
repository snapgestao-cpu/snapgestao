import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import * as FileSystem from 'expo-file-system/legacy'

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function markdownToHtml(texto: string): string {
  return texto
    // Headers — ordem: ### antes de ## antes de #
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Negrito
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Itálico
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Listas com bullet
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    // Listas numeradas
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // Quebras de linha duplas viram parágrafos
    .replace(/\n\n/g, '</p><p>')
    // Quebras simples viram <br>
    .replace(/\n/g, '<br>')
    // Envolver em parágrafo
    .replace(/^(.)/, '<p>$1') + '</p>'
}

function getProviderInfo(provider: string): { icon: string; name: string } {
  switch (provider) {
    case 'claude':  return { icon: '🤖', name: 'Claude' }
    case 'gemini':  return { icon: '✨', name: 'Gemini' }
    case 'groq':    return { icon: '🦙', name: 'Llama' }
    default:        return { icon: '🤖', name: 'IA' }
  }
}

function buildHtml(relatorio: string, userName: string, dataGeracao: string, logoBase64?: string, provider: string = 'claude'): string {
  const conteudoHTML = markdownToHtml(relatorio)
  const safeUser = escapeHtml(userName)
  const providerInfo = getProviderInfo(provider)

  const logoImg = logoBase64
    ? `<img src="data:image/png;base64,${logoBase64}" style="width:56px;height:56px;border-radius:12px;background:rgba(255,255,255,0.15);padding:4px;object-fit:contain;" />`
    : `<div style="width:56px;height:56px;background:rgba(255,255,255,0.2);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:28px;">🫙</div>`

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Relatório Mentor Financeiro — SnapGestão</title>
<style>
  @page { margin: 2cm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    background: #F4F6F9;
    color: #1A2030;
    padding: 0;
  }

  .page {
    max-width: 700px;
    margin: 0 auto;
    background: #fff;
    min-height: 100vh;
  }

  .accent-bar {
    height: 4px;
    background: #1EB87A;
  }

  .content {
    padding: 32px;
  }

  h1 {
    font-size: 22px;
    font-weight: 800;
    color: #0F5EA8;
    margin: 32px 0 12px;
    padding-bottom: 8px;
    border-bottom: 2px solid #E8EEF5;
  }
  h2 {
    font-size: 20px;
    font-weight: 800;
    color: #0F5EA8;
    margin: 28px 0 12px;
    padding-bottom: 6px;
    border-bottom: 2px solid #E8EEF5;
  }
  h3 {
    font-size: 16px;
    font-weight: 700;
    color: #1A2030;
    margin: 20px 0 8px;
  }
  p {
    font-size: 14px;
    line-height: 1.7;
    color: #374151;
    margin-bottom: 12px;
  }
  ul {
    margin: 8px 0 16px 0;
    padding: 0;
    list-style: none;
  }
  li {
    font-size: 14px;
    line-height: 1.6;
    color: #374151;
    padding: 6px 0 6px 24px;
    position: relative;
    border-bottom: 1px solid #F4F6F9;
  }
  li::before {
    content: '•';
    position: absolute;
    left: 8px;
    color: #0F5EA8;
    font-weight: 700;
  }
  strong { font-weight: 700; color: #1A2030; }
  em { font-style: italic; color: #374151; }

  .footer {
    background: #F4F6F9;
    padding: 20px 32px;
    margin-top: 32px;
    border-top: 1px solid #E8EEF5;
    text-align: center;
  }
  .footer-text {
    font-size: 11px;
    color: #7A8499;
    line-height: 1.5;
  }
  .footer-brand {
    font-size: 12px;
    font-weight: 700;
    color: #0F5EA8;
    margin-top: 8px;
  }
</style>
</head>
<body>
<div class="page">
  <div style="background:linear-gradient(135deg,#0F5EA8 0%,#1a7fd4 100%);padding:24px 32px;display:flex;align-items:center;justify-content:space-between;">
    <!-- Logo e título -->
    <div style="display:flex;align-items:center;gap:16px;">
      ${logoImg}
      <div>
        <h1 style="color:#fff;margin:0;font-size:24px;font-weight:800;border:none;padding:0;">Mentor Financeiro</h1>
        <p style="color:rgba(255,255,255,0.85);margin:4px 0 0;font-size:13px;margin-bottom:0;">
          Relatório personalizado para <strong>${safeUser}</strong> · ${escapeHtml(dataGeracao)}
        </p>
      </div>
    </div>
    <!-- Ícone da IA usada -->
    <div style="background:rgba(255,255,255,0.15);border-radius:12px;padding:10px 14px;text-align:center;min-width:80px;">
      <div style="font-size:28px;line-height:1;">${providerInfo.icon}</div>
      <div style="color:#fff;font-size:10px;font-weight:600;margin-top:4px;opacity:0.9;">${providerInfo.name}</div>
    </div>
  </div>
  <div class="accent-bar"></div>
  <div class="content">
    ${conteudoHTML}
  </div>
  <div class="footer">
    <div class="footer-text">
      Este relatório foi gerado automaticamente com base nos seus dados financeiros pelo assistente de IA do SnapGestão.<br>
      As recomendações são orientações gerais e não substituem consultoria financeira profissional.
    </div>
    <div class="footer-brand">SnapGestão · Controle que transforma</div>
  </div>
</div>
</body>
</html>`
}

async function loadLogoBase64(): Promise<string | undefined> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Asset } = require('expo-asset')
    const asset = Asset.fromModule(require('../assets/icon.png'))
    await asset.downloadAsync()
    const localUri: string | null = asset.localUri ?? asset.uri
    if (!localUri) return undefined
    return await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 })
  } catch {
    return undefined
  }
}

export async function gerarPDF(relatorio: string, userName: string, provider: string = 'claude'): Promise<string> {
  const dataGeracao = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })
  const logoBase64 = await loadLogoBase64()
  const html = buildHtml(relatorio, userName, dataGeracao, logoBase64, provider)
  const { uri } = await Print.printToFileAsync({
    html,
    base64: false,
    margins: { left: 20, top: 20, right: 20, bottom: 20 },
  })
  return uri
}

export async function compartilharPDF(uri: string): Promise<void> {
  const canShare = await Sharing.isAvailableAsync()
  if (!canShare) throw new Error('Compartilhamento não disponível neste dispositivo')
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: 'Compartilhar Relatório Financeiro',
    UTI: 'com.adobe.pdf',
  })
}
