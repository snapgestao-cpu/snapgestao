import { supabase } from './supabase'

export type OCRResult = {
  merchant: string | null
  amount: number | null
  date: string | null
  description: string | null
}

export async function extractReceiptData(base64Image: string): Promise<OCRResult> {
  const { data, error } = await supabase.functions.invoke('ocr-receipt', {
    body: { image: base64Image },
  })

  if (error) throw error

  return data as OCRResult
}
