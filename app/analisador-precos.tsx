import React, { useState, useRef, useEffect } from 'react'
import {
  View, Text, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, Animated, Alert,
} from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Colors } from '../constants/colors'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/useAuthStore'
import { buscarDadosParaAnalise, analisarPrecos } from '../lib/analisador-precos'

// ── Perguntas ─────────────────────────────────────────────────────────────────

const PERGUNTAS = [
  {
    id: 'pote',
    titulo: 'Qual pote deseja\nanalisar?',
    emoji: '🫙',
    opcoes: [] as { key: string; label: string }[],
    dinamico: true,
    temOpcaoTodos: true,
    placeholder: 'Ou descreva o tipo de gasto...',
  },
  {
    id: 'preocupacao',
    titulo: 'O que mais\nte preocupa?',
    emoji: '🤔',
    opcoes: [
      { key: 'caro', label: '💸 Estou pagando caro sem saber' },
      { key: 'inflacao', label: '📈 Preços aumentando com o tempo' },
      { key: 'local', label: '🏪 Quero saber o melhor lugar para comprar' },
      { key: 'frequencia', label: '🛒 Compro muito do mesmo item' },
    ],
    placeholder: 'Ou descreva sua preocupação...',
  },
  {
    id: 'foco',
    titulo: 'Qual o foco\nda análise?',
    emoji: '🎯',
    opcoes: [
      { key: 'caros', label: '🥇 Top itens mais caros' },
      { key: 'frequentes', label: '🔄 Itens que compro com mais frequência' },
      { key: 'comparativo', label: '📊 Comparativo entre estabelecimentos' },
      { key: 'tudo', label: '🎯 Análise completa' },
    ],
    placeholder: 'Ou descreva o foco...',
  },
]

type Resposta = { opcao: string | null; comentario: string }

// ── Componente de tabela por item ─────────────────────────────────────────────

function TabelaItem({ item }: { item: any }) {
  const estabs: any[] = item.estabelecimentos || []
  const ordenados = [...estabs].sort((a, b) => a.preco_medio - b.preco_medio)

  function corEstab(index: number): string {
    if (index === 0) return '#1D9E75'
    if (index === ordenados.length - 1) return '#E24B4A'
    return '#BA7517'
  }

  function emojiTendencia(t: string): string {
    if (t === 'subindo') return '📈'
    if (t === 'descendo') return '📉'
    return '➡️'
  }

  const brl = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const emojiCategoria = (cat: string) => {
    if (cat === 'bebida') return '🥤'
    if (cat === 'alimento') return '🛒'
    if (cat === 'limpeza') return '🧹'
    return '📦'
  }

  return (
    <View style={{
      backgroundColor: Colors.white, borderRadius: 16,
      padding: 16, marginBottom: 16,
      shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
    }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Text style={{ fontSize: 20 }}>{emojiCategoria(item.categoria)}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.textDark, textTransform: 'capitalize' }}>
            {item.descricao}
          </Text>
          <Text style={{ fontSize: 11, color: Colors.textMuted }}>
            {estabs.reduce((s: number, e: any) => s + e.vezes, 0)} compras analisadas
          </Text>
        </View>
        {item.economia_mensal_potencial > 0 && (
          <View style={{ backgroundColor: '#EAF3DE', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 }}>
            <Text style={{ fontSize: 11, color: '#1D9E75', fontWeight: '700' }}>
              💰 {brl(item.economia_mensal_potencial)}/mês
            </Text>
          </View>
        )}
      </View>

      {/* Tabela horizontal */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          {/* Cabeçalho */}
          <View style={{
            flexDirection: 'row', backgroundColor: Colors.background,
            borderRadius: 8, paddingVertical: 6, marginBottom: 2,
          }}>
            <Text style={{ width: 140, fontSize: 11, fontWeight: '700', color: Colors.textMuted, paddingLeft: 8 }}>
              Estabelecimento
            </Text>
            <Text style={{ width: 72, fontSize: 11, fontWeight: '700', color: '#1D9E75', textAlign: 'center' }}>Mínimo</Text>
            <Text style={{ width: 72, fontSize: 11, fontWeight: '700', color: Colors.primary, textAlign: 'center' }}>Médio</Text>
            <Text style={{ width: 72, fontSize: 11, fontWeight: '700', color: '#E24B4A', textAlign: 'center' }}>Máximo</Text>
            <Text style={{ width: 48, fontSize: 11, fontWeight: '700', color: Colors.textMuted, textAlign: 'center' }}>Vezes</Text>
            <Text style={{ width: 36, fontSize: 11, fontWeight: '700', color: Colors.textMuted, textAlign: 'center' }}>📊</Text>
          </View>

          {/* Linhas */}
          {ordenados.map((estab: any, index: number) => (
            <View key={estab.nome} style={{
              flexDirection: 'row', paddingVertical: 8, alignItems: 'center',
              backgroundColor: index % 2 === 0 ? Colors.white : Colors.background,
              borderRadius: 6,
            }}>
              <View style={{ width: 140, flexDirection: 'row', alignItems: 'center', paddingLeft: 8, gap: 6 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: corEstab(index) }} />
                <Text style={{ fontSize: 12, color: Colors.textDark, flex: 1 }} numberOfLines={1}>
                  {estab.nome}
                </Text>
              </View>
              <Text style={{ width: 72, fontSize: 12, textAlign: 'center', color: '#1D9E75', fontWeight: '600' }}>
                {brl(estab.preco_minimo)}
              </Text>
              <Text style={{ width: 72, fontSize: 12, textAlign: 'center', color: Colors.primary, fontWeight: '700' }}>
                {brl(estab.preco_medio)}
              </Text>
              <Text style={{ width: 72, fontSize: 12, textAlign: 'center', color: '#E24B4A', fontWeight: '600' }}>
                {brl(estab.preco_maximo)}
              </Text>
              <Text style={{ width: 48, fontSize: 12, textAlign: 'center', color: Colors.textMuted }}>
                {estab.vezes}x
              </Text>
              <Text style={{ width: 36, fontSize: 14, textAlign: 'center' }}>
                {emojiTendencia(estab.tendencia)}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Insight */}
      {item.insight && (
        <View style={{
          backgroundColor: Colors.lightBlue, borderRadius: 10,
          padding: 10, marginTop: 12, flexDirection: 'row', gap: 6,
        }}>
          <Text style={{ fontSize: 14 }}>💡</Text>
          <Text style={{ fontSize: 12, color: Colors.primary, flex: 1, lineHeight: 18 }}>
            {item.insight}
          </Text>
        </View>
      )}
    </View>
  )
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AnalisadorPrecosScreen() {
  const insets = useSafeAreaInsets()
  const user = useAuthStore(s => s.user)

  const [perguntaAtual, setPerguntaAtual] = useState(0)
  const [respostas, setRespostas] = useState<Record<string, Resposta>>({})
  const [potes, setPotes] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [resultado, setResultado] = useState<any>(null)

  const slideAnim = useRef(new Animated.Value(0)).current
  const opacityAnim = useRef(new Animated.Value(1)).current

  useEffect(() => { loadPotes() }, [])

  async function loadPotes() {
    const { data } = await supabase
      .from('pots')
      .select('id, name, color')
      .eq('user_id', user?.id)
      .is('deleted_at', null)
      .eq('is_emergency', false)
    setPotes(data || [])
  }

  const pergunta = PERGUNTAS[perguntaAtual]

  const opcoes = pergunta.dinamico
    ? potes.map(p => ({ key: p.id, label: `🫙 ${p.name}` }))
    : pergunta.opcoes

  const resposta: Resposta = respostas[pergunta.id] || { opcao: null, comentario: '' }

  function atualizarResposta(changes: Partial<Resposta>) {
    setRespostas(prev => ({
      ...prev,
      [pergunta.id]: {
        opcao: prev[pergunta.id]?.opcao ?? null,
        comentario: prev[pergunta.id]?.comentario ?? '',
        ...changes,
      },
    }))
  }

  function animarTransicao(callback: () => void) {
    Animated.parallel([
      Animated.timing(opacityAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: -30, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      callback()
      slideAnim.setValue(30)
      Animated.parallel([
        Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start()
    })
  }

  function avancar() {
    if (perguntaAtual < PERGUNTAS.length - 1) {
      animarTransicao(() => setPerguntaAtual(p => p + 1))
    } else {
      executarAnalise()
    }
  }

  function voltar() {
    if (perguntaAtual > 0) {
      animarTransicao(() => setPerguntaAtual(p => p - 1))
    } else {
      router.back()
    }
  }

  async function executarAnalise() {
    setLoading(true)
    setLoadingMsg('Buscando suas compras...')

    try {
      const userId = user?.id
      if (!userId) throw new Error('Não autenticado')

      const poteSelecionado = respostas['pote']?.opcao === 'todos'
        ? null
        : (respostas['pote']?.opcao || null)

      const nomePote = poteSelecionado
        ? potes.find(p => p.id === poteSelecionado)?.name || null
        : null

      setLoadingMsg(`Analisando ${poteSelecionado ? `pote ${nomePote}` : 'todos os potes'}...`)

      const transactions = await buscarDadosParaAnalise(userId, poteSelecionado)

      if (transactions.length < 3) {
        Alert.alert(
          'Poucos dados',
          'Não encontrei compras suficientes para análise. Continue registrando seus gastos e tente novamente em alguns meses.',
          [{ text: 'OK', onPress: () => router.back() }]
        )
        setLoading(false)
        return
      }

      setLoadingMsg(`Gemini está analisando ${transactions.length} compras...`)

      const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY || ''
      const jsonResultado = await analisarPrecos(
        transactions,
        {
          pote: nomePote,
          preocupacao: respostas['preocupacao'] || { opcao: null, comentario: '' },
          foco: respostas['foco'] || { opcao: null, comentario: '' },
        },
        apiKey
      )

      const parsed = JSON.parse(jsonResultado)
      setResultado(parsed)
      setLoading(false)
    } catch (err: any) {
      setLoading(false)
      Alert.alert('Erro', String(err))
    }
  }

  const brl = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  // ── LOADING ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={{
        flex: 1, backgroundColor: Colors.background,
        justifyContent: 'center', alignItems: 'center', padding: 32,
      }}>
        <Text style={{ fontSize: 48, marginBottom: 24 }}>🔍</Text>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.textDark, marginTop: 24, textAlign: 'center' }}>
          {loadingMsg}
        </Text>
        <Text style={{ fontSize: 13, color: Colors.textMuted, marginTop: 8, textAlign: 'center' }}>
          Comparando preços e identificando padrões...
        </Text>
      </View>
    )
  }

  // ── RESULTADO ─────────────────────────────────────────────────────────────

  if (resultado) {
    const resumo = resultado.resumo || {}
    const itens: any[] = resultado.itens || []

    return (
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <View style={{
          backgroundColor: Colors.primary,
          paddingTop: insets.top + 8, paddingBottom: 16, paddingHorizontal: 20,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={{ color: '#fff', fontSize: 16 }}>‹ Voltar</Text>
            </TouchableOpacity>
            <Text style={{ flex: 1, color: '#fff', fontSize: 18, fontWeight: '700' }}>
              🔍 Analisador de Preços
            </Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>

          {/* Card de resumo */}
          <View style={{
            backgroundColor: Colors.primary, borderRadius: 20,
            padding: 20, marginBottom: 20,
          }}>
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800', marginBottom: 16 }}>
              📊 Resumo da Análise
            </Text>

            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
              <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: 12 }}>
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10, marginBottom: 4 }}>
                  💰 Economia potencial/mês
                </Text>
                <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>
                  {brl(resumo.economia_total_potencial || 0)}
                </Text>
              </View>
              <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: 12 }}>
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10, marginBottom: 4 }}>
                  📦 Itens analisados
                </Text>
                <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>
                  {resumo.total_itens_analisados || itens.length}
                </Text>
              </View>
            </View>

            {resumo.estabelecimento_mais_barato && (
              <View style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                <Text style={{ color: '#fff', fontSize: 12 }}>
                  🟢 Mais barato: <Text style={{ fontWeight: '700' }}>{resumo.estabelecimento_mais_barato}</Text>
                </Text>
              </View>
            )}
            {resumo.estabelecimento_mais_caro && (
              <View style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                <Text style={{ color: '#fff', fontSize: 12 }}>
                  🔴 Mais caro: <Text style={{ fontWeight: '700' }}>{resumo.estabelecimento_mais_caro}</Text>
                </Text>
              </View>
            )}
            {resumo.recomendacao_principal && (
              <View style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: 10 }}>
                <Text style={{ color: '#fff', fontSize: 12, lineHeight: 18 }}>
                  💡 {resumo.recomendacao_principal}
                </Text>
              </View>
            )}
          </View>

          {/* Tabelas por item */}
          <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.textDark, marginBottom: 12 }}>
            Comparativo por item:
          </Text>

          {itens.length === 0 ? (
            <View style={{ backgroundColor: Colors.white, borderRadius: 16, padding: 24, alignItems: 'center' }}>
              <Text style={{ fontSize: 32, marginBottom: 12 }}>🔍</Text>
              <Text style={{ fontSize: 14, color: Colors.textMuted, textAlign: 'center' }}>
                Não encontrei itens com 3 ou mais ocorrências para comparar.
                Continue registrando seus gastos!
              </Text>
            </View>
          ) : (
            itens.map((item: any, index: number) => (
              <TabelaItem key={index} item={item} />
            ))
          )}

          {/* Nova análise */}
          <TouchableOpacity
            onPress={() => { setResultado(null); setPerguntaAtual(0); setRespostas({}) }}
            style={{
              backgroundColor: Colors.white, borderRadius: 16, padding: 16,
              alignItems: 'center', borderWidth: 1.5, borderColor: Colors.primary, marginTop: 8,
            }}
          >
            <Text style={{ color: Colors.primary, fontSize: 15, fontWeight: '700' }}>🔄 Nova análise</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    )
  }

  // ── QUESTIONÁRIO ──────────────────────────────────────────────────────────

  const isUltima = perguntaAtual === PERGUNTAS.length - 1

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      {/* Header */}
      <View style={{
        backgroundColor: Colors.primary,
        paddingTop: insets.top + 8, paddingBottom: 20, paddingHorizontal: 20,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
          <TouchableOpacity onPress={voltar}>
            <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 16 }}>
              ‹ {perguntaAtual === 0 ? 'Cancelar' : 'Voltar'}
            </Text>
          </TouchableOpacity>
          <Text style={{ flex: 1, textAlign: 'center', color: '#fff', fontSize: 16, fontWeight: '700' }}>
            🔍 Analisador de Preços
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>
            {perguntaAtual + 1}/{PERGUNTAS.length}
          </Text>
        </View>

        {/* Progresso */}
        <View style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2 }}>
          <View style={{
            height: 4, borderRadius: 2, backgroundColor: '#fff',
            width: `${((perguntaAtual + 1) / PERGUNTAS.length) * 100}%`,
          }} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 24, paddingBottom: insets.bottom + 100 }}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View style={{ opacity: opacityAnim, transform: [{ translateY: slideAnim }] }}>
          <Text style={{ fontSize: 48, textAlign: 'center', marginBottom: 16 }}>
            {pergunta.emoji}
          </Text>
          <Text style={{ fontSize: 24, fontWeight: '800', color: Colors.textDark, textAlign: 'center', lineHeight: 32, marginBottom: 32 }}>
            {pergunta.titulo}
          </Text>

          {/* Opção "Todos os potes" */}
          {pergunta.temOpcaoTodos && (
            <OpcaoItem
              label="🫙 Todos os potes"
              active={resposta.opcao === 'todos'}
              onPress={() => atualizarResposta({ opcao: resposta.opcao === 'todos' ? null : 'todos' })}
            />
          )}

          {/* Opções dinâmicas / estáticas */}
          {opcoes.map((opcao) => (
            <OpcaoItem
              key={opcao.key}
              label={opcao.label}
              active={resposta.opcao === opcao.key}
              onPress={() => atualizarResposta({ opcao: resposta.opcao === opcao.key ? null : opcao.key })}
            />
          ))}

          {/* Campo livre */}
          <View style={{ marginTop: 12 }}>
            <Text style={{ fontSize: 12, color: Colors.textMuted, marginBottom: 8 }}>
              💬 {opcoes.length > 0 ? 'Adicionar comentário (opcional):' : 'Descreva:'}
            </Text>
            <TextInput
              value={resposta.comentario}
              onChangeText={text => atualizarResposta({ comentario: text })}
              placeholder={pergunta.placeholder}
              placeholderTextColor={Colors.textMuted}
              multiline
              numberOfLines={3}
              style={{
                backgroundColor: Colors.white, borderRadius: 12,
                padding: 14, fontSize: 14, color: Colors.textDark,
                borderWidth: 1, borderColor: Colors.border,
                minHeight: 80, textAlignVertical: 'top',
              }}
            />
          </View>
        </Animated.View>
      </ScrollView>

      {/* Botão avançar */}
      <View style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: 20, paddingBottom: insets.bottom + 12,
        backgroundColor: Colors.background,
        borderTopWidth: 0.5, borderTopColor: Colors.border,
      }}>
        <TouchableOpacity
          onPress={avancar}
          style={{
            backgroundColor: Colors.primary, borderRadius: 16,
            padding: 18, alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>
            {isUltima ? '🔍 Analisar meus preços' : 'Próxima →'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

// ── Helper de opção ───────────────────────────────────────────────────────────

function OpcaoItem({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        backgroundColor: active ? Colors.primary : Colors.white,
        borderRadius: 14, padding: 16, marginBottom: 10,
        borderWidth: 1.5, borderColor: active ? Colors.primary : Colors.border,
        flexDirection: 'row', alignItems: 'center', gap: 10,
      }}
    >
      <View style={{
        width: 22, height: 22, borderRadius: 11, borderWidth: 2,
        borderColor: active ? '#fff' : Colors.border,
        backgroundColor: active ? '#fff' : 'transparent',
        alignItems: 'center', justifyContent: 'center',
      }}>
        {active && (
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary }} />
        )}
      </View>
      <Text style={{ fontSize: 15, fontWeight: active ? '700' : '400', color: active ? '#fff' : Colors.textDark, flex: 1 }}>
        {label}
      </Text>
    </TouchableOpacity>
  )
}
