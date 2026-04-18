import React, { useRef, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { Colors } from '../constants/colors'
import { extractReceiptData, OCRResult } from '../lib/ocr'

type Props = {
  onResult: (result: OCRResult) => void
  onCancel: () => void
}

export function OCRCamera({ onResult, onCancel }: Props) {
  const [permission, requestPermission] = useCameraPermissions()
  const [loading, setLoading] = useState(false)
  const cameraRef = useRef<CameraView>(null)

  if (!permission) return null

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permissionText}>Permissão de câmera necessária.</Text>
        <TouchableOpacity style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Permitir câmera</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const capture = async () => {
    if (!cameraRef.current || loading) return
    setLoading(true)
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.7 })
      if (photo?.base64) {
        const result = await extractReceiptData(photo.base64)
        onResult(result)
      }
    } catch (e) {
      console.error('OCR error:', e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back">
        <View style={styles.overlay}>
          <TouchableOpacity style={styles.closeBtn} onPress={onCancel}>
            <Text style={styles.closeTxt}>✕</Text>
          </TouchableOpacity>
          <View style={styles.frame} />
          <TouchableOpacity style={styles.captureBtn} onPress={capture} disabled={loading}>
            {loading ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.captureTxt}>📷 Capturar</Text>
            )}
          </TouchableOpacity>
        </View>
      </CameraView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  camera: { flex: 1 },
  overlay: { flex: 1, justifyContent: 'space-between', padding: 20 },
  closeBtn: { alignSelf: 'flex-end', padding: 8 },
  closeTxt: { color: Colors.white, fontSize: 20 },
  frame: {
    alignSelf: 'center',
    width: '85%',
    height: 220,
    borderWidth: 2,
    borderColor: Colors.white,
    borderRadius: 12,
  },
  captureBtn: {
    alignSelf: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 30,
  },
  captureTxt: { color: Colors.white, fontSize: 16, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  permissionText: { fontSize: 16, color: Colors.textDark, marginBottom: 16, textAlign: 'center' },
  btn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  btnText: { color: Colors.white, fontWeight: '600' },
})
