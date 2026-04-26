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

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AnalisadorPrecosScreen() {
  const insets = useSafeAreaInsets()
  const user = useAuthStore(s => s.user)

  const [perguntaAtual, setPerguntaAtual] = useState(0)
  const [respostas, setRespostas] = useState<Record<string, Resposta>>({})
  const [potes, setPotes] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [relatorio, setRelatorio] = useState<string | null>(null)

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

      const transactions = await buscarDadosParaAnalise(userId, poteSelecionado, user?.cycle_start ?? 1)

      if (transactions.length < 3) {
        Alert.alert(
          'Poucos dados',
          'Não encontrei compras suficientes para análise. Continue registrando seus gastos e tente novamente em alguns meses.',
          [{ text: 'OK', onPress: () => router.back() }]
        )
        setLoading(false)
        return
      }

      setLoadingMsg('Analisando preços com IA...')

      const textoRelatorio = await analisarPrecos(
        transactions,
        {
          pote: nomePote,
          preocupacao: respostas['preocupacao'] || { opcao: null, comentario: '' },
          foco: respostas['foco'] || { opcao: null, comentario: '' },
        }
      )

      setRelatorio(textoRelatorio)
      setLoading(false)
    } catch (err: any) {
      setLoading(false)
      const msg = String(err).replace('Error: ', '')
      Alert.alert(
        'Não foi possível analisar',
        msg || 'Erro desconhecido. Tente novamente.',
        [{ text: 'OK' }]
      )
    }
  }

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

  if (relatorio) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <View style={{
          backgroundColor: Colors.primary,
          paddingTop: insets.top + 8, paddingBottom: 16, paddingHorizontal: 20,
          flexDirection: 'row', alignItems: 'center', gap: 12,
        }}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ color: '#fff', fontSize: 16 }}>‹ Voltar</Text>
          </TouchableOpacity>
          <Text style={{ flex: 1, color: '#fff', fontSize: 18, fontWeight: '700' }}>
            🔍 Análise de Preços
          </Text>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
          <View style={{
            backgroundColor: Colors.white, borderRadius: 20,
            padding: 20, marginBottom: 16,
            shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, elevation: 3,
          }}>
            <Text style={{ fontSize: 14, color: Colors.textDark, lineHeight: 24 }}>
              {relatorio}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => { setRelatorio(null); setPerguntaAtual(0); setRespostas({}) }}
            style={{
              backgroundColor: Colors.white, borderRadius: 16, padding: 16,
              alignItems: 'center', borderWidth: 1.5, borderColor: Colors.primary,
            }}
          >
            <Text style={{ color: Colors.primary, fontSize: 15, fontWeight: '700' }}>
              🔄 Nova análise
            </Text>
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
