/**
 * Criador: Diego Manhães
 * Data: 07/05/2026
 * Modificado em: 07/05/2026
 *
 * Geração de PDFs — converte relatórios em Markdown para HTML
 * estilizado e gera arquivo PDF via expo-print. Suporta Mentor
 * Financeiro e Analisador de Preços com header gradiente, logo
 * do app e ícone do provedor de IA utilizado.
 */

import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import * as FileSystem from 'expo-file-system/legacy'
import * as MediaLibrary from 'expo-media-library'
import { getIRDeductibles, groupByCategory, IR_LIMITS, IR_CATEGORY_LABELS } from './ir'
import { brl } from './finance'

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

function buildHtml(relatorio: string, userName: string, dataGeracao: string, titulo: string, logoBase64?: string, provider: string = 'claude'): string {
  const conteudoHTML = markdownToHtml(relatorio)
  const safeUser = escapeHtml(userName)
  const providerInfo = getProviderInfo(provider)

  const logoImg = logoBase64
    ? `<img src="data:image/png;base64,${logoBase64}" style="width:96px;height:96px;border-radius:0;background:none;padding:0;object-fit:contain;" />`
    : `<div style="width:96px;height:96px;font-size:28px;line-height:96px;text-align:center;">🫙</div>`

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(titulo)} — SnapGestão</title>
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
  <div style="position:relative;display:flex;align-items:center;padding:24px 32px;background:linear-gradient(135deg,#0F5EA8 0%,#1a7fd4 100%);min-height:110px;">
    <div style="display:flex;align-items:center;gap:16px;">
      ${logoImg}
      <div>
        <h1 style="color:#fff;margin:0;font-size:24px;font-weight:800;">${escapeHtml(titulo)}</h1>
        <p style="color:rgba(255,255,255,0.75);margin:2px 0 0;font-size:11px;letter-spacing:0.5px;">Controle Financeiro Pessoal</p>
        <p style="color:rgba(255,255,255,0.85);margin:4px 0 0;font-size:13px;">
          Relatório personalizado para <strong style="color:#fff;">${safeUser}</strong> · ${escapeHtml(dataGeracao)}
        </p>
      </div>
    </div>
    <div style="position:absolute;bottom:12px;right:20px;text-align:center;min-width:50px;">
      <div style="font-size:20px;line-height:1;">${providerInfo.icon}</div>
      <div style="color:rgba(255,255,255,0.85);font-size:9px;font-weight:600;margin-top:3px;">${providerInfo.name}</div>
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
    const asset = Asset.fromModule(require('../assets/carteira png.png'))
    await asset.downloadAsync()
    const localUri: string | null = asset.localUri ?? asset.uri
    if (!localUri) return undefined
    return await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 })
  } catch {
    return undefined
  }
}

async function buildAndPrint(relatorio: string, userName: string, titulo: string, provider: string): Promise<string> {
  const dataGeracao = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })
  const logoBase64 = await loadLogoBase64()
  const html = buildHtml(relatorio, userName, dataGeracao, titulo, logoBase64, provider)
  const { uri } = await Print.printToFileAsync({
    html,
    base64: false,
    margins: { left: 20, top: 20, right: 20, bottom: 20 },
  })
  return uri
}

export async function gerarPDF(relatorio: string, userName: string, provider: string = 'claude'): Promise<string> {
  return buildAndPrint(relatorio, userName, 'Mentor Financeiro', provider)
}

export async function gerarAnalisadorPDF(relatorio: string, userName: string, provider: string = 'claude'): Promise<string> {
  return buildAndPrint(relatorio, userName, 'Analisador de Preços', provider)
}

export async function gerarRelatorioIR(userId: string, year: number, userName: string): Promise<string> {
  const items = await getIRDeductibles(userId, year)
  const groups = groupByCategory(items)
  const totalGeral = groups.reduce((s, g) => s + g.total, 0)

  const dataGeracao = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })

  const logoBase64 = await loadLogoBase64()
  const logoImg = logoBase64
    ? `<img src="data:image/png;base64,${logoBase64}" style="width:96px;height:96px;border-radius:0;background:none;padding:0;object-fit:contain;" />`
    : `<div style="width:96px;height:96px;font-size:28px;line-height:96px;text-align:center;">📋</div>`

  const groupsHtml = groups.map(group => {
    const limitInfo = group.limit != null
      ? `<div class="limit-warn">⚠️ Limite anual: ${brl(group.limit)} &nbsp;·&nbsp; ${group.total <= group.limit ? `Ainda pode deduzir: ${brl(group.limit - group.total)}` : `Excedido em: ${brl(group.total - group.limit)}`}</div>`
      : `<div class="limit-ok">✅ Sem limite — 100% dedutível</div>`

    const itemsHtml = group.items.map(item => {
      const dateFormatted = item.date.split('-').reverse().join('/')
      return `<div class="tx-row">
        <div class="tx-provider">${escapeHtml(item.ir_provider_name ?? item.description ?? '—')}</div>
        ${item.ir_provider_document ? `<div class="tx-doc">CPF/CNPJ: ${escapeHtml(item.ir_provider_document)}</div>` : ''}
        <div class="tx-detail">${escapeHtml(item.description ?? '')} · ${brl(item.amount)} · ${dateFormatted}${item.ir_receipt_number ? ` · Recibo: ${escapeHtml(item.ir_receipt_number)}` : ''}</div>
      </div>`
    }).join('')

    return `<div class="cat-block">
      <div class="cat-header">
        <span class="cat-name">${escapeHtml(group.label)}</span>
        <span class="cat-total">${brl(group.total)}</span>
      </div>
      ${limitInfo}
      ${group.limit != null ? `<div class="progress-bar"><div class="progress-fill" style="width:${Math.min(100, (group.total / group.limit) * 100).toFixed(1)}%;background:${group.total > group.limit ? '#E24B4A' : '#1EB87A'};"></div></div>` : ''}
      <div class="tx-list">${itemsHtml}</div>
    </div>`
  }).join('')

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Relatório IR ${year} — SnapGestão</title>
<style>
  @page { margin: 2cm; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; background:#F4F6F9; color:#1A2030; }
  .page { max-width:700px; margin:0 auto; background:#fff; min-height:100vh; }
  .accent-bar { height:4px; background:#1EB87A; }
  .content { padding:32px; }
  .cat-block { margin-bottom:28px; border:1px solid #E8EEF5; border-radius:12px; overflow:hidden; }
  .cat-header { display:flex; justify-content:space-between; align-items:center; background:#0F5EA8; color:#fff; padding:12px 16px; }
  .cat-name { font-size:15px; font-weight:700; }
  .cat-total { font-size:16px; font-weight:800; }
  .limit-ok { font-size:12px; color:#1D9E75; background:#EAF3DE; padding:8px 16px; }
  .limit-warn { font-size:12px; color:#BA7517; background:#FAEEDA; padding:8px 16px; }
  .progress-bar { height:6px; background:#E8EEF5; }
  .progress-fill { height:6px; }
  .tx-list { padding:8px 0; }
  .tx-row { padding:10px 16px; border-bottom:1px solid #F4F6F9; }
  .tx-provider { font-size:13px; font-weight:700; color:#1A2030; }
  .tx-doc { font-size:11px; color:#7A8499; margin-top:2px; }
  .tx-detail { font-size:12px; color:#374151; margin-top:3px; }
  .total-box { background:linear-gradient(135deg,#0F5EA8,#1a7fd4); border-radius:12px; padding:20px 24px; margin-top:8px; color:#fff; display:flex; justify-content:space-between; align-items:center; }
  .total-label { font-size:14px; font-weight:600; opacity:0.85; }
  .total-value { font-size:22px; font-weight:800; }
  .footer { background:#F4F6F9; padding:20px 32px; margin-top:32px; border-top:1px solid #E8EEF5; text-align:center; }
  .footer-text { font-size:11px; color:#7A8499; line-height:1.5; }
  .footer-brand { font-size:12px; font-weight:700; color:#0F5EA8; margin-top:8px; }
  .empty { text-align:center; padding:40px; color:#7A8499; font-size:14px; }
</style>
</head>
<body>
<div class="page">
  <div style="position:relative;display:flex;align-items:center;padding:24px 32px;background:linear-gradient(135deg,#0F5EA8 0%,#1a7fd4 100%);min-height:110px;">
    <div style="display:flex;align-items:center;gap:16px;">
      ${logoImg}
      <div>
        <h1 style="color:#fff;margin:0;font-size:24px;font-weight:800;">Relatório IR ${year}</h1>
        <p style="color:rgba(255,255,255,0.75);margin:2px 0 0;font-size:11px;">Deduções do Imposto de Renda</p>
        <p style="color:rgba(255,255,255,0.85);margin:4px 0 0;font-size:13px;">
          <strong style="color:#fff;">${escapeHtml(userName)}</strong> · ${escapeHtml(dataGeracao)}
        </p>
      </div>
    </div>
  </div>
  <div class="accent-bar"></div>
  <div class="content">
    ${groups.length === 0
      ? `<div class="empty">Nenhum lançamento dedutível registrado em ${year}.</div>`
      : groupsHtml
    }
    ${groups.length > 0 ? `
    <div class="total-box">
      <span class="total-label">TOTAL DE DEDUÇÕES ${year}</span>
      <span class="total-value">${brl(totalGeral)}</span>
    </div>` : ''}
  </div>
  <div class="footer">
    <div class="footer-text">Este relatório é gerado com base nos lançamentos marcados como dedutíveis no IR.<br>Consulte um contador para validar os valores antes de declarar.</div>
    <div class="footer-brand">SnapGestão · Controle que transforma</div>
  </div>
</div>
</body>
</html>`

  const { uri } = await Print.printToFileAsync({
    html,
    base64: false,
    margins: { left: 20, top: 20, right: 20, bottom: 20 },
  })
  return uri
}

export async function salvarPDFnoDownloads(uri: string, fileName: string): Promise<void> {
  const { status } = await MediaLibrary.requestPermissionsAsync()
  if (status !== 'granted') throw new Error('Permissão de armazenamento negada')

  // Android exige que o arquivo esteja em cacheDirectory para createAssetAsync aceitar
  const cachedUri = FileSystem.cacheDirectory + fileName
  await FileSystem.copyAsync({ from: uri, to: cachedUri })

  const asset = await MediaLibrary.createAssetAsync(cachedUri)
  await MediaLibrary.createAlbumAsync('Download', asset, false)
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
