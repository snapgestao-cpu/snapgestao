import React from 'react'
import { View, TouchableOpacity } from 'react-native'
import Svg, {
  G, Ellipse, Path, Rect, Text as SvgText,
  Defs, ClipPath, Line,
} from 'react-native-svg'
import { getPotIcon } from '../lib/potIcons'

type Props = {
  name: string
  color: string
  percent: number
  spent: number
  limit: number | null
  size?: number
  onPress?: () => void
}

const COIN_POSITIONS = [
  // Layer 1 — bottom
  { cx: 35, cy: 128, rx: 16, ry: 5 },
  { cx: 60, cy: 126, rx: 16, ry: 5 },
  { cx: 84, cy: 128, rx: 15, ry: 5 },
  // Layer 2
  { cx: 28, cy: 115, rx: 15, ry: 5 },
  { cx: 52, cy: 113, rx: 16, ry: 5 },
  { cx: 76, cy: 116, rx: 15, ry: 5 },
  { cx: 92, cy: 114, rx: 14, ry: 5 },
  // Layer 3
  { cx: 38, cy: 102, rx: 16, ry: 5 },
  { cx: 63, cy: 100, rx: 15, ry: 5 },
  { cx: 86, cy: 103, rx: 14, ry: 5 },
  // Layer 4
  { cx: 30, cy: 89, rx: 15, ry: 5 },
  { cx: 55, cy: 87, rx: 16, ry: 5 },
  { cx: 79, cy: 90, rx: 15, ry: 5 },
  // Layer 5
  { cx: 42, cy: 76, rx: 16, ry: 5 },
  { cx: 67, cy: 74, rx: 15, ry: 5 },
  { cx: 88, cy: 77, rx: 14, ry: 5 },
  // Layer 6 — top
  { cx: 33, cy: 63, rx: 15, ry: 5 },
  { cx: 58, cy: 61, rx: 16, ry: 5 },
  { cx: 82, cy: 64, rx: 14, ry: 5 },
]

const TOTAL_COINS = COIN_POSITIONS.length

export function JarPot({ name, color, percent, size = 120, onPress }: Props) {
  const id = name.replace(/\W/g, '').slice(0, 12) || 'pot'
  const visibleCoins = percent <= 0 ? 0
    : Math.max(1, Math.min(TOTAL_COINS, Math.ceil((Math.min(percent, 100) / 100) * TOTAL_COINS)))

  // Y position of topmost coin
  const topCoinY = visibleCoins > 0 ? COIN_POSITIONS[visibleCoins - 1].cy : 134
  const percentY = Math.max(50, topCoinY - 8)

  const scale = size / 120

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={onPress ? 0.75 : 1} disabled={!onPress}>
      <View style={{ width: size, alignItems: 'center' }}>
        <Svg width={120 * scale} height={150 * scale} viewBox="0 0 120 150">
          <Defs>
            <ClipPath id={`jar-${id}`}>
              <Path d="M28 35 Q22 35 20 42 L18 125 Q18 134 30 134 L90 134 Q102 134 102 125 L100 42 Q98 35 92 35 Z" />
            </ClipPath>
          </Defs>

          {/* ── LID ── */}
          <Rect x="25" y="22" width="70" height="8" rx="3"
            fill="#E8E8E8" stroke="#CCCCCC" strokeWidth="1" />
          <Rect x="28" y="15" width="64" height="10" rx="4"
            fill="#F0F0F0" stroke="#CCCCCC" strokeWidth="1" />
          {[35, 45, 55, 65, 75, 85].map(x => (
            <Line key={x} x1={x} y1="16" x2={x} y2="29"
              stroke="#DDDDDD" strokeWidth="0.8" />
          ))}

          {/* ── JAR BODY — glass fill ── */}
          <Path
            d="M28 35 Q22 35 20 42 L18 125 Q18 134 30 134 L90 134 Q102 134 102 125 L100 42 Q98 35 92 35 Z"
            fill="rgba(200,230,255,0.15)"
            stroke={color} strokeWidth="2.5"
          />

          {/* ── COINS (clipped inside jar) ── */}
          <G clipPath={`url(#jar-${id})`}>
            {COIN_POSITIONS.slice(0, visibleCoins).map((pos, i) => (
              <G key={i}>
                {/* Coin shadow */}
                <Ellipse cx={pos.cx} cy={pos.cy + 3} rx={pos.rx} ry={pos.ry - 1}
                  fill="rgba(0,0,0,0.2)" />
                {/* Coin body */}
                <Ellipse cx={pos.cx} cy={pos.cy} rx={pos.rx} ry={pos.ry}
                  fill="#F0A500" stroke="#C47F00" strokeWidth="0.8" />
                {/* Top shine */}
                <Ellipse cx={pos.cx} cy={pos.cy - 1} rx={pos.rx - 2} ry={pos.ry - 1}
                  fill="#FFD04D" opacity="0.6" />
                {/* R$ label */}
                <SvgText x={pos.cx} y={pos.cy + 2} textAnchor="middle"
                  fontSize="5.5" fontWeight="bold" fill="#7A4F00" opacity="0.9">
                  R$
                </SvgText>
                {/* Glint */}
                <Line
                  x1={pos.cx - pos.rx + 4} y1={pos.cy - 1}
                  x2={pos.cx - pos.rx + 8} y2={pos.cy - 2}
                  stroke="#FFF5CC" strokeWidth="1.2"
                  strokeLinecap="round" opacity="0.8"
                />
              </G>
            ))}
          </G>

          {/* ── BILLS spilling out (percent >= 70) ── */}
          {percent >= 70 && (
            <G>
              {/* Bill 1 — tilted left */}
              <Path d="M32 38 L55 33 L58 45 L35 50 Z"
                fill="#85C17E" stroke="#5A9A52" strokeWidth="0.8" opacity="0.9" />
              <Ellipse cx={45} cy={41} rx={5} ry={3.5}
                fill="none" stroke="#5A9A52" strokeWidth="0.8" />
              <Line x1="35" y1="36" x2="53" y2="36"
                stroke="#5A9A52" strokeWidth="0.5" opacity="0.5" />
              <Line x1="37" y1="47" x2="55" y2="43"
                stroke="#5A9A52" strokeWidth="0.5" opacity="0.5" />

              {/* Bill 2 — tilted right */}
              <Path d="M62 31 L85 35 L83 47 L60 43 Z"
                fill="#85C17E" stroke="#5A9A52" strokeWidth="0.8" opacity="0.85" />
              <Ellipse cx={73} cy={39} rx={5} ry={3.5}
                fill="none" stroke="#5A9A52" strokeWidth="0.8" />
              <Line x1="63" y1="44" x2="82" y2="46"
                stroke="#5A9A52" strokeWidth="0.5" opacity="0.5" />

              {/* Bill 3 — center, only when >= 90 */}
              {percent >= 90 && (
                <Path d="M50 26 L70 28 L69 40 L49 38 Z"
                  fill="#6DB566" stroke="#5A9A52" strokeWidth="0.8" opacity="0.8" />
              )}
            </G>
          )}

          {/* ── GLASS REFLECTION (always on top) ── */}
          <Path d="M26 40 Q24 40 24 45 L23 80"
            fill="none" stroke="#fff"
            strokeWidth="3" strokeLinecap="round" opacity="0.25" />
          <Path d="M26 88 L25 105"
            fill="none" stroke="#fff"
            strokeWidth="2" strokeLinecap="round" opacity="0.2" />

          {/* ── JAR BORDER on top ── */}
          <Path
            d="M28 35 Q22 35 20 42 L18 125 Q18 134 30 134 L90 134 Q102 134 102 125 L100 42 Q98 35 92 35 Z"
            fill="none"
            stroke={color} strokeWidth="2.5"
          />

          {/* ── EMPTY STATE ── */}
          {percent <= 0 && (
            <G>
              <SvgText x="60" y="95" textAnchor="middle"
                fontSize="30" opacity="0.25">
                {getPotIcon(name)}
              </SvgText>
              <SvgText x="60" y="115" textAnchor="middle"
                fontSize="10" fill={color} opacity="0.35">
                vazio
              </SvgText>
            </G>
          )}

          {/* ── PERCENT label ── */}
          {percent > 0 && percent < 70 && (
            <SvgText
              x="60"
              y={percentY}
              textAnchor="middle"
              fontSize="14"
              fontWeight="bold"
              fill={percent >= 80 ? '#E24B4A' : percent >= 50 ? '#BA7517' : '#7A4F00'}
              opacity="0.9"
            >
              {`${Math.round(percent)}%`}
            </SvgText>
          )}
          {percent >= 70 && (
            <SvgText x="60" y="125" textAnchor="middle"
              fontSize="11" fontWeight="bold"
              fill="#7A4F00" opacity="0.8">
              {`${Math.round(percent)}%`}
            </SvgText>
          )}
        </Svg>
      </View>
    </TouchableOpacity>
  )
}
