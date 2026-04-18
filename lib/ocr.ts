import { supabase } from './supabase'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system'

export type OCRItem = { name: string; value: number }

export type OCRResult = {
  success: boolean
  receipt_id?: string
  merchant?: string
  total?: number
  receipt_date?: string
  items?: OCRItem[]
  image_url?: string
  raw_text?: string
  error?: string
}

export async function imageToBase64(uri: string): Promise<string> {
  return FileSystem.readAsStringAsync(uri, { encoding: 'base64' as any })
}

// Legacy alias used by OCRCamera.tsx
export async function extractReceiptData(base64Image: string): Promise<OCRResult> {
  return { success: false, error: 'Use processReceipt() instead.' }
}

export async function processReceipt(imageUri: string, userId: string): Promise<OCRResult> {
  try {
    const base64 = await imageToBase64(imageUri)

    const { data, error } = await supabase.functions.invoke('process-receipt', {
      body: { imageBase64: base64, userId },
    })

    if (error) throw error
    return { ...(data as OCRResult), success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function captureReceipt(): Promise<string | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync()
  if (status !== 'granted') return null

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.8,
    base64: false,
  })

  if (result.canceled) return null
  return result.assets[0].uri
}

export async function pickReceiptFromGallery(): Promise<string | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (status !== 'granted') return null

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.8,
  })

  if (result.canceled) return null
  return result.assets[0].uri
}
