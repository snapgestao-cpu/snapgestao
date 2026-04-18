import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import Svg, { Path, Rect, Line, Ellipse, Text as SvgText, Defs, ClipPath, G } from 'react-native-svg'
import { Colors } from '../constants/colors'
import { getPotIcon } from '../lib/potIcons'
import { brl } from '../lib/finance'

type Props = {
  name: string
  color: string
  percent: number
  spent: number
  limit: number | null
  size?: number
  onPress?: () => void
}

function darkenColor(hex: string): string {
  if (!hex.startsWith('#') || hex.length < 7) return hex
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgb(${Math.max(0, r - 60)},${Math.max(0, g - 60)},${Math.max(0, b - 60)})`
}

function lightenColor(hex: string): string {
  if (!hex.startsWith('#') || hex.length < 7) return hex
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgb(${Math.min(255, r + 80)},${Math.min(255, g + 80)},${Math.min(255, b + 80)})`
}

function coinColor(color: string, percent: number): string {
  if (percent >= 100) return '#A32D2D'
  if (percent >= 80) return '#E24B4A'
  if (percent >= 50) return '#BA7517'
  return color
}

function Coin({ cx, cy, cColor }: { cx: number; cy: number; cColor: string }) {
  return (
    <G>
      {/* Shadow / depth bottom */}
      <Path
        d={`M ${cx - 18} ${cy} Q ${cx - 18} ${cy + 5} ${cx} ${cy + 5} Q ${cx + 18} ${cy + 5} ${cx + 18} ${cy}`}
        fill={darkenColor(cColor)}
        opacity="0.6"
      />
      {/* Main coin body */}
      <Ellipse cx={cx} cy={cy} rx={18} ry={6}
        fill={cColor} stroke={darkenColor(cColor)} strokeWidth="1" />
      {/* Top shine */}
      <Ellipse cx={cx} cy={cy - 1} rx={17} ry={5}
        fill={lightenColor(cColor)} opacity="0.5" />
      {/* R$ label */}
      <SvgText x={cx} y={cy + 2.5} textAnchor="middle"
        fontSize="7" fontWeight="bold" fill="#ffffff" opacity="0.95">
        R$
      </SvgText>
      {/* Diagonal glint */}
      <Line x1={cx - 9} y1={cy - 2} x2={cx - 5} y2={cy - 3.5}
        stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
    </G>
  )
}

const MAX_COINS = 8
const COIN_SPACING = 13
const BASE_Y = 112
const CX = 50
const CLIP_ID_BASE = 'jarclip'

export function JarPot({ name, color, percent, spent, limit, size = 100, onPress }: Props) {
  const clipId = `${CLIP_ID_BASE}-${name.replace(/\W/g, '')}`
  const cColor = coinColor(color, percent)
  const isOverflow = percent >= 100
  const isEmpty = percent <= 0

  const visibleCoins = isEmpty ? 0
    : Math.max(1, Math.min(MAX_COINS, Math.ceil((Math.min(percent, 100) / 100) * MAX_COINS)))

  // Label position: just above top coin, minimum y=28
  const labelY = isEmpty ? 0 : Math.max(28, BASE_Y - visibleCoins * COIN_SPACING - 10)

  const scale = size / 100

  // Jar outline color: use original color for border always
  const borderColor = percent >= 100 ? '#A32D2D' : percent >= 80 ? '#E24B4A' : percent >= 50 ? '#BA7517' : color

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={onPress ? 0.75 : 1} disabled={!onPress}>
      <View style={[styles.wrapper, { width: size }]}>
        <Svg width={100 * scale} height={130 * scale} viewBox="0 0 100 130">
          <Defs>
            <ClipPath id={clipId}>
              <Path d="M20 13 Q15 13 15 20 L15 115 Q15 122 22 122 L78 122 Q85 122 85 115 L85 20 Q85 13 80 13 Z" />
            </ClipPath>
          </Defs>

          {/* === COINS inside jar (clipped) === */}
          {!isEmpty && (
            <G clipPath={`url(#${clipId})`}>
              {Array.from({ length: visibleCoins }, (_, i) => (
                <Coin key={i} cx={CX} cy={BASE_Y - i * COIN_SPACING} cColor={cColor} />
              ))}
            </G>
          )}

          {/* === Jar body outline (drawn on top so it covers coin edges) === */}
          <Path
            d="M20 13 Q15 13 15 20 L15 115 Q15 122 22 122 L78 122 Q85 122 85 115 L85 20 Q85 13 80 13 Z"
            fill="rgba(200,200,200,0.06)"
            stroke={borderColor}
            strokeWidth="2.5"
          />

          {/* Lid top */}
          <Rect x="30" y="0" width="40" height="8" rx="3"
            fill="none" stroke={borderColor} strokeWidth="2" />
          {/* Lid base */}
          <Rect x="25" y="7" width="50" height="6" rx="2"
            fill="none" stroke={borderColor} strokeWidth="2" />

          {/* Glass reflection lines */}
          <Line x1="75" y1="25" x2="75" y2="55"
            stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" />
          <Line x1="75" y1="62" x2="75" y2="72"
            stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" />

          {/* === Overflow coins spilling over lid === */}
          {isOverflow && (
            <>
              <G transform="rotate(-20, 38, 12)">
                <Ellipse cx={38} cy={12} rx={14} ry={5}
                  fill="#A32D2D" stroke="#7A1F1F" strokeWidth="1" />
                <Ellipse cx={38} cy={11} rx={13} ry={4}
                  fill="#C0392B" opacity="0.6" />
                <SvgText x={38} y={14} textAnchor="middle"
                  fontSize="6" fontWeight="bold" fill="#fff">R$</SvgText>
              </G>
              <G transform="rotate(15, 62, 6)">
                <Ellipse cx={62} cy={6} rx={14} ry={5}
                  fill="#A32D2D" stroke="#7A1F1F" strokeWidth="1" />
                <Ellipse cx={62} cy={5} rx={13} ry={4}
                  fill="#C0392B" opacity="0.6" />
                <SvgText x={62} y={8} textAnchor="middle"
                  fontSize="6" fontWeight="bold" fill="#fff">R$</SvgText>
              </G>
            </>
          )}

          {/* === Percent label above coins === */}
          {!isEmpty && (
            <SvgText
              x={CX} y={labelY}
              textAnchor="middle"
              fontSize="13"
              fontWeight="bold"
              fill={cColor}
            >
              {`${Math.round(percent)}%`}
            </SvgText>
          )}

          {/* === Empty state === */}
          {isEmpty && (
            <>
              <SvgText x="50" y="75" textAnchor="middle" fontSize="28" opacity="0.3">
                {getPotIcon(name)}
              </SvgText>
              <SvgText x="50" y="95" textAnchor="middle"
                fontSize="9" fill={color} opacity="0.4">
                vazio
              </SvgText>
            </>
          )}
        </Svg>
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center' },
})
