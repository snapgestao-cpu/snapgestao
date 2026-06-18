import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Dimensions, FlatList, Modal, TextInput, Image,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Polygon, Circle, Line, Text as SvgText } from 'react-native-svg'
import { PieChart, BarChart, LineChart } from 'react-native-gifted-charts'
import { Colors } from '../../constants/colors'
import { getCardImage } from '../../constants/cardBrands'
import { groupTransactionsByMerchantAndDate } from '../../lib/group-transactions'
import TransactionGroup from '../../components/TransactionGroup'
import { useAuthStore } from '../../stores/useAuthStore'
import { supabase } from '../../lib/supabase'
import { getCycle } from '../../lib/cycle'
import { brl, fmtShort, fmtSigned } from '../../lib/finance'
import {
  getExpensesByPot, getNecessityShare, getMonthlyTotalsOptimized,
  getCreditCommitmentsSimple, getPaymentMethodDistribution,
  getGoalsProgress, getEmergencyReserveHistory, getFinancialScore,
  getCreditByCard, getCardExpensesHistory,
  PotExpense, MonthlyTotal, CreditCommitment, PaymentMethodShare,
  GoalProgress, ReservePoint, NecessityShare, FinancialScore,
  CreditByCard, CreditByCardTx, CardExpensesHistoryMonth,
} from '../../lib/charts-data'

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
  {
    emoji: '🎯', key: 'controle',     name: 'Controle',
    desc: '% de potes que ficaram dentro do limite',
    tip:  'Reduza gastos nos potes que estouraram',
  },
  {
    emoji: '💰', key: 'poupanca',     name: 'Poupança',
    desc: '% da renda que sobrou nos últimos 3 ciclos',
    tip:  'Tente guardar pelo menos 10% da renda',
  },
  {
    emoji: '📋', key: 'planejamento', name: 'Planejamento',
    desc: 'Mede se você está em dia com seus compromissos financeiros. 100% = nenhum lançamento atrasado.',
    tip:  'Confirme ou cancele lançamentos agendados com data passada',
  },
  {
    emoji: '⚖️', key: 'equilibrio',  name: 'Equilíbrio',
    desc: 'Proporção de necessidades vs. desejos',
    tip:  'Ideal: 70% necessidades, 30% desejos',
  },
  {
    emoji: '📈', key: 'consistencia',name: 'Consistência',
    desc: 'Quantos dos últimos 6 ciclos foram positivos',
    tip:  'Feche mais ciclos no azul para melhorar',
  },
]

function getMotivation(score: number): string {
  if (score <= 40) return 'Você está começando sua jornada financeira. Cada passo conta! 💪'
  if (score <= 70) return 'Bom progresso! Continue monitorando seus gastos. 📊'
  if (score <= 90) return 'Ótima gestão financeira! Você está no caminho certo. ⭐'
  return 'Excelente! Você é um exemplo de controle financeiro! 🏆'
}


// ── CardPurchasesModal ─────────────────────────────────────────────────────
function CardPurchasesModal({
  card, monthYear, onClose,
}: {
  card: CreditByCard; monthYear: string; onClose: () => void
}) {
  const insets = useSafeAreaInsets()
  const [search, setSearch] = useState('')

  const txItems = useMemo(() => card.transactions.map(tx => ({
    id: tx.id,
    description: tx.description ?? null,
    merchant: tx.merchant ?? null,
    amount: tx.amount,
    type: 'expense' as const,
    payment_method: 'credit',
    date: tx.date,
    billing_date: tx.date as string | null,
    pot_id: null as string | null,
    potName: tx.potName ?? undefined,
    potColor: undefined as string | undefined,
    installment_number: tx.installment_number ?? null,
    installment_total: tx.installment_total ?? null,
  })), [card.transactions])

  const groups = useMemo(() => groupTransactionsByMerchantAndDate(txItems), [txItems])

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return groups
    return groups.filter(g =>
      (g.merchant?.toLowerCase().includes(q) ?? false) ||
      g.transactions.some((t: any) =>
        (t.description ?? '').toLowerCase().includes(q)
      )
    )
  }, [groups, search])

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <View style={[s.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={s.modalHeader}>
            <View style={s.cardBrandWrap}>
              <Image source={getCardImage(card.cardId ? card.brand : 'generic')} style={{ width: 80, height: 50 }} resizeMode="contain" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.modalCardName}>{card.cardName}</Text>
              <Text style={s.modalMonthYear}>Compras em {monthYear} · {brl(card.total)}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={s.modalCloseBtn}>
              <Text style={s.modalCloseTxt}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={s.modalSearchWrap}>
            <TextInput
              style={s.modalSearch}
              placeholder="Buscar compra..."
              placeholderTextColor={Colors.textMuted}
              value={search}
              onChangeText={setSearch}
            />
          </View>

          <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled>
            {filteredGroups.length === 0
              ? <Empty icon="🔍" text="Nenhuma compra encontrada" />
              : filteredGroups.map(g => (
                  <TransactionGroup key={g.key} transactions={g.transactions} />
                ))
            }
            <View style={{ height: 8 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

// ── Radar Chart ────────────────────────────────────────────────────────────
function RadarChart({ scores }: { scores: number[] }) {
  const SIZE   = 300
  const CENTER = 150
  const RADIUS = 88
  const N      = scores.length
  const LABELS = ['Controle', 'Poupança', 'Planejamento', 'Equilíbrio', 'Consistência']

  function getPoint(index: number, value: number) {
    const angle = (Math.PI * 2 * index) / N - Math.PI / 2
    return {
      x: CENTER + RADIUS * (value / 100) * Math.cos(angle),
      y: CENTER + RADIUS * (value / 100) * Math.sin(angle),
    }
  }
  function getAxis(index: number) {
    const angle = (Math.PI * 2 * index) / N - Math.PI / 2
    return {
      x: CENTER + RADIUS * Math.cos(angle),
      y: CENTER + RADIUS * Math.sin(angle),
    }
  }
  function getLabelPos(index: number) {
    const angle = (Math.PI * 2 * index) / N - Math.PI / 2
    return {
      x: CENTER + (RADIUS + 34) * Math.cos(angle),
      y: CENTER + (RADIUS + 34) * Math.sin(angle),
    }
  }

  const rings      = [25, 50, 75, 100]
  const dataPoints = scores.map((v, i) => getPoint(i, v))
  const polyPoints = dataPoints.map(p => `${p.x},${p.y}`).join(' ')

  return (
    <Svg width={SIZE} height={SIZE} viewBox={`-10 -10 ${SIZE + 20} ${SIZE + 20}`}>
      {rings.map(r => {
        const pts = Array.from({ length: N }, (_, i) => {
          const a = (Math.PI * 2 * i) / N - Math.PI / 2
          return `${CENTER + RADIUS * (r / 100) * Math.cos(a)},${CENTER + RADIUS * (r / 100) * Math.sin(a)}`
        }).join(' ')
        return <Polygon key={r} points={pts} fill="none" stroke={Colors.border} strokeWidth={0.8} />
      })}
      {Array.from({ length: N }, (_, i) => {
        const ax = getAxis(i)
        return <Line key={i} x1={CENTER} y1={CENTER} x2={ax.x} y2={ax.y} stroke={Colors.border} strokeWidth={0.8} />
      })}
      <Polygon points={polyPoints} fill={Colors.primary + '35'} stroke={Colors.primary} strokeWidth={2} />
      {dataPoints.map((p, i) => <Circle key={i} cx={p.x} cy={p.y} r={4} fill={Colors.primary} />)}
      {LABELS.map((label, i) => {
        const lp   = getLabelPos(i)
        const words = label.split(' ')
        return words.length === 1 ? (
          <SvgText key={i} x={lp.x} y={lp.y} fontSize={9} fill={Colors.textMuted}
            textAnchor="middle" alignmentBaseline="middle">
            {label}
          </SvgText>
        ) : (
          <SvgText key={i} x={lp.x} y={lp.y} fontSize={9} fill={Colors.textMuted} textAnchor="middle">
            {words.map((w, wi) => (
              <SvgText key={wi} x={lp.x} dy={wi === 0 ? -6 : 11} fontSize={9} fill={Colors.textMuted} textAnchor="middle">
                {w}
              </SvgText>
            ))}
          </SvgText>
        )
      })}
    </Svg>
  )
}

// ── Skeleton / Empty / ChartCard ───────────────────────────────────────────
function Skeleton({ height = 160 }: { height?: number }) {
  return <View style={[s.skeleton, { height }]} />
}

function Empty({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={s.empty}>
      <Text style={s.emptyIcon}>{icon}</Text>
      <Text style={s.emptyText}>{text}</Text>
    </View>
  )
}

function ChartCard({ title, description, children }: {
  title: string; description?: string; children: React.ReactNode
}) {
  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>{title}</Text>
      {description ? <Text style={s.cardDesc}>{description}</Text> : null}
      {children}
    </View>
  )
}

// ── Topic 1: Gastos ────────────────────────────────────────────────────────
function TopicGastos({ userId, cycleStart, cycleEnd, isActive }: {
  userId: string; cycleStart: string; cycleEnd: string; isActive: boolean
}) {
  const [potExpenses, setPotExpenses]   = useState<PotExpense[]>([])
  const [necessity, setNecessity]       = useState<NecessityShare | null>(null)
  const [paymentDist, setPaymentDist]   = useState<PaymentMethodShare[]>([])
  const [loading, setLoading]           = useState(true)
  const hasLoaded = useRef(false)

  useEffect(() => {
    if (!isActive && !hasLoaded.current) return
    hasLoaded.current = true
    setLoading(true)
    Promise.all([
      getExpensesByPot(userId, cycleStart, cycleEnd),
      getNecessityShare(userId, cycleStart, cycleEnd),
      getPaymentMethodDistribution(userId, cycleStart, cycleEnd),
    ]).then(([pe, ns, pd]) => {
      setPotExpenses(pe)
      setNecessity(ns)
      setPaymentDist(pd)
      setLoading(false)
    })
  }, [isActive, userId, cycleStart, cycleEnd])

  if (loading) return <><Skeleton /><Skeleton /><Skeleton /></>

  const totalExp = potExpenses.reduce((sum, p) => sum + p.total, 0)

  const pieData = potExpenses.slice(0, 8).map(p => ({
    value: p.total,
    color: p.potColor,
    text: totalExp > 0 ? Math.round((p.total / totalExp) * 100) + '%' : '',
  }))

  const ns = necessity ?? { necessity: 0, desire: 0, unclassified: 0 }
  const needTotal   = ns.necessity + ns.desire + ns.unclassified
  const needPie = needTotal > 0 ? [
    ...(ns.necessity > 0 ? [{ value: ns.necessity, color: Colors.success, text: Math.round((ns.necessity / needTotal) * 100) + '%' }] : []),
    ...(ns.desire > 0    ? [{ value: ns.desire,    color: Colors.warning,  text: Math.round((ns.desire / needTotal) * 100) + '%' }] : []),
    ...(ns.unclassified > 0 ? [{ value: ns.unclassified, color: Colors.border, text: Math.round((ns.unclassified / needTotal) * 100) + '%' }] : []),
  ] : []

  const totalDist  = paymentDist.reduce((sum, p) => sum + p.total, 0)
  const pieDist    = paymentDist.map(p => ({
    value: p.total, color: p.color,
    text: totalDist > 0 ? Math.round((p.total / totalDist) * 100) + '%' : '',
  }))

  return (
    <>
      {/* Gráfico 1: donut por pote */}
      <ChartCard title="Gastos por pote" description="Veja como seus gastos estão distribuídos entre os potes neste ciclo.">
        {pieData.length === 0 ? (
          <Empty icon="🫙" text="Nenhum gasto registrado neste ciclo" />
        ) : (
          <>
            <View style={s.center}>
              <PieChart
                data={pieData}
                donut radius={80} innerRadius={50}
                centerLabelComponent={() => <Text style={s.donutCenter}>{brl(totalExp)}</Text>}
                showText textSize={10} textColor={Colors.white}
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

      {/* Gráfico 2: necessidade vs desejo */}
      <ChartCard title="Necessidade vs. Desejo" description="Proporção dos seus gastos entre necessidades e desejos.">
        <Text style={s.noteText}>
          Baseado na classificação que você faz ao registrar cada gasto. Ao lançar uma despesa, o toggle "Necessidade/Desejo" define esta categorização.
        </Text>
        {needPie.length === 0 ? (
          <Empty icon="🏷️" text="Nenhum gasto no ciclo" />
        ) : (
          <>
            <View style={s.center}>
              <PieChart data={needPie} radius={70} showText textSize={11} textColor={Colors.white} />
            </View>
            <View style={s.legendWrap}>
              {ns.necessity > 0 && (
                <View style={s.legendRow}>
                  <View style={[s.legendDot, { backgroundColor: Colors.success }]} />
                  <Text style={s.legendName}>Necessidade</Text>
                  <Text style={s.legendVal}>{brl(ns.necessity)}</Text>
                  {needTotal > 0 && <Text style={s.legendPct}>{Math.round((ns.necessity / needTotal) * 100)}%</Text>}
                </View>
              )}
              {ns.desire > 0 && (
                <View style={s.legendRow}>
                  <View style={[s.legendDot, { backgroundColor: Colors.warning }]} />
                  <Text style={s.legendName}>Desejo</Text>
                  <Text style={s.legendVal}>{brl(ns.desire)}</Text>
                  {needTotal > 0 && <Text style={s.legendPct}>{Math.round((ns.desire / needTotal) * 100)}%</Text>}
                </View>
              )}
              {ns.unclassified > 0 && (
                <View style={s.legendRow}>
                  <View style={[s.legendDot, { backgroundColor: Colors.border }]} />
                  <Text style={s.legendName}>Não classificado</Text>
                  <Text style={s.legendVal}>{brl(ns.unclassified)}</Text>
                  {needTotal > 0 && <Text style={s.legendPct}>{Math.round((ns.unclassified / needTotal) * 100)}%</Text>}
                </View>
              )}
            </View>
            {ns.unclassified > 0 && (
              <View style={s.classifyHint}>
                <Text style={s.classifyHintText}>
                  💡 {Math.round((ns.unclassified / needTotal) * 100)}% dos gastos não foram classificados.
                  Classifique ao lançar para melhorar essa análise.
                </Text>
              </View>
            )}
          </>
        )}
      </ChartCard>

      {/* Gráfico 3: distribuição por forma de pagamento */}
      <ChartCard title="Distribuição por forma de pagamento" description="Como você está pagando suas despesas — cartão, pix, dinheiro, etc.">
        {pieDist.length === 0 ? (
          <Empty icon="💰" text="Nenhum gasto registrado neste ciclo" />
        ) : (
          <>
            <View style={s.center}>
              <PieChart
                data={pieDist} donut radius={80} innerRadius={50}
                showText textSize={10} textColor={Colors.white}
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

// ── Topic 2: Receita e Saldo ───────────────────────────────────────────────
type RealMonth = MonthlyTotal & { income: number; expense: number; balance: number }

function TopicReceita({ userId, cycleStartDay, isActive }: { userId: string; cycleStartDay: number; isActive: boolean }) {
  const [monthly, setMonthly] = useState<MonthlyTotal[]>([])
  const [loading, setLoading]  = useState(true)
  const hasLoaded = useRef(false)

  useEffect(() => {
    if (!isActive && !hasLoaded.current) return
    hasLoaded.current = true
    setLoading(true)
    getMonthlyTotalsOptimized(userId, cycleStartDay).then(data => {
      setMonthly(data)
      setLoading(false)
    })
  }, [isActive, userId, cycleStartDay])

  if (loading) return <><Skeleton /><Skeleton /></>

  const real   = monthly.filter((m): m is RealMonth => m.income !== null)
  const future = monthly.filter(m => m.income === null)

  if (real.length === 0) return (
    <>
      <ChartCard title="Receita vs. Despesa">
        <Empty icon="💰" text="Nenhum dado de receita/despesa disponível" />
      </ChartCard>
      <ChartCard title="Saldo por ciclo">
        <Empty icon="📈" text="Nenhum dado de saldo disponível" />
      </ChartCard>
    </>
  )

  // ── LineChart: apenas meses reais ──────────────────────────────────────
  const incomeLineData = real.map(m => ({ value: m.income }))
  const expLineData    = real.map(m => ({ value: m.expense }))
  const lineLabels     = real.map(m => m.label.slice(0, 3))
  const lineMaxValue   = Math.ceil(Math.max(...real.map(m => Math.max(m.income, m.expense)), 1) * 1.2)

  // ── BarChart: reais + futuros vazios ───────────────────────────────────
  const balances  = real.map(m => m.balance)
  const maxBal    = Math.max(...balances, 0)
  const minBal    = Math.min(...balances, 0)
  const hasNeg    = minBal < -0.01
  const barMaxVal = Math.ceil(maxBal * 1.2) || 50
  const barMinVal = hasNeg ? Math.floor(minBal * 1.2) : undefined

  const realBars = real.map(m => ({
    value: m.balance,
    label: m.label.slice(0, 3),
    frontColor: m.balance >= 0 ? Colors.success : Colors.danger,
    topLabelComponent: () => (
      <Text style={{ fontSize: 8, color: m.balance >= 0 ? Colors.success : Colors.danger, marginBottom: 2, textAlign: 'center' }}>
        {fmtSigned(m.balance)}
      </Text>
    ),
  }))

  // Barras futuras com value=0 — exibem o label no eixo X mas sem barra
  const futureBars = future.map(m => ({
    value: 0,
    label: m.label.slice(0, 3),
    frontColor: Colors.border,
  }))

  const balanceBarData = [...realBars, ...futureBars]

  return (
    <>
      <ChartCard
        title="Receita vs. Despesa"
        description="Receita e despesa por mês — últimos 4 ciclos e atual. Apenas transações reais, sem projeção."
      >
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled>
            <LineChart
              data={incomeLineData}
              data2={expLineData}
              width={CHART_W - 32}
              height={280}
              maxValue={lineMaxValue}
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
              xAxisLabelTexts={lineLabels}
              xAxisLabelTextStyle={{ color: Colors.textMuted, fontSize: 9 }}
              rulesColor={Colors.border}
              thickness={2}
              formatYLabel={(val) => fmtShort(parseFloat(val))}
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
          {future.length > 0 && (
            <View style={s.futureNote}>
              <Text style={s.futureNoteText}>
                Próximos {future.length} meses ({future.map(m => m.label.slice(0, 3)).join(' · ')}): sem dados
              </Text>
            </View>
          )}
        </>
      </ChartCard>

      <ChartCard
        title="Saldo por ciclo"
        description="Saldo = receita − despesa de cada ciclo. Verde = positivo. Vermelho = negativo. Meses futuros aparecem vazios."
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled>
          <BarChart
            data={balanceBarData}
            width={CHART_W - 32}
            barWidth={28}
            spacing={14}
            maxValue={barMaxVal}
            mostNegativeValue={barMinVal}
            noOfSectionsBelowXAxis={hasNeg ? 3 : 0}
            noOfSections={4}
            yAxisTextStyle={{ color: Colors.textMuted, fontSize: 9 }}
            xAxisLabelTextStyle={{ color: Colors.textMuted, fontSize: 9 }}
            rulesColor={Colors.border}
            barBorderRadius={3}
            formatYLabel={(val) => fmtShort(parseFloat(val))}
          />
        </ScrollView>
      </ChartCard>
    </>
  )
}

// ── Topic 3: Metas e Reserva ───────────────────────────────────────────────
function TopicMetas({ userId, isActive }: { userId: string; isActive: boolean }) {
  const [goals, setGoals]     = useState<GoalProgress[]>([])
  const [reserve, setReserve] = useState<ReservePoint[]>([])
  const [loading, setLoading] = useState(true)
  const hasLoaded = useRef(false)

  useEffect(() => {
    if (!isActive && !hasLoaded.current) return
    hasLoaded.current = true
    setLoading(true)
    Promise.all([
      getGoalsProgress(userId),
      getEmergencyReserveHistory(userId, 6),
    ]).then(([g, r]) => { setGoals(g); setReserve(r); setLoading(false) })
  }, [isActive, userId])

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
            areaChart curved
            noOfSections={3}
            yAxisTextStyle={{ color: Colors.textMuted, fontSize: 9 }}
            xAxisLabelTexts={reserve.map(r => r.label)}
            xAxisLabelTextStyle={{ color: Colors.textMuted, fontSize: 9 }}
            rulesColor={Colors.border}
            thickness={2}
            formatYLabel={(val) => fmtShort(parseFloat(val))}
          />
        )}
      </ChartCard>
    </>
  )
}

// ── Topic 4: Crédito ───────────────────────────────────────────────────────
function getEmptyMessage(cycleStart: string, cycleEnd: string, monthYear: string): string {
  const today = new Date().toISOString().split('T')[0]
  if (cycleStart > today) return `Ainda não há gastos registrados para ${monthYear}`
  if (cycleEnd < today) return `Não houve gastos no crédito em ${monthYear}`
  return `Nenhum gasto no crédito em ${monthYear}`
}

function CreditCardRow({
  card, total, onPress,
}: { card: CreditByCard; total: number; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.cardCard} onPress={onPress} activeOpacity={0.7}>
      <View style={s.cardCardTop}>
        <View style={s.cardBrandWrap}>
          <Image source={getCardImage(card.cardId ? card.brand : 'generic')} style={{ width: 80, height: 50 }} resizeMode="contain" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.cardCardName}>
            {card.cardName}{card.lastFour ? ` (•••• ${card.lastFour})` : ''}
          </Text>
          <Text style={s.cardCardAmt}>
            {brl(card.total)}{total > 0 ? ` · ${Math.round((card.total / total) * 100)}%` : ''}
            {` · ${card.transactions.length} compra${card.transactions.length !== 1 ? 's' : ''}`}
          </Text>
        </View>
        <Text style={s.cardChevron}>›</Text>
      </View>
      <View style={s.cardProgressBg}>
        <View style={[s.cardProgressFill, {
          width: total > 0 ? `${Math.round((card.total / total) * 100)}%` as any : '0%',
          backgroundColor: card.color,
        }]} />
      </View>
    </TouchableOpacity>
  )
}

function TopicCredito({ userId, cycleStartDay, cycleStart, cycleEnd, monthYear, isActive }: {
  userId: string; cycleStartDay: number; cycleStart: string; cycleEnd: string; monthYear: string; isActive: boolean
}) {
  const [commitments, setCommitments]   = useState<CreditCommitment[]>([])
  const [creditByCard, setCreditByCard] = useState<CreditByCard[]>([])
  const [history, setHistory]           = useState<CardExpensesHistoryMonth[]>([])
  const [loading, setLoading]           = useState(true)
  const [tooltipIdx, setTooltipIdx]     = useState<number | null>(null)
  const [selectedCard, setSelectedCard] = useState<CreditByCard | null>(null)
  const [selectedMonthYear, setSelectedMonthYear] = useState(monthYear)
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set())
  const hasLoaded = useRef(false)

  useEffect(() => {
    if (!isActive && !hasLoaded.current) return
    hasLoaded.current = true
    setLoading(true)
    Promise.all([
      getCreditCommitmentsSimple(userId, cycleStartDay, 6),
      getCreditByCard(userId, cycleStart, cycleEnd),
      getCardExpensesHistory(userId, cycleStartDay, 3),
    ]).then(([c, cb, h]) => {
      setCommitments(c)
      setCreditByCard(cb)
      setHistory(h)
      setLoading(false)
    })
  }, [isActive, userId, cycleStartDay, cycleStart, cycleEnd])

  if (loading) return <><Skeleton /><Skeleton /></>

  const commitBarData = commitments.map((c, i) => ({
    value: c.total,
    label: c.label.slice(0, 3),
    frontColor: c.isFuture ? Colors.primary : Colors.border,
    topLabelComponent: c.total > 0
      ? () => (
          <TouchableOpacity onPress={() => setTooltipIdx(tooltipIdx === i ? null : i)}>
            <Text style={{ fontSize: 8, color: c.isFuture ? Colors.primary : Colors.textMuted, marginBottom: 2, textAlign: 'center' }}>
              {fmtShort(c.total)}
            </Text>
          </TouchableOpacity>
        )
      : undefined,
    onPress: () => setTooltipIdx(tooltipIdx === i ? null : i),
  }))

  const totalCard = creditByCard.reduce((sum, c) => sum + c.total, 0)

  function toggleMonth(cycleStart: string) {
    setExpandedMonths(prev => {
      const next = new Set(prev)
      next.has(cycleStart) ? next.delete(cycleStart) : next.add(cycleStart)
      return next
    })
  }

  return (
    <>
      <ChartCard title="Compromisso de crédito futuro" description="Total de parcelas de cartão que vencem em cada mês. Toque na barra para ver detalhes.">
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
                yAxisTextStyle={{ color: Colors.textMuted, fontSize: 9 }}
                xAxisLabelTextStyle={{ color: Colors.textMuted, fontSize: 9 }}
                rulesColor={Colors.border}
                barBorderRadius={3}
                formatYLabel={(val) => fmtShort(parseFloat(val))}
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

      <ChartCard title="Gastos por cartão de crédito" description="Veja quanto você gastou em cada cartão neste ciclo. Toque em um cartão para ver as compras.">
        {creditByCard.length === 0 ? (
          <View style={s.creditEmptyBox}>
            <Text style={s.creditEmptyIcon}>💳</Text>
            <Text style={s.creditEmptyText}>{getEmptyMessage(cycleStart, cycleEnd, monthYear)}</Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {creditByCard.map(c => (
              <CreditCardRow
                key={c.cardId ?? 'none'}
                card={c}
                total={totalCard}
                onPress={() => { setSelectedCard(c); setSelectedMonthYear(monthYear) }}
              />
            ))}
          </View>
        )}

        {history.length > 0 && (
          <View style={{ marginTop: 20 }}>
            <Text style={s.historyTitle}>📊 Meses anteriores com gastos</Text>
            {history.map(month => {
              const expanded = expandedMonths.has(month.cycleStart)
              const monthTotal = month.total
              return (
                <View key={month.cycleStart} style={s.historyMonth}>
                  <TouchableOpacity
                    style={s.historyMonthHeader}
                    onPress={() => toggleMonth(month.cycleStart)}
                    activeOpacity={0.7}
                  >
                    <Text style={s.historyMonthLabel}>{month.cycleLabel}</Text>
                    <Text style={s.historyMonthTotal}>{brl(month.total)}</Text>
                    <Text style={s.historyChevron}>{expanded ? '▼' : '▶'}</Text>
                  </TouchableOpacity>
                  {expanded && (
                    <View style={s.historyMonthBody}>
                      {month.cards.map(c => (
                        <CreditCardRow
                          key={c.cardId ?? 'none'}
                          card={c}
                          total={monthTotal}
                          onPress={() => { setSelectedCard(c); setSelectedMonthYear(month.cycleLabel) }}
                        />
                      ))}
                    </View>
                  )}
                </View>
              )
            })}
          </View>
        )}
      </ChartCard>

      {selectedCard && (
        <CardPurchasesModal
          card={selectedCard}
          monthYear={selectedMonthYear}
          onClose={() => setSelectedCard(null)}
        />
      )}
    </>
  )
}

// ── Topic 5: IA ────────────────────────────────────────────────────────────
function TopicIA({ userId, cycleStartDay, isActive }: { userId: string; cycleStartDay: number; isActive: boolean }) {
  const [score, setScore]     = useState<FinancialScore | null>(null)
  const [loading, setLoading] = useState(true)
  const hasLoaded = useRef(false)

  useEffect(() => {
    if (!isActive && !hasLoaded.current) return
    hasLoaded.current = true
    setLoading(true)
    getFinancialScore(userId, cycleStartDay).then(s => { setScore(s); setLoading(false) })
  }, [isActive, userId, cycleStartDay])

  if (loading) return <Skeleton height={320} />
  if (!score)  return <Empty icon="🤖" text="Dados insuficientes para calcular o score" />

  const scoreValues = [score.controle, score.poupanca, score.planejamento, score.equilibrio, score.consistencia]
  const scoreColor  = score.total >= 75 ? Colors.success : score.total >= 50 ? Colors.warning : Colors.danger

  return (
    <ChartCard title="Seu Perfil Financeiro">
      <Text style={s.cardDesc}>
        Este gráfico mostra sua saúde financeira em 5 dimensões, calculadas com base no seu histórico. Quanto maior a área preenchida, melhor sua situação em cada aspecto.
      </Text>

      <View style={s.center}>
        <RadarChart scores={scoreValues} />
      </View>

      <View style={s.scoreBox}>
        <Text style={[s.scoreNum, { color: scoreColor }]}>Score: {score.total}/100</Text>
        <Text style={s.scoreMotivation}>{getMotivation(score.total)}</Text>
      </View>

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
  const [activeIdx, setActiveIdx]       = useState(0)
  const [cycleOffset, setCycleOffset]   = useState(0)
  const [hasCreditTx, setHasCreditTx]   = useState(false)
  const flatRef = useRef<FlatList>(null)

  const cycle = useMemo(
    () => getCycle(user?.cycle_start ?? 1, cycleOffset),
    [user?.cycle_start, cycleOffset]
  )

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
      {index === 0 && <TopicGastos  userId={user.id} cycleStart={cycle.startISO} cycleEnd={cycle.endISO} isActive={activeIdx === 0} />}
      {index === 1 && <TopicReceita userId={user.id} cycleStartDay={user.cycle_start} isActive={activeIdx === 1} />}
      {index === 2 && <TopicMetas   userId={user.id} isActive={activeIdx === 2} />}
      {index === 3 && (
        <TopicCredito
          userId={user.id}
          cycleStartDay={user.cycle_start}
          cycleStart={cycle.startISO}
          cycleEnd={cycle.endISO}
          monthYear={cycle.monthYear}
          isActive={activeIdx === 3}
        />
      )}
      {index === 4 && <TopicIA userId={user.id} cycleStartDay={user.cycle_start} isActive={activeIdx === 4} />}
    </ScrollView>
  )

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Gráficos</Text>
      </View>

      {activeIdx === 0 && (
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
      )}

      {hasCreditTx && (
        <View style={s.creditBanner}>
          <Text style={s.creditBannerText}>
            ℹ️ Este ciclo inclui parcelas de cartão de crédito com vencimento em {cycle.monthYear}. As datas de compra podem ser de meses anteriores.
          </Text>
        </View>
      )}

      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.tabsRow}
        style={s.tabsScroll}
      >
        {TOPICS.map((t, i) => (
          <TouchableOpacity
            key={t.id} onPress={() => scrollToTopic(i)}
            style={[s.tab, activeIdx === i && s.tabActive]}
          >
            <Text style={[s.tabText, activeIdx === i && s.tabTextActive]} numberOfLines={1}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={s.dotsRow}>
        {TOPICS.map((_, i) => (
          <View key={i} style={[s.dot, activeIdx === i && s.dotActive]} />
        ))}
      </View>

      <FlatList
        ref={flatRef}
        data={TOPICS}
        renderItem={renderTopic}
        keyExtractor={t => t.id}
        horizontal pagingEnabled
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
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.textDark },

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
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, flexShrink: 0,
  },
  tabActive:     { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabText:       { fontSize: 12, fontWeight: '600', color: Colors.textMuted, flexShrink: 0 },
  tabTextActive: { color: Colors.white },

  dotsRow: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    gap: 6, paddingVertical: 6, backgroundColor: Colors.white,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  dot:       { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.border },
  dotActive: { backgroundColor: Colors.primary, width: 14 },

  topicPad: { padding: 16, paddingBottom: 32 },

  card: {
    backgroundColor: Colors.white, borderRadius: 14,
    padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: Colors.border,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: Colors.textDark, marginBottom: 4 },
  cardDesc:  { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic', marginBottom: 12, lineHeight: 16 },

  noteText: {
    fontSize: 11, color: Colors.textMuted, backgroundColor: Colors.lightBlue,
    borderRadius: 8, padding: 10, marginBottom: 12, lineHeight: 16,
  },

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

  // Future months note
  futureNote: {
    backgroundColor: Colors.background, borderRadius: 8, padding: 8, marginTop: 10,
    borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed' as const,
  },
  futureNoteText: { fontSize: 10, color: Colors.textMuted, textAlign: 'center' as const },

  // Necessity/Desire hint
  classifyHint: {
    backgroundColor: Colors.lightAmber, borderRadius: 8, padding: 10, marginTop: 8,
  },
  classifyHintText: { fontSize: 11, color: Colors.warning, lineHeight: 16 },

  // Goals
  goalRow:    { marginBottom: 14 },
  goalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  goalName:   { fontSize: 13, fontWeight: '600', color: Colors.textDark, flex: 1 },
  goalPct:    { fontSize: 12, fontWeight: '700', color: Colors.primary },
  goalBarBg:  { height: 8, backgroundColor: Colors.border, borderRadius: 4, overflow: 'hidden' },
  goalBarFill:{ height: 8, borderRadius: 4 },
  goalValues: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 },
  goalCurrent:{ fontSize: 11, fontWeight: '600', color: Colors.primary },
  goalTarget: { fontSize: 11, color: Colors.textMuted },

  // Tooltip
  tooltip: {
    backgroundColor: Colors.lightBlue, borderRadius: 10,
    padding: 12, marginTop: 10, borderWidth: 1, borderColor: Colors.primary + '40',
  },
  tooltipTitle: { fontSize: 12, fontWeight: '700', color: Colors.primary, marginBottom: 6 },
  tooltipItem:  { fontSize: 11, color: Colors.textDark, marginBottom: 2 },
  tooltipMore:  { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  tooltipClose: { alignSelf: 'flex-end', marginTop: 8 },

  // IA Score
  scoreBox: {
    alignItems: 'center', marginVertical: 12,
    backgroundColor: Colors.background, borderRadius: 12, paddingVertical: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  scoreNum:        { fontSize: 26, fontWeight: '800', marginBottom: 4 },
  scoreMotivation: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: 8 },

  // IA Axis cards
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

  // Credit card rows
  cardCard: {
    backgroundColor: Colors.background, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, padding: 12,
  },
  cardCardTop:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  cardBrandWrap:   { width: 80, alignItems: 'center', justifyContent: 'center' },
  cardCardName:    { fontSize: 13, fontWeight: '700', color: Colors.textDark },
  cardCardAmt:     { fontSize: 12, color: Colors.textMuted, marginTop: 1 },
  cardChevron:     { fontSize: 18, color: Colors.textMuted },
  cardProgressBg:  { height: 4, backgroundColor: Colors.border, borderRadius: 2, overflow: 'hidden' },
  cardProgressFill:{ height: 4, borderRadius: 2 },

  // Credit empty state
  creditEmptyBox: { alignItems: 'center', paddingVertical: 20 },
  creditEmptyIcon: { fontSize: 28, marginBottom: 8 },
  creditEmptyText: { fontSize: 12, color: Colors.textMuted, textAlign: 'center' as const },

  // Credit history
  historyTitle: {
    fontSize: 13, fontWeight: '700', color: Colors.textDark, marginBottom: 10,
  },
  historyMonth: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 8,
    overflow: 'hidden',
  },
  historyMonthHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: Colors.white,
  },
  historyMonthLabel: {
    flex: 1, fontSize: 13, fontWeight: '700', color: Colors.textDark,
  },
  historyMonthTotal: {
    fontSize: 13, fontWeight: '700', color: Colors.primary, marginRight: 8,
  },
  historyChevron: { fontSize: 11, color: Colors.textMuted },
  historyMonthBody: {
    padding: 10, paddingTop: 4,
    backgroundColor: Colors.background, gap: 8,
  },

  // CardPurchasesModal
  modalOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '80%' as any,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  modalCardName:   { fontSize: 15, fontWeight: '700', color: Colors.textDark },
  modalMonthYear:  { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  modalCloseBtn:   { padding: 4 },
  modalCloseTxt:   { fontSize: 16, color: Colors.textMuted },
  modalSearchWrap: { paddingHorizontal: 16, paddingVertical: 10 },
  modalSearch: {
    backgroundColor: Colors.background, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, fontSize: 13,
    color: Colors.textDark, borderWidth: 1, borderColor: Colors.border,
  },
})
