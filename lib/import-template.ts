/**
 * Criador: Diego Manhães
 * Data: 26/05/2026
 *
 * Geração e compartilhamento do arquivo Excel modelo para importação.
 * Usa SheetJS (xlsx) para gerar em memória e expo-sharing para
 * abrir o seletor nativo (salvar, enviar por WhatsApp, email etc.).
 */

import * as XLSX from 'xlsx'
import * as FileSystem from 'expo-file-system/legacy'
import { saveToDownloads } from './save-file'

const TEMPLATE_FILENAME = 'modelo-importacao.xlsx'

export async function downloadImportTemplate(): Promise<void> {
  const wb = XLSX.utils.book_new()

  // ── Aba "Lançamentos" ──────────────────────────────────────────────────────

  const lancamentosData = [
    ['tipo', 'descricao', 'data', 'valor', 'pagamento', 'estabelecimento', 'parcelas', 'pote'],
    ['gasto',   'Almoço',     '15/05/2026',  '45,90',     'Pix',          'Restaurante Silva', '1',  'Alimentação'],
    ['gasto',   'Tênis Nike', '10/05/2026',  '299,90',    'Crédito',      'Nike Store',        '3',  'Lazer'],
    ['receita', 'Salário',    '05/05/2026',  '5.000,00',  'Transferência', '',                 '1',  ''],
  ]

  const wsLancamentos = XLSX.utils.aoa_to_sheet(lancamentosData)

  // Larguras de coluna
  wsLancamentos['!cols'] = [
    { wch: 10 }, // tipo
    { wch: 22 }, // descricao
    { wch: 14 }, // data
    { wch: 12 }, // valor
    { wch: 16 }, // pagamento
    { wch: 22 }, // estabelecimento
    { wch: 10 }, // parcelas
    { wch: 18 }, // pote
  ]

  // Negrito nos cabeçalhos (A1:H1)
  const headerCols = ['A','B','C','D','E','F','G','H']
  for (const col of headerCols) {
    const cellRef = `${col}1`
    if (wsLancamentos[cellRef]) {
      wsLancamentos[cellRef].s = { font: { bold: true } }
    }
  }

  XLSX.utils.book_append_sheet(wb, wsLancamentos, 'Lançamentos')

  // ── Aba "Instruções" ───────────────────────────────────────────────────────

  const instrucoes = [
    ['INSTRUÇÕES DE PREENCHIMENTO'],
    [''],
    ['tipo',             '→ "gasto" ou "receita" (obrigatório)'],
    ['descricao',        '→ Descrição do lançamento (obrigatório)'],
    ['data',             '→ Formato DD/MM/AAAA (obrigatório)'],
    ['valor',            '→ Valor em reais com vírgula decimal (ex: 45,90 ou 1.250,00) (obrigatório)'],
    ['pagamento',        '→ Valores aceitos: Dinheiro, Débito, Crédito, Pix, Transferência, Vale Alimentação, Vale Refeição'],
    ['estabelecimento',  '→ Nome do estabelecimento (opcional)'],
    ['parcelas',         '→ Número de parcelas. Use 1 para à vista (padrão: 1)'],
    ['pote',             '→ Nome exato do pote cadastrado no app (opcional)'],
    [''],
    ['ATENÇÃO:'],
    ['- Não alterar os nomes das colunas'],
    ['- Datas devem estar no formato DD/MM/AAAA'],
    ['- Valores devem usar vírgula como separador decimal (ex: 45,90)'],
    ['- Use ponto para separar milhares (ex: 1.250,00)'],
    ['- O nome do pote deve ser idêntico ao cadastrado no app'],
    ['- Parcelas > 1 só funcionam com pagamento = "Crédito"'],
  ]

  const wsInstrucoes = XLSX.utils.aoa_to_sheet(instrucoes)
  wsInstrucoes['!cols'] = [{ wch: 20 }, { wch: 80 }]

  // Negrito no título e em "ATENÇÃO:"
  if (wsInstrucoes['A1']) wsInstrucoes['A1'].s = { font: { bold: true } }
  if (wsInstrucoes['A12']) wsInstrucoes['A12'].s = { font: { bold: true } }

  XLSX.utils.book_append_sheet(wb, wsInstrucoes, 'Instruções')

  // ── Gerar base64 e salvar no cache ─────────────────────────────────────────

  const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' })
  const filePath = (FileSystem.cacheDirectory ?? '') + TEMPLATE_FILENAME
  await FileSystem.writeAsStringAsync(filePath, base64, {
    encoding: FileSystem.EncodingType.Base64,
  })

  // ── Salvar no dispositivo via SAF (Android) ou share sheet (iOS) ──────────

  await saveToDownloads(
    filePath,
    TEMPLATE_FILENAME,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
}
