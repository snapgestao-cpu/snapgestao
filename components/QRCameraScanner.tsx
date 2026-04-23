import React, { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { Colors } from '../constants/colors'

type Props = {
  onQRCodeScanned: (url: string) => void
  onCancel: () => void
}

export default function QRCameraScanner({ onQRCodeScanned, onCancel }: Props) {
  const [permission, requestPermission] = useCameraPermissions()
  const [scanned, setScanned] = useState(false)

  if (!permission?.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>
          Precisamos da câmera para ler o QR Code
        </Text>
        <TouchableOpacity onPress={requestPermission} style={styles.permissionBtn}>
          <Text style={styles.permissionBtnText}>Permitir câmera</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onCancel} style={styles.cancelLink}>
          <Text style={styles.cancelLinkText}>Cancelar</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data, type }) => {
          if (scanned) return
          setScanned(true)
          console.log('[QR] Código detectado | tipo:', type, '| tamanho:', data.length)
          console.log('[QR] É URL SEFAZ:', data.includes('fazenda') || data.includes('nfce') || data.includes('consultadfe'))
          console.log('[QR] Dados:', data)
          onQRCodeScanned(data)
        }}
      />

      {/* Scan frame overlay */}
      <View style={styles.overlay}>
        <View style={styles.frame}>
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
        </View>
        <Text style={styles.hint}>Aponte para o QR Code do cupom fiscal</Text>
      </View>

      <TouchableOpacity onPress={onCancel} style={styles.cancelBtn}>
        <Text style={styles.cancelBtnText}>Cancelar</Text>
      </TouchableOpacity>
    </View>
  )
}

const CORNER = 40
const FRAME = 250
const BORDER = 3

const styles = StyleSheet.create({
  permissionContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 },
  permissionText: { fontSize: 16, textAlign: 'center', color: Colors.textDark, lineHeight: 24 },
  permissionBtn: { backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12 },
  permissionBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  cancelLink: { paddingVertical: 10 },
  cancelLinkText: { color: Colors.textMuted, fontSize: 14 },
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center',
  },
  frame: { width: FRAME, height: FRAME, position: 'relative' },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: Colors.primary },
  cornerTL: { top: 0, left: 0, borderTopWidth: BORDER, borderLeftWidth: BORDER },
  cornerTR: { top: 0, right: 0, borderTopWidth: BORDER, borderRightWidth: BORDER },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: BORDER, borderLeftWidth: BORDER },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: BORDER, borderRightWidth: BORDER },
  hint: {
    color: '#fff', marginTop: 24, fontSize: 14, textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
    paddingHorizontal: 32,
  },
  cancelBtn: {
    position: 'absolute', bottom: 40, alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24,
  },
  cancelBtnText: { color: '#fff', fontSize: 15 },
})
