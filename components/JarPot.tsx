import React from 'react'
import Svg, {
  Defs, ClipPath, Path, Rect, Line,
  Text as SvgText, G
} from 'react-native-svg'
import { TouchableOpacity } from 'react-native'

const POT_ICONS: Record<string, string> = {
  'alimentação': '🍽️', 'alimentacao': '🍽️',
  'mercado': '🛒', 'supermercado': '🛒',
  'moradia': '🏠', 'aluguel': '🏠', 'casa': '🏡',
  'transporte': '🚗', 'combustível': '⛽',
  'combustivel': '⛽', 'uber': '🚕',
  'saúde': '❤️', 'saude': '❤️',
  'farmácia': '💊', 'farmacia': '💊',
  'academia': '💪', 'médico': '🏥', 'medico': '🏥',
  'educação': '📚', 'educacao': '📚',
  'escola': '🎓', 'curso': '📖',
  'lazer': '🎉', 'entretenimento': '🎬',
  'cinema': '🎬', 'streaming': '📺',
  'viagem': '✈️', 'viagens': '✈️',
  'vestuário': '👕', 'vestuario': '👕',
  'roupas': '👔',
  'pet': '🐾', 'pets': '🐾',
  'investimento': '📈', 'investimentos': '📈',
  'reserva': '🛡️', 'emergência': '🛡️',
  'emergencia': '🛡️',
  'beleza': '💄', 'salão': '💇', 'salao': '💇',
  'tecnologia': '💻', 'celular': '📱',
  'família': '👨‍👩‍👧', 'familia': '👨‍👩‍👧',
  'presentes': '🎁', 'presente': '🎁',
  'outros': '📦', 'geral': '📦',
}

function getPotIcon(name: string): string {
  const lower = name.toLowerCase().trim()
  if (POT_ICONS[lower]) return POT_ICONS[lower]
  const match = Object.keys(POT_ICONS).find(key =>
    lower.includes(key) || key.includes(lower)
  )
  return match ? POT_ICONS[match] : '💰'
}

type JarPotProps = {
  name: string
  color: string
  percent: number
  spent: number
  limit: number | null
  onPress?: () => void
  size?: number
}

export default function JarPot({
  name, color, percent, spent, limit,
  onPress, size = 120
}: JarPotProps) {

  const liquidColor = percent >= 100 ? '#A32D2D'
    : percent >= 80 ? '#E24B4A'
    : percent >= 50 ? '#BA7517'
    : color

  const jarTop = 35
  const jarBottom = 122
  const jarHeight = jarBottom - jarTop

  const fillPercent = Math.min(percent, 100)
  const fillHeight = (fillPercent / 100) * jarHeight
  const liquidY = jarBottom - fillHeight

  const clipId = `jar-${name.replace(/[^a-z0-9]/gi, '')}`

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{ alignItems: 'center' }}
    >
      <Svg
        width={size}
        height={size * 1.3}
        viewBox="0 0 100 135"
      >
        <Defs>
          <ClipPath id={clipId}>
            <Path d="M18 35 Q14 35 14 42 L14 118 Q14 125 21 125 L79 125 Q86 125 86 118 L86 42 Q86 35 82 35 Z" />
          </ClipPath>
        </Defs>

        {/* TAMPA */}
        <Rect x="28" y="4" width="44" height="9"
          rx="4" fill="#D8D8D8" stroke="#BBBBBB" strokeWidth="1" />
        <Line x1="36" y1="5" x2="36" y2="12" stroke="#C0C0C0" strokeWidth="0.8" />
        <Line x1="44" y1="5" x2="44" y2="12" stroke="#C0C0C0" strokeWidth="0.8" />
        <Line x1="52" y1="5" x2="52" y2="12" stroke="#C0C0C0" strokeWidth="0.8" />
        <Line x1="60" y1="5" x2="60" y2="12" stroke="#C0C0C0" strokeWidth="0.8" />
        <Line x1="68" y1="5" x2="68" y2="12" stroke="#C0C0C0" strokeWidth="0.8" />
        <Rect x="22" y="13" width="56" height="8"
          rx="2" fill="#E0E0E0" stroke="#BBBBBB" strokeWidth="1" />
        <Rect x="26" y="21" width="48" height="14"
          rx="2" fill="rgba(200,225,255,0.15)" stroke={color} strokeWidth="1.5" />

        {/* FUNDO DO FRASCO */}
        <Path
          d="M18 35 Q14 35 14 42 L14 118 Q14 125 21 125 L79 125 Q86 125 86 118 L86 42 Q86 35 82 35 Z"
          fill="rgba(200,225,255,0.1)"
          stroke={color}
          strokeWidth="2"
        />

        {/* LÍQUIDO COM TOPO RETO */}
        {percent > 0 && (
          <G clipPath={`url(#${clipId})`}>
            <Rect
              x="14"
              y={liquidY}
              width="72"
              height={fillHeight + 2}
              fill={liquidColor + 'CC'}
            />
            <Line
              x1="14" y1={liquidY}
              x2="86" y2={liquidY}
              stroke={liquidColor}
              strokeWidth="2"
            />
            <Rect
              x="18"
              y={liquidY + 2}
              width="12"
              height={Math.max(0, fillHeight - 4)}
              fill="#ffffff"
              opacity={0.12}
            />
          </G>
        )}

        {/* REFLEXO DO VIDRO */}
        <Line x1="22" y1="40" x2="20" y2="80"
          stroke="#ffffff" strokeWidth="3"
          strokeLinecap="round" opacity={0.2} />
        <Line x1="22" y1="88" x2="20" y2="108"
          stroke="#ffffff" strokeWidth="2"
          strokeLinecap="round" opacity={0.15} />

        {/* BORDA DO FRASCO (por cima do líquido) */}
        <Path
          d="M18 35 Q14 35 14 42 L14 118 Q14 125 21 125 L79 125 Q86 125 86 118 L86 42 Q86 35 82 35 Z"
          fill="none"
          stroke={color}
          strokeWidth="2"
        />

        {/* ÍCONE QUANDO VAZIO */}
        {percent === 0 && (
          <G>
            <SvgText x="50" y="88" textAnchor="middle" fontSize="28" opacity={0.25}>
              {getPotIcon(name)}
            </SvgText>
            <SvgText x="50" y="108" textAnchor="middle" fontSize="9" fill={color} opacity={0.4}>
              vazio
            </SvgText>
          </G>
        )}

        {/* PERCENTUAL */}
        {percent > 0 && (
          <SvgText
            x="50"
            y={percent > 80 ? liquidY + 18 : liquidY - 8}
            textAnchor="middle"
            fontSize="13"
            fontWeight="bold"
            fill={percent > 80 ? '#fff' : liquidColor}
            opacity={0.95}
          >
            {Math.round(percent)}%
          </SvgText>
        )}

      </Svg>
    </TouchableOpacity>
  )
}
