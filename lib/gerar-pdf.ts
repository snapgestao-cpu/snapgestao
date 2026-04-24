import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'

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

function buildHtml(relatorio: string, userName: string, dataGeracao: string): string {
  const conteudoHTML = markdownToHtml(relatorio)
  const safeUser = escapeHtml(userName)

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Relatório Mentor Financeiro — SnapGestão</title>
<style>
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

  .header {
    background: #0F5EA8;
    padding: 40px 40px 32px;
    color: #fff;
  }
  .header-brand {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 24px;
  }
  .brand-icon {
    width: 44px;
    height: 44px;
    background: rgba(255,255,255,0.2);
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
  }
  .brand-name {
    font-size: 20px;
    font-weight: 800;
    letter-spacing: -0.3px;
  }
  .brand-sub {
    font-size: 12px;
    opacity: 0.7;
    margin-top: 2px;
  }
  .report-title {
    font-size: 28px;
    font-weight: 800;
    margin-bottom: 8px;
    letter-spacing: -0.5px;
  }
  .report-meta {
    font-size: 13px;
    opacity: 0.75;
  }
  .report-meta span {
    font-weight: 600;
    opacity: 1;
  }

  .accent-bar {
    height: 4px;
    background: #1EB87A;
  }

  .content {
    padding: 40px;
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
    padding: 24px 40px;
    margin-top: 40px;
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
  <div class="header">
    <div class="header-brand">
      <div class="brand-icon">🫙</div>
      <div>
        <div class="brand-name">SnapGestão</div>
        <div class="brand-sub">Controle Financeiro Pessoal</div>
      </div>
    </div>
    <div class="report-title">Mentor Financeiro</div>
    <div class="report-meta">
      Relatório personalizado para <span>${safeUser}</span> · ${escapeHtml(dataGeracao)}
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

export async function gerarPDF(relatorio: string, userName: string): Promise<string> {
  const dataGeracao = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })
  const html = buildHtml(relatorio, userName, dataGeracao)
  const { uri } = await Print.printToFileAsync({ html, base64: false })
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
