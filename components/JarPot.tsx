import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import Svg, { Path, Rect, Line, Text as SvgText, Defs, ClipPath, G } from 'react-native-svg'
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

function liquidColor(color: string, percent: number): string {
  if (percent >= 100) return '#A32D2D'
  if (percent >= 80) return '#E24B4A'
  if (percent >= 50) return '#BA7517'
  return color
}

export function JarPot({ name, color, percent, spent, limit, size = 100, onPress }: Props) {
  const clamped = Math.min(percent, 100)
  const lColor = liquidColor(color, percent)
  const fillHeight = (109 * clamped) / 100
  const liquidY = 113 - fillHeight
  const clipId = `clip-${name.replace(/\s/g, '')}-${Math.round(percent)}`

  const scale = size / 100

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={onPress ? 0.75 : 1} disabled={!onPress}>
      <View style={[styles.wrapper, { width: size, alignItems: 'center' }]}>
        <Svg width={100 * scale} height={130 * scale} viewBox="0 0 100 130">
          <Defs>
            <ClipPath id={clipId}>
              <Path d="M20 13 Q15 13 15 20 L15 115 Q15 122 22 122 L78 122 Q85 122 85 115 L85 20 Q85 13 80 13 Z" />
            </ClipPath>
          </Defs>

          {/* Liquid background fill */}
          {clamped > 0 && (
            <>
              <Rect
                x="15" y={liquidY} width="70" height={fillHeight + 10}
                fill={lColor + '4D'}
                clipPath={`url(#${clipId})`}
              />
              {/* Wave line at liquid top */}
              <Path
                d={`M15 ${liquidY} Q32 ${liquidY - 4} 50 ${liquidY} Q68 ${liquidY + 4} 85 ${liquidY}`}
                fill="none" stroke={lColor} strokeWidth="1.5"
                clipPath={`url(#${clipId})`}
              />
              {/* Solid liquid below wave */}
              <Rect
                x="15" y={liquidY + 2} width="70" height={fillHeight + 8}
                fill={lColor + '80'}
                clipPath={`url(#${clipId})`}
              />
            </>
          )}

          {/* Jar body outline */}
          <Path
            d="M20 13 Q15 13 15 20 L15 115 Q15 122 22 122 L78 122 Q85 122 85 115 L85 20 Q85 13 80 13 Z"
            fill="rgba(200,200,200,0.08)"
            stroke={lColor}
            strokeWidth="2.5"
          />

          {/* Lid top */}
          <Rect x="30" y="0" width="40" height="8" rx="3"
            fill="none" stroke={lColor} strokeWidth="2" />
          {/* Lid base */}
          <Rect x="25" y="7" width="50" height="6" rx="2"
            fill="none" stroke={lColor} strokeWidth="2" />

          {/* Glass reflection */}
          <Line x1="75" y1="25" x2="75" y2="55"
            stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" />
          <Line x1="75" y1="62" x2="75" y2="72"
            stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" />

          {/* Center content */}
          {clamped > 0 ? (
            <SvgText
              x="50" y="74"
              textAnchor="middle"
              fontSize={clamped > 0 ? '18' : '12'}
              fill={clamped > 60 ? '#fff' : lColor}
              fontWeight="bold"
            >
              {`${Math.round(percent)}%`}
            </SvgText>
          ) : (
            <SvgText x="50" y="78" textAnchor="middle" fontSize="26">
              {getPotIcon(name)}
            </SvgText>
          )}
        </Svg>

        <Text style={[styles.name, { color: Colors.textDark }]} numberOfLines={1}>{name}</Text>
        <Text style={styles.amounts} numberOfLines={1}>
          {limit ? `${brl(spent)} / ${brl(limit)}` : brl(spent)}
        </Text>
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center' },
  name: { fontSize: 13, fontWeight: '700', textAlign: 'center', marginTop: 6, maxWidth: 110 },
  amounts: { fontSize: 11, color: Colors.textMuted, textAlign: 'center', marginTop: 2, maxWidth: 110 },
})
