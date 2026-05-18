import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Dimensions, FlatList,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import Svg, { Polygon, Circle, Line, Text as SvgText } from 'react-native-svg'
import { PieChart, BarChart, LineChart } from 'react-native-gifted-charts'
import { Colors } from '../constants/colors'
import { useAuthStore } from '../stores/useAuthStore'
import { supabase } from '../lib/supabase'
import { getCycle } from '../lib/cycle'
import { brl } from '../lib/finance'
import {
  getExpensesByPot, getNecessityShare, getMonthlyTotalsOptimized,
  getCreditCommitmentsSimple, getPaymentMethodDistribution,
  getGoalsProgress, getEmergencyReserveHistory, getFinancialScore,
  PotExpense, MonthlyTotal, CreditCommitment, PaymentMethodShare,
  GoalProgress, ReservePoint, NecessityShare, FinancialScore,
} from '../lib/charts-data'

const { width: SCREEN_W } = Dimensions.get('window')
const CHART_W = SCREEN_W - 32

const TOPICS = [
  { id: 'gastos',  label: '📊 Gastos' },
  { id: 'receita', label: '💰 Receita e Saldo' },
  { id: 'metas',   label: '🎯 Metas e Reserva' },
  { id: 'credito', label: '💳 Crédito' },
  { id: 'ia',      label: '🤖 IA' },
]

const AXIS_INFO = [
  { emoji: '🎯', key: 'controle',    name: 'Controle',     desc: '% de potes que ficaram dentro do limite',        tip: 'Reduza gastos nos potes que estouraram' },
  { emoji: '💰', key: 'poupanca',    name: 'Poupança',     desc: '% da renda que sobrou nos últimos 3 ciclos',      tip: 'Tente guardar pelo menos 10% da renda' },
  { emoji: '📋', key: 'planejamento',name: 'Planejamento', desc: '% de agendados confirmados no prazo',            tip: 'Confirme seus lançamentos agendados regularmente' },
  { emoji: '⚖️', key: 'equilibrio',  name: 'Equilíbrio',   desc: 'Proporção de necessidades vs. desejos',          tip: 'Ideal: 70% necessidades, 30% desejos' },
  { emoji: '📈', key: 'consistencia',name: 'Consistência', desc: 'Quantos dos últimos 6 ciclos foram positivos',    tip: 'Feche mais ciclos no azul para melhorar' },
]

function getMotivation(score: number): string {
  if (score <= 40) return 'Você está começando sua jornada financeira. Cada passo conta! 💪'
  if (score <= 70) return 'Bom progresso! Continue monitorando seus gastos. 📊'
  if (score <= 90) return 'Ótima gestão financeira! Você está no caminho certo. ⭐'
  return 'Excelente! Você é um exemplo de controle financeiro! 🏆'
}

// ── Radar Chart ────────────────────────────────────────────────────────────
function RadarChart({ scores }: { scores: number[] }) {
  const SIZE = 220
  const CENTER = SIZE / 2
  const RADIUS = 78
  const N = scores.length

  function getPoint(index: number, value: number) {
    const angle = (Math.PI * 2 * index) / N - Math.PI / 2
    const r = RADIUS * (value / 100)
    return { x: CENTER + r * Math.cos(angle), y: CENTER + r * Math.sin(angle) }
  }

  function getLabelPoint(index: number) {
    const angle = (Math.PI * 2 * index) / N - Math.PI / 2
    return { x: CENTER + (RADIUS + 24) * Math.cos(angle), y: CENTER + (RADIUS + 24) * Math.sin(angle) }
  }

  const LABELS = ['Controle', 'Poupança', 'Planej.', 'Equilíbrio', 'Consistência']
  const rings = [25, 50, 75, 100]
  const dataPoints = scores.map((v, i) => getPoint(i, v))
  const polygonPoints = dataPoints.map(p => `${p.x},${p.y}`).join(' ')

  return (
    <Svg width={SIZE} height={SIZE}>
      {rings.map(r => {
        const pts = Array.from({ length: N }, (_, i) => getPoint(i, r)).map(p => `${p.x},${p.y}`).join(' ')
        return <Polygon key={r} points={pts} fill="none" stroke={Colors.border} strokeWidth={0.8} />
      })}
      {Array.from({ length: N }, (_, i) => {
        const pt = getPoint(i, 100)
        return <Line key={i} x1={CENTER} y1={CENTER} x2={pt.x} y2={pt.y} stroke={Colors.border} strokeWidth={0.8} />
      })}
      <Polygon points={polygonPoints} fill={Colors.primary + '35'} stroke={Colors.primary} strokeWidth={2} />
      {dataPoints.map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={4} fill={Colors.primary} />
      ))}
      {LABELS.map((label, i) => {
        const lp = getLabelPoint(i)
        return (
          <SvgText key={i} x={lp.x} y={lp.y} fontSize={8.5} fill={Colors.textMuted} textAnchor="middle" alignmentBaseline="middle">
            {label}
          </SvgText>
        )
      })}
    </Svg>
  )
}

// ── Skeleton ───────────────────────────────────────────────────────────────
function Skeleton({ height = 160 }: { height?: number }) {
  return <View style={[s.skeleton, { height }]} />
}

// ── Empty State ────────────────────────────────────────────────────────────
function Empty({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={s.empty}>
      <Text style={s.emptyIcon}>{icon}</Text>
      <Text style={s.emptyText}>{text}</Text>
    </View>
  )
}

// ── Chart Card ─────────────────────────────────────────────────────────────
function ChartCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>{title}</Text>
      {description ? <Text style={s.cardDesc}>{description}</Text> : null}
      {children}
    </View>
  )
}

// ── Topic 1: Gastos ────────────────────────────────────────────────────────
function TopicGastos({ userId, cycleStart, cycleEnd }: { userId: string; cycleStart: string; cycleEnd: string }) {
  const [potExpenses, setPotExpenses] = useState<PotExpense[]>([])
  const [necessity, setNecessity] = useState<NecessityShare | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      getExpensesByPot(userId, cycleStart, cycleEnd),
      getNecessityShare(userId, cycleStart, cycleEnd),
    ]).then(([pe, ns]) => {
      setPotExpenses(pe)
      setNecessity(ns)
      setLoading(false)
    })
  }, [userId, cycleStart, cycleEnd])

  if (loading) return <><Skeleton /><Skeleton /></>

  const totalExp = potExpenses.reduce((sum, p) => sum + p.total, 0)

  const pieData = potExpenses.slice(0, 8).map(p => ({
    value: p.total,
    color: p.potColor,
    text: totalExp > 0 ? Math.round((p.total / totalExp) * 100) + '%' : '',
  }))

  const barData = potExpenses.slice(0, 6).map(p => ({
    value: p.total,
    label: p.potName.slice(0, 6),
    frontColor: p.potColor,
  }))

  const needTotal = (necessity?.necessity ?? 0) + (necessity?.desire ?? 0)
  const needPie = needTotal > 0 ? [
    { value: necessity!.necessity, color: Colors.success, text: Math.round((necessity!.necessity / needTotal) * 100) + '%' },
    { value: necessity!.desire,    color: Colors.warning,  text: Math.round((necessity!.desire / needTotal) * 100) + '%' },
  ] : []

  return (
    <>
      <ChartCard title="Gastos por pote" description="Veja como seus gastos estão distribuídos entre os potes neste ciclo.">
        {pieData.length === 0 ? (
          <Empty icon="🫙" text="Nenhum gasto registrado neste ciclo" />
        ) : (
          <>
            <View style={s.center}>
              <PieChart
                data={pieData}
                donut
                radius={80}
                innerRadius={50}
                centerLabelComponent={() => <Text style={s.donutCenter}>{brl(totalExp)}</Text>}
                showText
                textSize={10}
                textColor={Colors.white}
              />
            </View>
            <View style={s.legendWrap}>
              {potExpenses.slice(0, 8).map(p => (
                <View key={p.potId} style={s.legendRow}>
                  <View style={[s.legendDot, { backgroundColor: p.potColor }]} />
                  <Text style={s.legendName}>{p.potName}</Text>
                  <Text style={s.legendVal}>{brl(p.total)}</Text>
                  {totalExp > 0 && <Text style={s.legendPct}>{Math.round((p.total / totalExp) * 100)}%</Text>}
                </View>
              ))}
            </View>
          </>
        )}
      </ChartCard>

      <ChartCard title="Gasto vs. Orçado por pote" description="Compare o que você gastou com o limite definido em cada pote.">
        {barData.length === 0 ? (
          <Empty icon="📊" text="Nenhum dado disponível" />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled>
            <BarChart
              data={barData}
              width={Math.max(CHART_W - 32, barData.length * 68)}
              barWidth={22}
              spacing={16}
              noOfSections={4}
              yAxisTextStyle={{ color: Colors.textMuted, fontSize: 10 }}
              xAxisLabelTextStyle={{ color: Colors.textMuted, fontSize: 9 }}
              rulesColor={Colors.border}
              barBorderRadius={3}
            />
          </ScrollView>
        )}
      </ChartCard>

      <ChartCard title="Necessidade vs. Desejo" description="Proporção dos seus gastos entre necessidades e desejos.">
        {needPie.length === 0 ? (
          <Empty icon="🏷️" text="Classifique seus gastos como necessidade ou desejo ao lançar" />
        ) : (
          <>
            <View style={s.center}>
              <PieChart data={needPie} radius={70} showText textSize={11} textColor={Colors.white} />
            </View>
            <View style={s.legendWrap}>
              <View style={s.legendRow}>
                <View style={[s.legendDot, { backgroundColor: Colors.success }]} />
                <Text style={s.legendName}>Necessidade</Text>
                <Text style={s.legendVal}>{brl(necessity!.necessity)}</Text>
                {needTotal > 0 && <Text style={s.legendPct}>{Math.round((necessity!.necessity / needTotal) * 100)}%</Text>}
              </View>
              <View style={s.legendRow}>
                <View style={[s.legendDot, { backgroundColor: Colors.warning }]} />
                <Text style={s.legendName}>Desejo</Text>
                <Text style={s.legendVal}>{brl(necessity!.desire)}</Text>
                {needTotal > 0 && <Text style={s.legendPct}>{Math.round((necessity!.desire / needTotal) * 100)}%</Text>}
              </View>
            </View>
          </>
        )}
      </ChartCard>
    </>
  )
}

// ── Topic 2: Receita e Saldo ───────────────────────────────────────────────
function TopicReceita({ userId, cycleStartDay }: { userId: string; cycleStartDay: number }) {
  const [monthly, setMonthly] = useState<MonthlyTotal[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getMonthlyTotalsOptimized(userId, cycleStartDay, 7).then(data => {
      setMonthly(data)
      setLoading(false)
    })
  }, [userId, cycleStartDay])

  if (loading) return <><Skeleton /><Skeleton /></>

  const incomeLineData = monthly.map(m => ({ value: m.income }))
  const expLineData    = monthly.map(m => ({ value: m.expense }))
  const labels         = monthly.map(m => m.label.slice(0, 3))

  const balanceBarData = monthly.map(m => {
    const saldo = m.income - m.expense
    return { value: Math.abs(saldo), label: m.label.slice(0, 3), frontColor: saldo >= 0 ? Colors.success : Colors.danger }
  })

  return (
    <>
      <ChartCard title="Receita vs. Despesa" description="Evolução mensal da sua receita e despesa nos últimos 6 meses.">
        {monthly.every(m => m.income === 0 && m.expense === 0) ? (
          <Empty icon="💰" text="Nenhum dado de receita/despesa disponível" />
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled>
              <LineChart
                data={incomeLineData}
                data2={expLineData}
                width={CHART_W - 32}
                height={160}
                color1={Colors.primary}
                color2={Colors.danger}
                dataPointsColor1={Colors.primary}
                dataPointsColor2={Colors.danger}
                startFillColor1={Colors.primary}
                startFillColor2={Colors.danger}
                endFillColor1={Colors.white}
                endFillColor2={Colors.white}
                startOpacity1={0.2}
                endOpacity1={0}
                startOpacity2={0.2}
                endOpacity2={0}
                areaChart
                curved
                noOfSections={4}
                yAxisTextStyle={{ color: Colors.textMuted, fontSize: 9 }}
                xAxisLabelTexts={labels}
                xAxisLabelTextStyle={{ color: Colors.textMuted, fontSize: 9 }}
                rulesColor={Colors.border}
                thickness={2}
              />
            </ScrollView>
            <View style={[s.legendWrap, { marginTop: 8 }]}>
              <View style={s.legendRow}>
                <View style={[s.legendDot, { backgroundColor: Colors.primary }]} />
                <Text style={s.legendName}>Receita</Text>
              </View>
              <View style={s.legendRow}>
                <View style={[s.legendDot, { backgroundColor: Colors.danger }]} />
                <Text style={s.legendName}>Despesa</Text>
              </View>
            </View>
          </>
        )}
      </ChartCard>

      <ChartCard title="Saldo por ciclo" description="Histórico do saldo final de cada ciclo — verde é positivo, vermelho é negativo.">
        {balanceBarData.every(b => b.value === 0) ? (
          <Empty icon="📈" text="Nenhum dado de saldo disponível" />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled>
            <BarChart
              data={balanceBarData}
              width={CHART_W - 32}
              barWidth={26}
              spacing={14}
              noOfSections={4}
              yAxisTextStyle={{ color: Colors.textMuted, fontSize: 10 }}
              xAxisLabelTextStyle={{ color: Colors.textMuted, fontSize: 9 }}
              rulesColor={Colors.border}
              barBorderRadius={3}
            />
          </ScrollView>
        )}
      </ChartCard>
    </>
  )
}

// ── Topic 3: Metas e Reserva ───────────────────────────────────────────────
function TopicMetas({ userId }: { userId: string }) {
  const [goals, setGoals]     = useState<GoalProgress[]>([])
  const [reserve, setReserve] = useState<ReservePoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      getGoalsProgress(userId),
      getEmergencyReserveHistory(userId, 6),
    ]).then(([g, r]) => {
      setGoals(g)
      setReserve(r)
      setLoading(false)
    })
  }, [userId])

  if (loading) return <><Skeleton /><Skeleton /></>

  const reserveLineData = reserve.map(r => ({ value: r.balance }))

  return (
    <>
      <ChartCard title="Progresso das metas" description="Quanto você já avançou em cada meta ativa.">
        {goals.length === 0 ? (
          <Empty icon="🎯" text="Crie sua primeira meta para ver o progresso aqui" />
        ) : (
          <View>
            {goals.map(g => (
              <View key={g.id} style={s.goalRow}>
                <View style={s.goalHeader}>
                  <Text style={s.goalName} numberOfLines={1}>{g.name}</Text>
                  <Text style={s.goalPct}>{Math.round(g.pct)}%</Text>
                </View>
                <View style={s.goalBarBg}>
                  <View style={[s.goalBarFill, {
                    width: `${Math.min(100, g.pct)}%` as any,
                    backgroundColor: g.pct >= 100 ? Colors.success : Colors.primary,
                  }]} />
                </View>
                <View style={s.goalValues}>
                  <Text style={s.goalCurrent}>{brl(g.current)}</Text>
                  <Text style={s.goalTarget}>meta: {brl(g.target)}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ChartCard>

      <ChartCard title="Evolução da reserva de emergência" description="Evolução do saldo da sua reserva ao longo do tempo.">
        {reserve.every(r => r.balance === 0) ? (
          <Empty icon="🛡️" text="Nenhuma movimentação na reserva de emergência" />
        ) : (
          <LineChart
            data={reserveLineData}
            width={CHART_W - 32}
            height={140}
            color={Colors.success}
            dataPointsColor={Colors.success}
            startFillColor={Colors.success}
            endFillColor={Colors.white}
            startOpacity={0.25}
            endOpacity={0}
            areaChart
            curved
            noOfSections={3}
            yAxisTextStyle={{ color: Colors.textMuted, fontSize: 9 }}
            xAxisLabelTexts={reserve.map(r => r.label)}
            xAxisLabelTextStyle={{ color: Colors.textMuted, fontSize: 9 }}
            rulesColor={Colors.border}
            thickness={2}
          />
        )}
      </ChartCard>
    </>
  )
}

// ── Topic 4: Crédito ───────────────────────────────────────────────────────
function TopicCredito({ userId, cycleStartDay, cycleStart, cycleEnd }: {
  userId: string; cycleStartDay: number; cycleStart: string; cycleEnd: string
}) {
  const [commitments, setCommitments] = useState<CreditCommitment[]>([])
  const [paymentDist, setPaymentDist]  = useState<PaymentMethodShare[]>([])
  const [loading, setLoading]          = useState(true)
  const [tooltipIdx, setTooltipIdx]    = useState<number | null>(null)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      getCreditCommitmentsSimple(userId, cycleStartDay, 6),
      getPaymentMethodDistribution(userId, cycleStart, cycleEnd),
    ]).then(([c, p]) => {
      setCommitments(c)
      setPaymentDist(p)
      setLoading(false)
    })
  }, [userId, cycleStartDay, cycleStart, cycleEnd])

  if (loading) return <><Skeleton /><Skeleton /></>

  const commitBarData = commitments.map((c, i) => ({
    value: c.total,
    label: c.label.slice(0, 3),
    frontColor: c.isFuture ? Colors.primary : Colors.border,
    onPress: () => setTooltipIdx(tooltipIdx === i ? null : i),
  }))

  const totalDist = paymentDist.reduce((sum, p) => sum + p.total, 0)
  const pieDist   = paymentDist.map(p => ({
    value: p.total,
    color: p.color,
    text: totalDist > 0 ? Math.round((p.total / totalDist) * 100) + '%' : '',
  }))

  return (
    <>
      <ChartCard title="Compromisso de crédito futuro" description="Total de parcelas de cartão que vencem em cada mês futuro.">
        {commitments.every(c => c.total === 0) ? (
          <Empty icon="💳" text="Nenhuma parcela de crédito registrada" />
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled>
              <BarChart
                data={commitBarData}
                width={CHART_W - 32}
                barWidth={30}
                spacing={16}
                noOfSections={4}
                yAxisTextStyle={{ color: Colors.textMuted, fontSize: 10 }}
                xAxisLabelTextStyle={{ color: Colors.textMuted, fontSize: 9 }}
                rulesColor={Colors.border}
                barBorderRadius={3}
              />
            </ScrollView>
            {tooltipIdx !== null && commitments[tooltipIdx] && (
              <View style={s.tooltip}>
                <Text style={s.tooltipTitle}>{commitments[tooltipIdx].label} — {brl(commitments[tooltipIdx].total)}</Text>
                {commitments[tooltipIdx].items.slice(0, 5).map((item, j) => (
                  <Text key={j} style={s.tooltipItem}>· {item.merchant ?? item.description} — {brl(item.amount)}</Text>
                ))}
                {commitments[tooltipIdx].items.length > 5 && (
                  <Text style={s.tooltipMore}>+{commitments[tooltipIdx].items.length - 5} outros</Text>
                )}
                <TouchableOpacity onPress={() => setTooltipIdx(null)} style={s.tooltipClose}>
                  <Text style={{ fontSize: 11, color: Colors.textMuted }}>Fechar</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ChartCard>

      <ChartCard title="Distribuição por forma de pagamento" description="Como você está pagando suas despesas — cartão, pix, dinheiro, etc.">
        {pieDist.length === 0 ? (
          <Empty icon="💰" text="Nenhum gasto registrado neste ciclo" />
        ) : (
          <>
            <View style={s.center}>
              <PieChart
                data={pieDist}
                donut
                radius={80}
                innerRadius={50}
                showText
                textSize={10}
                textColor={Colors.white}
                centerLabelComponent={() => <Text style={s.donutCenter}>{brl(totalDist)}</Text>}
              />
            </View>
            <View style={s.legendWrap}>
              {paymentDist.map(p => (
                <View key={p.method} style={s.legendRow}>
                  <View style={[s.legendDot, { backgroundColor: p.color }]} />
                  <Text style={s.legendName}>{p.label}</Text>
                  <Text style={s.legendVal}>{brl(p.total)}</Text>
                  {totalDist > 0 && <Text style={s.legendPct}>{Math.round((p.total / totalDist) * 100)}%</Text>}
                </View>
              ))}
            </View>
          </>
        )}
      </ChartCard>
    </>
  )
}

// ── Topic 5: IA ────────────────────────────────────────────────────────────
function TopicIA({ userId, cycleStartDay }: { userId: string; cycleStartDay: number }) {
  const [score, setScore] = useState<FinancialScore | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getFinancialScore(userId, cycleStartDay).then(s => {
      setScore(s)
      setLoading(false)
    })
  }, [userId, cycleStartDay])

  if (loading) return <Skeleton height={260} />
  if (!score)  return <Empty icon="🤖" text="Dados insuficientes para calcular o score" />

  const scoreValues = [score.controle, score.poupanca, score.planejamento, score.equilibrio, score.consistencia]
  const scoreColor  = score.total >= 75 ? Colors.success : score.total >= 50 ? Colors.warning : Colors.danger

  return (
    <ChartCard title="Seu Perfil Financeiro">
      <Text style={s.cardDesc}>
        Este gráfico mostra sua saúde financeira em 5 dimensões, calculadas com base no seu histórico. Quanto maior a área preenchida, melhor sua situação em cada aspecto.
      </Text>

      {/* Radar + Score geral */}
      <View style={s.center}>
        <RadarChart scores={scoreValues} />
      </View>
      <View style={s.scoreBox}>
        <Text style={[s.scoreNum, { color: scoreColor }]}>Score: {score.total}/100</Text>
        <Text style={s.scoreMotivation}>{getMotivation(score.total)}</Text>
      </View>

      {/* Axis cards */}
      <View style={{ marginTop: 16, gap: 10 }}>
        {AXIS_INFO.map(a => {
          const val = score[a.key as keyof FinancialScore] as number
          const barColor = val >= 70 ? Colors.success : val >= 40 ? Colors.warning : Colors.danger
          return (
            <View key={a.key} style={s.axisCard}>
              <View style={s.axisCardHeader}>
                <Text style={s.axisEmoji}>{a.emoji}</Text>
                <Text style={s.axisCardName}>{a.name}</Text>
                <Text style={[s.axisCardScore, { color: barColor }]}>{val}/100</Text>
              </View>
              <View style={s.axisBg}>
                <View style={[s.axisFill, { width: `${val}%` as any, backgroundColor: barColor }]} />
              </View>
              <Text style={s.axisDesc}>{a.desc}</Text>
              <Text style={s.axisTip}>💡 {a.tip}</Text>
            </View>
          )
        })}
      </View>
    </ChartCard>
  )
}

// ── Main Screen ────────────────────────────────────────────────────────────
export default function ChartsScreen() {
  const { user } = useAuthStore()
  const [activeIdx, setActiveIdx]   = useState(0)
  const [cycleOffset, setCycleOffset] = useState(0)
  const [hasCreditTx, setHasCreditTx] = useState(false)
  const flatRef = useRef<FlatList>(null)

  const cycle = getCycle(user?.cycle_start ?? 1, cycleOffset)

  useEffect(() => {
    if (!user) return
    supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('payment_method', 'credit')
      .eq('type', 'expense')
      .gte('date', cycle.startISO)
      .lte('date', cycle.endISO)
      .then(({ count }) => setHasCreditTx((count ?? 0) > 0))
  }, [user?.id, cycle.startISO, cycle.endISO])

  const scrollToTopic = useCallback((idx: number) => {
    setActiveIdx(idx)
    flatRef.current?.scrollToIndex({ index: idx, animated: true })
  }, [])

  const onMomentumScrollEnd = useCallback((e: any) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W)
    setActiveIdx(idx)
  }, [])

  if (!user) return null

  const renderTopic = ({ index }: { item: typeof TOPICS[0]; index: number }) => (
    <ScrollView
      style={{ width: SCREEN_W }}
      contentContainerStyle={s.topicPad}
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled
    >
      {index === 0 && <TopicGastos  userId={user.id} cycleStart={cycle.startISO} cycleEnd={cycle.endISO} />}
      {index === 1 && <TopicReceita userId={user.id} cycleStartDay={user.cycle_start} />}
      {index === 2 && <TopicMetas   userId={user.id} />}
      {index === 3 && (
        <TopicCredito
          userId={user.id}
          cycleStartDay={user.cycle_start}
          cycleStart={cycle.startISO}
          cycleEnd={cycle.endISO}
        />
      )}
      {index === 4 && <TopicIA userId={user.id} cycleStartDay={user.cycle_start} />}
    </ScrollView>
  )

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={s.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Gráficos</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Cycle selector */}
      <View style={s.cycleRow}>
        <TouchableOpacity onPress={() => setCycleOffset(o => o - 1)} style={s.cycleArrow}>
          <Text style={s.cycleArrowText}>‹</Text>
        </TouchableOpacity>
        <Text style={s.cycleLabel}>{cycle.monthYear}</Text>
        <TouchableOpacity
          onPress={() => setCycleOffset(o => Math.min(o + 1, 0))}
          disabled={cycleOffset >= 0}
          style={[s.cycleArrow, cycleOffset >= 0 && { opacity: 0.3 }]}
        >
          <Text style={s.cycleArrowText}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Credit info banner */}
      {hasCreditTx && (
        <View style={s.creditBanner}>
          <Text style={s.creditBannerText}>
            ℹ️ Este ciclo inclui parcelas de cartão de crédito com vencimento em {cycle.monthYear}. As datas de compra podem ser de meses anteriores.
          </Text>
        </View>
      )}

      {/* Topic tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.tabsRow}
        style={s.tabsScroll}
      >
        {TOPICS.map((t, i) => (
          <TouchableOpacity
            key={t.id}
            onPress={() => scrollToTopic(i)}
            style={[s.tab, activeIdx === i && s.tabActive]}
          >
            <Text style={[s.tabText, activeIdx === i && s.tabTextActive]} numberOfLines={1}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Dot indicators */}
      <View style={s.dotsRow}>
        {TOPICS.map((_, i) => (
          <View key={i} style={[s.dot, activeIdx === i && s.dotActive]} />
        ))}
      </View>

      {/* Paged content — FlatList horizontal, each item has its own ScrollView vertical */}
      <FlatList
        ref={flatRef}
        data={TOPICS}
        renderItem={renderTopic}
        keyExtractor={t => t.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
        getItemLayout={(_, index) => ({ length: SCREEN_W, offset: SCREEN_W * index, index })}
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        windowSize={3}
        style={{ flex: 1 }}
      />
    </SafeAreaView>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: Colors.white,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn:    { width: 32, alignItems: 'flex-start' },
  backText:   { fontSize: 26, color: Colors.primary, fontWeight: '400', lineHeight: 30 },
  headerTitle:{ fontSize: 17, fontWeight: '700', color: Colors.textDark },

  cycleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 8, backgroundColor: Colors.white,
    borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 16,
  },
  cycleArrow:     { padding: 4 },
  cycleArrowText: { fontSize: 22, color: Colors.primary, fontWeight: '600' },
  cycleLabel:     { fontSize: 14, fontWeight: '700', color: Colors.textDark, minWidth: 90, textAlign: 'center' },

  creditBanner: {
    backgroundColor: Colors.lightBlue,
    paddingHorizontal: 14, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: Colors.primary + '30',
  },
  creditBannerText: { fontSize: 11, color: Colors.primary, lineHeight: 16 },

  tabsScroll: { backgroundColor: Colors.white, flexGrow: 0 },
  tabsRow:    { paddingHorizontal: 12, paddingVertical: 8, gap: 8, alignItems: 'center' },
  tab: {
    paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20,
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
    flexShrink: 0,
  },
  tabActive:    { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabText:      { fontSize: 12, fontWeight: '600', color: Colors.textMuted, flexShrink: 0 },
  tabTextActive:{ color: Colors.white },

  dotsRow: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    gap: 6, paddingVertical: 6, backgroundColor: Colors.white,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  dot:      { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.border },
  dotActive:{ backgroundColor: Colors.primary, width: 14 },

  topicPad: { padding: 16, paddingBottom: 32 },

  card: {
    backgroundColor: Colors.white, borderRadius: 14,
    padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: Colors.border,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: Colors.textDark, marginBottom: 4 },
  cardDesc:  { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic', marginBottom: 12, lineHeight: 16 },

  skeleton: { backgroundColor: Colors.border, borderRadius: 12, marginBottom: 16, opacity: 0.45 },

  empty:     { alignItems: 'center', paddingVertical: 24 },
  emptyIcon: { fontSize: 28, marginBottom: 8 },
  emptyText: { fontSize: 12, color: Colors.textMuted, textAlign: 'center' },

  center: { alignItems: 'center', marginBottom: 12 },

  legendWrap: { gap: 6, marginTop: 4 },
  legendRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot:  { width: 10, height: 10, borderRadius: 5 },
  legendName: { flex: 1, fontSize: 12, color: Colors.textDark },
  legendVal:  { fontSize: 12, fontWeight: '600', color: Colors.textDark },
  legendPct:  { fontSize: 11, color: Colors.textMuted, width: 36, textAlign: 'right' },

  donutCenter: { fontSize: 11, fontWeight: '700', color: Colors.textDark, textAlign: 'center' },

  goalRow:    { marginBottom: 14 },
  goalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  goalName:   { fontSize: 13, fontWeight: '600', color: Colors.textDark, flex: 1 },
  goalPct:    { fontSize: 12, fontWeight: '700', color: Colors.primary },
  goalBarBg:  { height: 8, backgroundColor: Colors.border, borderRadius: 4, overflow: 'hidden' },
  goalBarFill:{ height: 8, borderRadius: 4 },
  goalValues: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 },
  goalCurrent:{ fontSize: 11, fontWeight: '600', color: Colors.primary },
  goalTarget: { fontSize: 11, color: Colors.textMuted },

  tooltip: {
    backgroundColor: Colors.lightBlue, borderRadius: 10,
    padding: 12, marginTop: 10, borderWidth: 1, borderColor: Colors.primary + '40',
  },
  tooltipTitle: { fontSize: 12, fontWeight: '700', color: Colors.primary, marginBottom: 6 },
  tooltipItem:  { fontSize: 11, color: Colors.textDark, marginBottom: 2 },
  tooltipMore:  { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  tooltipClose: { alignSelf: 'flex-end', marginTop: 8 },

  // Score IA
  scoreBox: {
    alignItems: 'center', marginVertical: 12,
    backgroundColor: Colors.background, borderRadius: 12, paddingVertical: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  scoreNum:        { fontSize: 26, fontWeight: '800', marginBottom: 4 },
  scoreMotivation: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: 8 },

  // Axis cards IA
  axisCard: {
    backgroundColor: Colors.background, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  axisCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  axisEmoji:      { fontSize: 16 },
  axisCardName:   { flex: 1, fontSize: 13, fontWeight: '700', color: Colors.textDark },
  axisCardScore:  { fontSize: 13, fontWeight: '800' },
  axisBg:   { height: 6, backgroundColor: Colors.border, borderRadius: 3, overflow: 'hidden', marginBottom: 8 },
  axisFill: { height: 6, borderRadius: 3 },
  axisDesc: { fontSize: 11, color: Colors.textMuted, marginBottom: 4 },
  axisTip:  { fontSize: 11, color: Colors.primary, fontStyle: 'italic' },
})
