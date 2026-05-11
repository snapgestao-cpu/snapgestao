/**
 * Criador: Diego Manhães
 * Data: 08/05/2026
 *
 * Módulo IR — lançamentos dedutíveis no Imposto de Renda.
 * Consulta, agrupamento por categoria, upload/download de recibos.
 */

import * as ImageManipulator from 'expo-image-manipulator'
import * as FileSystem from 'expo-file-system/legacy'
import { supabase } from './supabase'
import { IRCategory, Transaction } from '../types'

export const IR_CATEGORY_LABELS: Record<IRCategory, string> = {
  saude:               'Saúde',
  educacao:            'Educação',
  previdencia_pgbl:    'Previdência PGBL',
  previdencia_social:  'Previdência Social',
  doacao:              'Doação',
  pensao:              'Pensão Alimentícia',
  outros:              'Outros',
}

// Limites anuais em R$ (null = sem limite fixo)
export const IR_LIMITS: Record<IRCategory, number | null> = {
  saude:               null,
  educacao:            3561.50,
  previdencia_pgbl:    null,
  previdencia_social:  null,
  doacao:              null,
  pensao:              null,
  outros:              null,
}

export type IRDeductible = Transaction & { potName?: string }

export type IRCategoryGroup = {
  category: IRCategory
  label: string
  total: number
  limit: number | null
  items: IRDeductible[]
}

export async function getIRDeductibles(userId: string, year: number): Promise<IRDeductible[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*, pots(name)')
    .eq('user_id', userId)
    .eq('is_ir_deductible', true)
    .gte('date', `${year}-01-01`)
    .lte('date', `${year}-12-31`)
    .order('date', { ascending: true })

  if (error) throw new Error(error.message)

  return ((data ?? []) as any[]).map(row => ({
    ...row,
    potName: row.pots?.name ?? undefined,
    pots: undefined,
  })) as IRDeductible[]
}

export function groupByCategory(items: IRDeductible[]): IRCategoryGroup[] {
  const map = new Map<IRCategory, IRDeductible[]>()

  for (const item of items) {
    const cat = item.ir_category ?? 'outros'
    if (!map.has(cat)) map.set(cat, [])
    map.get(cat)!.push(item)
  }

  return Array.from(map.entries()).map(([category, list]) => ({
    category,
    label: IR_CATEGORY_LABELS[category],
    total: list.reduce((s, i) => s + Number(i.amount), 0),
    limit: IR_LIMITS[category],
    items: list,
  }))
}

export async function uploadIRReceiptImage(
  userId: string,
  transactionId: string,
  localUri: string
): Promise<string> {
  const compressed = await ImageManipulator.manipulateAsync(
    localUri,
    [{ resize: { width: 1200 } }],
    { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
  )

  // blob.arrayBuffer() não existe no Hermes/React Native — ler como base64 e decodificar
  const base64 = await FileSystem.readAsStringAsync(compressed.uri, {
    encoding: FileSystem.EncodingType.Base64,
  })
  const binaryStr = atob(base64)
  const bytes = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i)
  }

  const path = `${userId}/ir/${transactionId}.jpg`

  const { error } = await supabase.storage
    .from('receipts')
    .upload(path, bytes, {
      contentType: 'image/jpeg',
      upsert: true,
    })

  if (error) throw new Error(error.message)
  return path
}

export async function getIRReceiptImageUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('receipts')
    .createSignedUrl(path, 3600)

  if (error || !data?.signedUrl) throw new Error(error?.message ?? 'URL indisponível')
  return data.signedUrl
}

export async function deleteIRReceiptImage(path: string): Promise<void> {
  await supabase.storage.from('receipts').remove([path])
}
