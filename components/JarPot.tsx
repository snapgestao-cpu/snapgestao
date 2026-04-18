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
  spent?: number
  limit?: number | null
  size?: number
  onPress?: () => void
}

// ─── Coin positions: bottom-to-top order (higher cy = bottom) ──────────────
// 24 coins total across 8 rows. Row 1 = bottom, Row 8 = top.
const COINS = [
  // Row 1 — base
  { cx: 28, cy: 122, rx: 14, ry: 5 },
  { cx: 52, cy: 120, rx: 15, ry: 5 },
  { cx: 77, cy: 122, rx: 14, ry: 5 },
  { cx: 98, cy: 121, rx: 12, ry: 4.5 },

  // Row 2
  { cx: 20, cy: 111, rx: 13, ry: 4.5 },
  { cx: 44, cy: 109, rx: 15, ry: 5 },
  { cx: 68, cy: 111, rx: 14, ry: 5 },
  { cx: 91, cy: 110, rx: 13, ry: 4.5 },

  // Row 3
  { cx: 32, cy: 100, rx: 14, ry: 5 },
  { cx: 57, cy: 98,  rx: 15, ry: 5 },
  { cx: 82, cy: 100, rx: 14, ry: 5 },

  // Row 4
  { cx: 21, cy: 89,  rx: 13, ry: 4.5 },
  { cx: 46, cy: 87,  rx: 15, ry: 5 },
  { cx: 71, cy: 89,  rx: 14, ry: 5 },
  { cx: 94, cy: 88,  rx: 12, ry: 4.5 },

  // Row 5
  { cx: 34, cy: 78,  rx: 14, ry: 5 },
  { cx: 59, cy: 76,  rx: 15, ry: 5 },
  { cx: 84, cy: 78,  rx: 14, ry: 5 },

  // Row 6
  { cx: 23, cy: 67,  rx: 13, ry: 4.5 },
  { cx: 48, cy: 65,  rx: 14, ry: 5 },
  { cx: 73, cy: 67,  rx: 14, ry: 5 },
  { cx: 95, cy: 66,  rx: 12, ry: 4.5 },

  // Row 7
  { cx: 37, cy: 56,  rx: 14, ry: 5 },
  { cx: 62, cy: 54,  rx: 15, ry: 5 },
]

const TOTAL = COINS.length // 24

// Jar interior clip path
const JAR_CLIP = "M 18 36 Q 12 36 11 44 L 8 126 Q 8 134 22 134 L 98 134 Q 112 134 112 126 L 109 44 Q 108 36 102 36 Z"

export function JarPot({ name, color, percent, size = 120, onPress }: Props) {
  const id = name.replace(/\W/g, '').slice(0, 10) || 'jar'
  const pct = Math.max(0, percent)

  const visibleCoins = pct <= 0 ? 0
    : Math.max(1, Math.min(TOTAL, Math.ceil((Math.min(pct, 100) / 100) * TOTAL)))

  const topCoin = visibleCoins > 0 ? COINS[visibleCoins - 1] : null
  const pctLabelY = topCoin ? Math.max(46, topCoin.cy - 10) : 85

  const showBills = pct >= 55
  const showBill3 = pct >= 82

  const scale = size / 120

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={onPress ? 0.75 : 1} disabled={!onPress}>
      <View style={{ width: size, alignItems: 'center' }}>
        <Svg
          width={120 * scale}
          height={148 * scale}
          viewBox="0 0 120 148"
        >
          <Defs>
            <ClipPath id={`jar-${id}`}>
              <Path d={JAR_CLIP} />
            </ClipPath>
          </Defs>

          {/* ── GLASS BODY FILL ─────────────────────────────── */}
          <Path
            d={JAR_CLIP}
            fill="rgba(185,225,248,0.22)"
            stroke="none"
          />

          {/* ── COINS (clipped inside jar) ───────────────────── */}
          <G clipPath={`url(#jar-${id})`}>
            {COINS.slice(0, visibleCoins).map((c, i) => (
              <G key={i}>
                {/* Under-shadow */}
                <Ellipse cx={c.cx} cy={c.cy + 3} rx={c.rx - 1} ry={c.ry - 1}
                  fill="rgba(0,0,0,0.18)" />
                {/* Coin body */}
                <Ellipse cx={c.cx} cy={c.cy} rx={c.rx} ry={c.ry}
                  fill="#F5C118" stroke="#B8860B" strokeWidth="0.9" />
                {/* Top sheen */}
                <Ellipse cx={c.cx} cy={c.cy - 1.2} rx={c.rx - 2.5} ry={c.ry - 1.8}
                  fill="#FFE566" opacity="0.65" />
                {/* $ label */}
                <SvgText
                  x={c.cx} y={c.cy + 2}
                  textAnchor="middle"
                  fontSize="5.5" fontWeight="bold"
                  fill="#7A4A00" opacity="0.88"
                >
                  $
                </SvgText>
                {/* Glint streak */}
                <Line
                  x1={c.cx - c.rx + 3} y1={c.cy - 1.5}
                  x2={c.cx - c.rx + 7} y2={c.cy - 2.8}
                  stroke="#FFFBE8" strokeWidth="1.3"
                  strokeLinecap="round" opacity="0.75"
                />
              </G>
            ))}

            {/* ── BILLS ───────────────────────────────────────── */}
            {showBills && (
              <G>
                {/* Bill 1 — left, tilted */}
                <Path d="M 22 52 L 58 44 L 61 59 L 25 68 Z"
                  fill="#7DC88A" stroke="#4E9A5A" strokeWidth="0.9" opacity="0.93" />
                <Ellipse cx={42} cy={56} rx={7} ry={4.5}
                  fill="none" stroke="#4E9A5A" strokeWidth="0.9" />
                <SvgText x={42} y={58} textAnchor="middle"
                  fontSize="5.5" fontWeight="bold" fill="#3A7A44">$</SvgText>
                <Line x1="25" y1="48" x2="56" y2="46"
                  stroke="#4E9A5A" strokeWidth="0.6" opacity="0.4" />
                <Line x1="27" y1="64" x2="59" y2="56"
                  stroke="#4E9A5A" strokeWidth="0.6" opacity="0.4" />

                {/* Bill 2 — right, tilted opposite */}
                <Path d="M 62 41 L 97 47 L 95 62 L 60 56 Z"
                  fill="#7DC88A" stroke="#4E9A5A" strokeWidth="0.9" opacity="0.88" />
                <Ellipse cx={79} cy={52} rx={7} ry={4.5}
                  fill="none" stroke="#4E9A5A" strokeWidth="0.9" />
                <SvgText x={79} y={54} textAnchor="middle"
                  fontSize="5.5" fontWeight="bold" fill="#3A7A44">$</SvgText>
                <Line x1="63" y1="59" x2="93" y2="60"
                  stroke="#4E9A5A" strokeWidth="0.6" opacity="0.4" />
              </G>
            )}

            {/* Bill 3 — center tall */}
            {showBill3 && (
              <G>
                <Path d="M 46 34 L 76 37 L 75 52 L 45 49 Z"
                  fill="#6DC078" stroke="#4E9A5A" strokeWidth="0.9" opacity="0.85" />
                <Ellipse cx={61} cy={43} rx={6} ry={4}
                  fill="none" stroke="#4E9A5A" strokeWidth="0.8" />
                <SvgText x={61} y={45} textAnchor="middle"
                  fontSize="5" fontWeight="bold" fill="#3A7A44">$</SvgText>
              </G>
            )}
          </G>

          {/* ── INNER GLASS WALLS (drawn over coins) ─────────── */}
          {/* Left wall shimmer */}
          <Path
            d="M 18 36 Q 12 36 11 44 L 8 126"
            fill="none"
            stroke="rgba(200,235,255,0.55)"
            strokeWidth="7"
            strokeLinecap="round"
          />
          {/* Right wall shimmer */}
          <Path
            d="M 102 36 Q 108 36 109 44 L 112 126"
            fill="none"
            stroke="rgba(200,235,255,0.35)"
            strokeWidth="6"
            strokeLinecap="round"
          />

          {/* ── JAR OUTLINE ──────────────────────────────────── */}
          <Path
            d={JAR_CLIP}
            fill="none"
            stroke={color}
            strokeWidth="2.5"
          />

          {/* ── GLASS HIGHLIGHT REFLECTIONS ──────────────────── */}
          <Path
            d="M 15 48 Q 14 48 13 54 L 11 94"
            fill="none"
            stroke="white"
            strokeWidth="4"
            strokeLinecap="round"
            opacity="0.38"
          />
          <Path
            d="M 12 102 L 10 120"
            fill="none"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
            opacity="0.28"
          />

          {/* ── LID ──────────────────────────────────────────── */}
          {/* Lid band */}
          <Rect x="14" y="25" width="92" height="13" rx="3.5"
            fill="#E4ECEE" stroke="#AABBBE" strokeWidth="1.1" />
          {/* Lid cap */}
          <Rect x="10" y="12" width="100" height="15" rx="5"
            fill="#EEF4F5" stroke="#AABBBE" strokeWidth="1.3" />
          {/* Lid top shine */}
          <Rect x="15" y="15" width="90" height="6" rx="3"
            fill="white" opacity="0.55" />
          {/* Lid band texture lines */}
          {[24, 36, 48, 60, 72, 84, 96].map(x => (
            <Line key={x} x1={x} y1="26" x2={x} y2="37"
              stroke="#BECDCF" strokeWidth="0.8" opacity="0.7" />
          ))}

          {/* ── EMPTY STATE ──────────────────────────────────── */}
          {pct <= 0 && (
            <G>
              <SvgText x="60" y="98" textAnchor="middle"
                fontSize="30" opacity="0.18">
                {getPotIcon(name)}
              </SvgText>
              <SvgText x="60" y="118" textAnchor="middle"
                fontSize="10" fill={color} opacity="0.28" fontWeight="600">
                vazio
              </SvgText>
            </G>
          )}

          {/* ── PERCENT LABEL ────────────────────────────────── */}
          {pct > 0 && (
            <SvgText
              x="60"
              y={showBills ? 126 : pctLabelY}
              textAnchor="middle"
              fontSize="13"
              fontWeight="bold"
              fill={
                pct >= 90 ? '#C0392B'
                  : pct >= 60 ? '#9A6200'
                  : '#7A4A00'
              }
              opacity="0.9"
            >
              {`${Math.round(pct)}%`}
            </SvgText>
          )}
        </Svg>
      </View>
    </TouchableOpacity>
  )
}
