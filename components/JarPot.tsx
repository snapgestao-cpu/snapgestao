import React from 'react'
import { View, Image, Text, TouchableOpacity, StyleSheet } from 'react-native'

const POT_IMAGES = {
  empty: require('../assets/potes/Pote_vazio.png'),
  p10:   require('../assets/potes/Pote_10.png'),
  p30:   require('../assets/potes/Pote_30.png'),
  p50:   require('../assets/potes/Pote_50.png'),
  p70:   require('../assets/potes/Pote_70.png'),
  p90:   require('../assets/potes/Pote_90.png'),
  p100:  require('../assets/potes/Pote_100.png'),
}

function getPotImage(percent: number) {
  if (percent <= 0)  return POT_IMAGES.empty
  if (percent < 20)  return POT_IMAGES.p10
  if (percent < 40)  return POT_IMAGES.p30
  if (percent < 60)  return POT_IMAGES.p50
  if (percent < 80)  return POT_IMAGES.p70
  if (percent < 100) return POT_IMAGES.p90
  return POT_IMAGES.p100
}

const POT_ICONS: Record<string, string> = {
  'alimentação': '🍽️', 'alimentacao': '🍽️',
  'mercado': '🛒', 'supermercado': '🛒',
  'moradia': '🏠', 'aluguel': '🏠', 'casa': '🏡',
  'transporte': '🚗', 'combustível': '⛽', 'combustivel': '⛽', 'uber': '🚕',
  'saúde': '❤️', 'saude': '❤️',
  'farmácia': '💊', 'farmacia': '💊', 'academia': '💪', 'médico': '🏥', 'medico': '🏥',
  'educação': '📚', 'educacao': '📚', 'escola': '🎓', 'curso': '📖',
  'lazer': '🎉', 'entretenimento': '🎬', 'cinema': '🎬', 'streaming': '📺',
  'viagem': '✈️', 'viagens': '✈️',
  'vestuário': '👕', 'vestuario': '👕', 'roupas': '👔',
  'pet': '🐾', 'pets': '🐾',
  'investimento': '📈', 'investimentos': '📈',
  'reserva': '🛡️', 'emergência': '🛡️', 'emergencia': '🛡️',
  'beleza': '💄', 'tecnologia': '💻', 'celular': '📱',
  'família': '👨‍👩‍👧', 'familia': '👨‍👩‍👧',
  'presentes': '🎁', 'outros': '📦',
}

function getPotIcon(name: string): string {
  const lower = name.toLowerCase().trim()
  if (POT_ICONS[lower]) return POT_ICONS[lower]
  const match = Object.keys(POT_ICONS).find(k => lower.includes(k) || k.includes(lower))
  return match ? POT_ICONS[match] : '💰'
}

type Props = {
  name: string
  color: string
  percent: number
  spent: number
  limit: number | null
  size?: number
  onPress?: () => void
}

export function JarPot({ name, percent, size = 100, onPress }: Props) {
  const potImage = getPotImage(percent)
  const icon = getPotIcon(name)
  const imgW = size
  const imgH = size * 1.2

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={onPress ? 0.8 : 1} disabled={!onPress}>
      <View style={{ width: imgW, height: imgH, alignItems: 'center', justifyContent: 'center' }}>
        <Image source={potImage} style={{ width: imgW, height: imgH, resizeMode: 'contain' }} />

        {/* Ícone de categoria quando vazio */}
        {percent <= 0 && (
          <View style={[styles.iconOverlay, { top: imgH * 0.28 }]}>
            <Text style={{ fontSize: imgW * 0.26, opacity: 0.35 }}>{icon}</Text>
          </View>
        )}

        {/* Percentual — sempre branco com sombra escura */}
        {percent > 0 && (
          <View style={[styles.percentOverlay, { bottom: imgH * 0.18 }]}>
            <Text style={[styles.percentText, { fontSize: imgW * 0.16 }]}>
              {Math.round(percent)}%
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  )
}

export default JarPot

const styles = StyleSheet.create({
  iconOverlay: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  percentOverlay: { position: 'absolute', alignItems: 'center' },
  percentText: {
    fontWeight: '800',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
})
