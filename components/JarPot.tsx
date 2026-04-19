import React from 'react'
import { View, Image, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Colors } from '../constants/colors'
import { brl } from '../lib/finance'

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
  if (percent <= 0)   return POT_IMAGES.empty
  if (percent < 20)   return POT_IMAGES.p10
  if (percent < 40)   return POT_IMAGES.p30
  if (percent < 60)   return POT_IMAGES.p50
  if (percent < 80)   return POT_IMAGES.p70
  if (percent < 100)  return POT_IMAGES.p90
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

export function JarPot({ name, color, percent, spent, limit, size = 100, onPress }: Props) {
  const potImage = getPotImage(percent)
  const icon = getPotIcon(name)
  const imgW = size
  const imgH = size * 1.2

  const percentColor =
    percent >= 100 ? '#A32D2D' :
    percent >= 80  ? '#E24B4A' :
    percent >= 50  ? '#BA7517' :
    color

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={onPress ? 0.8 : 1} disabled={!onPress}>
      <View style={[styles.wrapper, { width: imgW + 8 }]}>
        <View style={{ width: imgW, height: imgH, alignItems: 'center', justifyContent: 'center' }}>
          <Image source={potImage} style={{ width: imgW, height: imgH, resizeMode: 'contain' }} />

          {/* Ícone quando vazio */}
          {percent <= 0 && (
            <View style={[styles.iconOverlay, { top: imgH * 0.28 }]}>
              <Text style={{ fontSize: imgW * 0.26, opacity: 0.35 }}>{icon}</Text>
            </View>
          )}

          {/* Percentual sobre a imagem */}
          {percent > 0 && (
            <View style={[styles.percentOverlay, { bottom: imgH * 0.17 }]}>
              <Text style={[
                styles.percentText,
                {
                  fontSize: imgW * 0.155,
                  color: percent >= 50 ? '#fff' : percentColor,
                },
              ]}>
                {Math.round(percent)}%
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        <Text style={styles.amounts} numberOfLines={1}>
          {limit ? `${brl(spent)} / ${brl(limit)}` : brl(spent)}
        </Text>
      </View>
    </TouchableOpacity>
  )
}

export default JarPot

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center' },
  iconOverlay: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  percentOverlay: { position: 'absolute', alignItems: 'center' },
  percentText: {
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  name: { fontSize: 13, fontWeight: '700', color: Colors.textDark, textAlign: 'center', marginTop: 6, maxWidth: 120 },
  amounts: { fontSize: 11, color: Colors.textMuted, textAlign: 'center', marginTop: 2, maxWidth: 120 },
})
