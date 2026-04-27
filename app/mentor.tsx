import React, { useState, useRef, useEffect } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Animated, Alert, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import * as FileSystem from 'expo-file-system/legacy'
import * as MediaLibrary from 'expo-media-library'
import { Colors } from '../constants/colors'
import { useAuthStore } from '../stores/useAuthStore'
import { supabase } from '../lib/supabase'
import {
  QuestionarioRespostas,
  coletarContextoFinanceiro,
  gerarRelatorioMentor,
  getMesesParaAnalisar,
} from '../lib/mentor-financeiro'
import { gerarPDF, compartilharPDF } from '../lib/gerar-pdf'
import { useCycleStore } from '../stores/useCycleStore'
import AIProviderSelector from '../components/AIProviderSelector'

// ── Types ────────────────────────────────────────────────────────────────────

type PerguntaOpcao = { key: string; label: string }
type Pergunta = {
  id: string
  titulo: string
  emoji: string
  opcoes: PerguntaOpcao[]
  dinamico?: boolean
  placeholder: string
}

// ── Perguntas ─────────────────────────────────────────────────────────────────

const PERGUNTAS_BASE: Pergunta[] = [
  {
    id: 'objetivo',
    titulo: 'Qual seu objetivo\nprincipal agora?',
    emoji: '🎯',
    opcoes: [
      { key: 'meta', label: '🎯 Realizar uma meta específica' },
      { key: 'economizar', label: '💰 Economizar mais todo mês' },
      { key: 'negativo', label: '📉 Sair do saldo negativo' },
      { key: 'organizar', label: '🔄 Organizar melhor meus gastos' },
      { key: 'dividas', label: '💳 Quitar dívidas' },
    ],
    placeholder: 'Ou descreva seu objetivo...',
  },
  {
    id: 'dificuldade',
    titulo: 'Onde você tem mais\ndificuldade?',
    emoji: '😓',
    opcoes: [
      { key: 'alimentacao', label: '🍔 Alimentação fora de casa' },
      { key: 'impulso', label: '📱 Compras por impulso' },
      { key: 'lazer', label: '🎬 Lazer e entretenimento' },
      { key: 'assinaturas', label: '📦 Assinaturas e serviços' },
      { key: 'identificar', label: '🤷 Me ajude a identificar' },
    ],
    placeholder: 'Ou descreva sua dificuldade...',
  },
  {
    id: 'metaPrincipal',
    titulo: 'Qual meta é mais\nimportante para você?',
    emoji: '⭐',
    opcoes: [],
    dinamico: true,
    placeholder: 'Descreva sua meta principal...',
  },
  {
    id: 'prazo',
    titulo: 'Qual seu prazo para\natingir o objetivo?',
    emoji: '📅',
    opcoes: [
      { key: '3meses', label: '⚡ 3 meses' },
      { key: '6meses', label: '📅 6 meses' },
      { key: '1ano', label: '🗓️ 1 ano' },
      { key: 'mais1ano', label: '🔭 Mais de 1 ano' },
    ],
    placeholder: 'Ou especifique o prazo...',
  },
  {
    id: 'tom',
    titulo: 'Como prefere receber\nos conselhos?',
    emoji: '💬',
    opcoes: [
      { key: 'direto', label: '🎯 Direto e objetivo' },
      { key: 'detalhado', label: '📊 Detalhado com números' },
      { key: 'motivador', label: '💪 Motivador e encorajador' },
    ],
    placeholder: 'Ou descreva como prefere...',
  },
  {
    id: 'periodo',
    titulo: 'Qual período\ndeseja analisar?',
    emoji: '📅',
    opcoes: [
      { key: '1mes', label: '📆 Último mês' },
      { key: '3meses', label: '📅 Últimos 3 meses' },
      { key: '6meses', label: '🗓️ Últimos 6 meses' },
      { key: 'tudo', label: '📚 Todo o histórico disponível' },
    ],
    placeholder: 'Ou especifique o período...',
  },
]

type Step = 'intro' | 'quiz' | 'generating' | 'result' | 'error'

// ── Screen ────────────────────────────────────────────────────────────────────

export default function MentorScreen() {
  const insets = useSafeAreaInsets()
  const { user } = useAuthStore()
  const { aiProvider, setAiProvider } = useCycleStore()

  const [step, setStep] = useState<Step>('intro')
  const [currentQ, setCurrentQ] = useState(0)
  const [selectedOpcoes, setSelectedOpcoes] = useState<Record<string, string>>({})
  const [comentarios, setComentarios] = useState<Record<string, string>>({})
  const [metas, setMetas] = useState<PerguntaOpcao[]>([])
  const [relatorio, setRelatorio] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [pdfUri, setPdfUri] = useState<string | null>(null)
  const [sharingPdf, setSharingPdf] = useState(false)
  const [savingPdf, setSavingPdf] = useState(false)

  const fadeAnim = useRef(new Animated.Value(1)).current

  // Load user goals for the metaPrincipal question
  useEffect(() => {
    if (!user) return
    supabase.from('goals').select('id, name').eq('user_id', user.id)
      .then(({ data }) => {
        if (data && data.length > 0) {
          setMetas((data as any[]).map((g: any) => ({ key: g.id, label: `⭐ ${g.name}` })))
        }
      })
  }, [user?.id])

  // Inject dynamic metas into the metaPrincipal question
  const PERGUNTAS: Pergunta[] = PERGUNTAS_BASE.map(p =>
    p.dinamico ? { ...p, opcoes: metas } : p
  )

  const fadeTransition = (callback: () => void) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      callback()
      Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start()
    })
  }

  const handleProxima = () => {
    const pergunta = PERGUNTAS[currentQ]
    const opcaoSelecionada = selectedOpcoes[pergunta.id] ?? ''
    const comentario = (comentarios[pergunta.id] ?? '').trim()

    if (!opcaoSelecionada && !comentario) {
      Alert.alert('Responda a pergunta', 'Selecione uma opção ou escreva um comentário para continuar.')
      return
    }

    if (currentQ < PERGUNTAS.length - 1) {
      fadeTransition(() => setCurrentQ(q => q + 1))
    } else {
      const buildField = (id: string) => ({
        opcao: selectedOpcoes[id] ?? null,
        comentario: (comentarios[id] ?? '').trim(),
      })
      const r: QuestionarioRespostas = {
        objetivo: buildField('objetivo'),
        dificuldade: buildField('dificuldade'),
        metaPrincipal: buildField('metaPrincipal'),
        prazo: buildField('prazo'),
        tom: buildField('tom'),
        periodo: buildField('periodo'),
      }
      gerarRelatorio(r)
    }
  }

  const gerarRelatorio = async (r: QuestionarioRespostas) => {
    setStep('generating')
    try {
      const maxMeses = getMesesParaAnalisar(r.periodo.opcao)
      const ctx = await coletarContextoFinanceiro(user!.id, user!.cycle_start ?? 1, maxMeses)
      const texto = await gerarRelatorioMentor(r, ctx, aiProvider)
      setRelatorio(texto)

      try {
        const uri = await gerarPDF(texto, user?.name ?? 'Usuário')
        setPdfUri(uri)
      } catch {
        // PDF failure is non-fatal
      }

      setStep('result')
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Erro ao gerar relatório')
      setStep('error')
    }
  }

  const handleCompartilharPDF = async () => {
    if (!pdfUri) return
    setSharingPdf(true)
    try {
      await compartilharPDF(pdfUri)
    } catch (e: any) {
      Alert.alert('Erro', e?.message ?? 'Não foi possível compartilhar o PDF.')
    } finally {
      setSharingPdf(false)
    }
  }

  const handleSalvarPDF = async () => {
    if (!pdfUri) return
    setSavingPdf(true)
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert(
          'Permissão necessária',
          'Precisamos de permissão para salvar o PDF na pasta Downloads.',
          [{ text: 'OK' }]
        )
        return
      }

      const dataHoje = new Date().toISOString().split('T')[0]
      const nomeArquivo = `SnapGestao_Mentor_${dataHoje}.pdf`
      const tempUri = FileSystem.cacheDirectory + nomeArquivo

      await FileSystem.copyAsync({ from: pdfUri, to: tempUri })

      const asset = await MediaLibrary.createAssetAsync(tempUri)
      await MediaLibrary.createAlbumAsync('Download', asset, false)

      await FileSystem.deleteAsync(tempUri, { idempotent: true })

      Alert.alert(
        '✅ PDF salvo!',
        `O arquivo "${nomeArquivo}" foi salvo na pasta Downloads do seu celular.`,
        [{ text: 'OK' }]
      )
    } catch (err: any) {
      console.error('Erro ao salvar PDF:', err)
      Alert.alert(
        'Erro ao salvar',
        'Não foi possível salvar o PDF.\nTente usar "Compartilhar PDF" e salvar manualmente.',
        [{ text: 'OK' }]
      )
    } finally {
      setSavingPdf(false)
    }
  }

  // ── INTRO ─────────────────────────────────────────────────────────────────

  if (step === 'intro') {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.backBtn}>← Voltar</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.introScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.introBadge}>
            <Text style={styles.introBadgeIcon}>🤖</Text>
          </View>
          <Text style={styles.introTitle}>Mentor Financeiro</Text>
          <Text style={styles.introSub}>
            Análise personalizada da sua saúde financeira com inteligência artificial, baseada nos seus dados reais do SnapGestão.
          </Text>

          <View style={styles.featureList}>
            {[
              { icon: '📊', text: 'Diagnóstico baseado nos seus dados reais' },
              { icon: '💡', text: 'Plano de ação com 5 recomendações práticas' },
              { icon: '🎯', text: 'Meta concreta para os próximos 90 dias' },
              { icon: '📄', text: 'Relatório em PDF para compartilhar' },
            ].map((f, i) => (
              <View key={i} style={styles.featureItem}>
                <Text style={styles.featureIcon}>{f.icon}</Text>
                <Text style={styles.featureText}>{f.text}</Text>
              </View>
            ))}
          </View>

          <View style={styles.disclaimer}>
            <Text style={styles.disclaimerText}>
              Responda 6 perguntas rápidas e a IA vai gerar seu relatório personalizado em segundos.
            </Text>
          </View>

          <View style={{
            backgroundColor: Colors.white, borderRadius: 16,
            padding: 16, marginBottom: 16,
            borderWidth: 1, borderColor: Colors.border,
          }}>
            <AIProviderSelector selected={aiProvider} onSelect={setAiProvider} />
          </View>
        </ScrollView>

        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => setStep('quiz')}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryBtnText}>Começar análise →</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  // ── QUIZ ──────────────────────────────────────────────────────────────────

  if (step === 'quiz') {
    const pergunta = PERGUNTAS[currentQ]
    const progress = ((currentQ) / PERGUNTAS.length) * 100
    const opcaoAtual = selectedOpcoes[pergunta.id] ?? ''
    const comentarioAtual = comentarios[pergunta.id] ?? ''
    const podeAvancar = !!opcaoAtual || comentarioAtual.trim().length > 0
    const isLast = currentQ === PERGUNTAS.length - 1

    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              if (currentQ > 0) fadeTransition(() => setCurrentQ(q => q - 1))
              else setStep('intro')
            }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.backBtn}>← Voltar</Text>
          </TouchableOpacity>
          <Text style={styles.progressLabel}>{currentQ + 1} de {PERGUNTAS.length}</Text>
        </View>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress + 20}%` }]} />
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <ScrollView
            contentContainerStyle={styles.quizScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Animated.View style={{ opacity: fadeAnim }}>
              <Text style={styles.questionEmoji}>{pergunta.emoji}</Text>
              <Text style={styles.questionText}>{pergunta.titulo}</Text>

              {/* Options */}
              {pergunta.opcoes.length > 0 && (
                <View style={styles.optionsGrid}>
                  {pergunta.opcoes.map(op => {
                    const active = opcaoAtual === op.key
                    return (
                      <TouchableOpacity
                        key={op.key}
                        style={[styles.optionCard, active && styles.optionCardActive]}
                        onPress={() => setSelectedOpcoes(prev => ({ ...prev, [pergunta.id]: op.key }))}
                        activeOpacity={0.75}
                      >
                        <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>
                          {op.label}
                        </Text>
                        {active && <Text style={styles.optionCheck}>✓</Text>}
                      </TouchableOpacity>
                    )
                  })}
                </View>
              )}

              {/* Free text */}
              <View style={styles.comentarioWrap}>
                <Text style={styles.comentarioLabel}>
                  💬 {pergunta.opcoes.length === 0 ? pergunta.placeholder : 'Adicionar comentário (opcional):'}
                </Text>
                <TextInput
                  value={comentarioAtual}
                  onChangeText={(text) => setComentarios(prev => ({ ...prev, [pergunta.id]: text }))}
                  placeholder={pergunta.opcoes.length === 0 ? 'Descreva sua meta principal...' : pergunta.placeholder}
                  placeholderTextColor={Colors.textMuted}
                  multiline
                  numberOfLines={3}
                  style={styles.comentarioInput}
                  textAlignVertical="top"
                />
              </View>
            </Animated.View>
          </ScrollView>

          <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <TouchableOpacity
              style={[styles.primaryBtn, !podeAvancar && styles.btnDisabled]}
              onPress={handleProxima}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>
                {isLast ? 'Gerar relatório 🚀' : 'Próxima →'}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    )
  }

  // ── GENERATING ───────────────────────────────────────────────────────────

  if (step === 'generating') {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.generatingContainer}>
          <Text style={styles.generatingEmoji}>🤖</Text>
          <Text style={styles.generatingTitle}>Analisando seus dados...</Text>
          <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 20 }} />
          <Text style={styles.generatingHint}>
            A IA está lendo seus potes, transações e metas para criar um relatório personalizado.
          </Text>
          <Text style={styles.generatingHint2}>Isso leva alguns segundos ⏱️</Text>
        </View>
      </SafeAreaView>
    )
  }

  // ── ERROR ─────────────────────────────────────────────────────────────────

  if (step === 'error') {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.backBtn}>← Voltar</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorEmoji}>⚠️</Text>
          <Text style={styles.errorTitle}>Não foi possível gerar o relatório</Text>
          <Text style={styles.errorMsg}>{errorMsg}</Text>
          <TouchableOpacity
            style={[styles.primaryBtn, { marginTop: 24 }]}
            onPress={() => { setStep('quiz'); setCurrentQ(0); setSelectedOpcoes({}); setComentarios({}) }}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryBtnText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  // ── RESULT ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.resultHeader}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.resultBackBtn}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.resultHeaderTitle}>Seu Relatório</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.resultScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.resultBadge}>
          <Text style={styles.resultBadgeText}>🤖 Análise concluída</Text>
        </View>

        <View style={styles.relatorioCard}>
          <Text style={styles.relatorioText}>{relatorio}</Text>
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {pdfUri ? (
          <>
            {/* Salvar PDF */}
            <TouchableOpacity
              style={styles.salvarBtn}
              onPress={handleSalvarPDF}
              disabled={savingPdf}
              activeOpacity={0.85}
            >
              {savingPdf
                ? <ActivityIndicator color={Colors.accent} />
                : (
                  <>
                    <Text style={styles.salvarBtnIcon}>💾</Text>
                    <Text style={styles.salvarBtnText}>Salvar PDF</Text>
                  </>
                )
              }
            </TouchableOpacity>

            {/* Compartilhar PDF */}
            <TouchableOpacity
              style={[styles.primaryBtn, sharingPdf && styles.btnDisabled, { marginTop: 10 }]}
              onPress={handleCompartilharPDF}
              disabled={sharingPdf}
              activeOpacity={0.85}
            >
              {sharingPdf
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.primaryBtnText}>📄 Compartilhar PDF</Text>
              }
            </TouchableOpacity>

            {/* Nova análise */}
            <TouchableOpacity
              style={[styles.secondaryBtn, { marginTop: 10 }]}
              onPress={() => { setStep('quiz'); setCurrentQ(0); setSelectedOpcoes({}); setComentarios({}) }}
              activeOpacity={0.85}
            >
              <Text style={styles.secondaryBtnText}>🔄 Nova análise</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={[styles.primaryBtn, styles.btnSecondary]}
            onPress={() => { setStep('quiz'); setCurrentQ(0); setSelectedOpcoes({}); setComentarios({}) }}
            activeOpacity={0.85}
          >
            <Text style={[styles.primaryBtnText, { color: Colors.primary }]}>🔄 Nova análise</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.white,
  },
  backBtn: { fontSize: 15, color: Colors.primary, fontWeight: '600' },
  progressLabel: { fontSize: 13, color: Colors.textMuted, fontWeight: '600' },

  progressTrack: { height: 4, backgroundColor: Colors.border },
  progressFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 2 },

  // INTRO
  introScroll: { padding: 28, paddingTop: 32 },
  introBadge: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: Colors.lightBlue,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 24,
    borderWidth: 1, borderColor: Colors.border,
  },
  introBadgeIcon: { fontSize: 38 },
  introTitle: { fontSize: 28, fontWeight: '800', color: Colors.textDark, marginBottom: 12, letterSpacing: -0.4 },
  introSub: { fontSize: 15, color: Colors.textMuted, lineHeight: 23, marginBottom: 28 },
  featureList: { gap: 12, marginBottom: 28 },
  featureItem: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.white, padding: 14, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  featureIcon: { fontSize: 22 },
  featureText: { fontSize: 14, color: Colors.textDark, fontWeight: '500', flex: 1 },
  disclaimer: {
    backgroundColor: '#FFF9EC', borderRadius: 12,
    borderWidth: 1, borderColor: '#FBBF24',
    padding: 14, marginBottom: 8,
  },
  disclaimerText: { fontSize: 13, color: '#92400E', lineHeight: 19 },

  // QUIZ
  quizScroll: { padding: 24, paddingTop: 28, paddingBottom: 16 },
  questionEmoji: { fontSize: 44, textAlign: 'center', marginBottom: 12 },
  questionText: { fontSize: 22, fontWeight: '800', color: Colors.textDark, textAlign: 'center', lineHeight: 30, marginBottom: 24 },
  optionsGrid: { gap: 10, marginBottom: 20 },
  optionCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.white, padding: 16, borderRadius: 14,
    borderWidth: 1.5, borderColor: Colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  optionCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.lightBlue,
  },
  optionLabel: { fontSize: 15, fontWeight: '600', color: Colors.textDark, flex: 1 },
  optionLabelActive: { color: Colors.primary },
  optionCheck: { fontSize: 16, color: Colors.primary, fontWeight: '700', marginLeft: 8 },

  // Free text
  comentarioWrap: { marginTop: 4 },
  comentarioLabel: { fontSize: 12, color: Colors.textMuted, marginBottom: 8 },
  comentarioInput: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    color: Colors.textDark,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 80,
    textAlignVertical: 'top',
  },

  // GENERATING
  generatingContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40,
  },
  generatingEmoji: { fontSize: 56, marginBottom: 20 },
  generatingTitle: { fontSize: 22, fontWeight: '800', color: Colors.textDark, textAlign: 'center', marginBottom: 8 },
  generatingHint: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 21, marginTop: 20, paddingHorizontal: 20 },
  generatingHint2: { fontSize: 13, color: Colors.textMuted, marginTop: 8 },

  // ERROR
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  errorEmoji: { fontSize: 48, marginBottom: 16 },
  errorTitle: { fontSize: 20, fontWeight: '700', color: Colors.textDark, textAlign: 'center', marginBottom: 8 },
  errorMsg: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 19 },

  // RESULT
  resultHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: Colors.primary,
  },
  resultBackBtn: { fontSize: 18, color: '#fff', fontWeight: '600' },
  resultHeaderTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  resultScroll: { padding: 20 },
  resultBadge: {
    backgroundColor: Colors.lightBlue, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 8,
    alignSelf: 'flex-start', marginBottom: 16,
    borderWidth: 1, borderColor: Colors.border,
  },
  resultBadgeText: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  relatorioCard: {
    backgroundColor: Colors.white, borderRadius: 16,
    padding: 20, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  relatorioText: { fontSize: 14, color: Colors.textDark, lineHeight: 23 },

  // Salvar PDF
  salvarBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.white,
    borderRadius: 14, paddingVertical: 14,
    borderWidth: 1.5, borderColor: Colors.accent,
  },
  salvarBtnIcon: { fontSize: 18 },
  salvarBtnText: { fontSize: 15, fontWeight: '700', color: Colors.accent },

  // SHARED
  bottomBar: {
    paddingHorizontal: 24, paddingTop: 12,
    backgroundColor: Colors.white,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  primaryBtn: {
    backgroundColor: Colors.primary, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  btnSecondary: {
    backgroundColor: Colors.lightBlue,
    shadowOpacity: 0, elevation: 0,
    borderWidth: 1.5, borderColor: Colors.border,
  },
  btnDisabled: { opacity: 0.45 },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#fff', letterSpacing: 0.3 },
  secondaryBtn: {
    borderRadius: 14, paddingVertical: 13, alignItems: 'center',
    borderWidth: 1.5, borderColor: Colors.border,
  },
  secondaryBtnText: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
})
