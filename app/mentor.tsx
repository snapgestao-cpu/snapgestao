import React, { useState, useRef } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Animated, Alert, Platform,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Colors } from '../constants/colors'
import { useAuthStore } from '../stores/useAuthStore'
import {
  QuestionarioRespostas,
  coletarContextoFinanceiro,
  gerarRelatorioMentor,
} from '../lib/mentor-financeiro'
import { gerarPDF, compartilharPDF } from '../lib/gerar-pdf'

// ── Quiz questions ──────────────────────────────────────────────────────────

type Pergunta = {
  id: keyof QuestionarioRespostas
  texto: string
  emoji: string
  opcoes: { valor: string; label: string; emoji: string }[]
}

const PERGUNTAS: Pergunta[] = [
  {
    id: 'objetivo',
    texto: 'Qual é seu principal objetivo financeiro agora?',
    emoji: '🎯',
    opcoes: [
      { valor: 'economizar', label: 'Economizar mais', emoji: '🐷' },
      { valor: 'quitar_dividas', label: 'Quitar dívidas', emoji: '⛓' },
      { valor: 'investir', label: 'Começar a investir', emoji: '📈' },
      { valor: 'controlar', label: 'Ter controle total', emoji: '🧭' },
    ],
  },
  {
    id: 'rendaMensal',
    texto: 'Qual é sua faixa de renda mensal?',
    emoji: '💰',
    opcoes: [
      { valor: 'ate_3k', label: 'Até R$ 3.000', emoji: '🌱' },
      { valor: '3k_7k', label: 'R$ 3k – R$ 7k', emoji: '🌿' },
      { valor: '7k_15k', label: 'R$ 7k – R$ 15k', emoji: '🌳' },
      { valor: 'acima_15k', label: 'Acima de R$ 15k', emoji: '🚀' },
    ],
  },
  {
    id: 'maiorDesafio',
    texto: 'Qual é seu maior desafio financeiro?',
    emoji: '⚡',
    opcoes: [
      { valor: 'impulso', label: 'Gastos por impulso', emoji: '🛍️' },
      { valor: 'fixos_altos', label: 'Gastos fixos altos', emoji: '🏠' },
      { valor: 'sem_reserva', label: 'Falta de reserva', emoji: '🆘' },
      { valor: 'dividas', label: 'Dívidas acumuladas', emoji: '😰' },
    ],
  },
  {
    id: 'temReserva',
    texto: 'Você tem reserva de emergência?',
    emoji: '🛡️',
    opcoes: [
      { valor: 'sim', label: 'Sim, tenho!', emoji: '✅' },
      { valor: 'pouco', label: 'Pouco (< 3 meses)', emoji: '⚠️' },
      { valor: 'nao', label: 'Ainda não', emoji: '❌' },
    ],
  },
  {
    id: 'prioridade',
    texto: 'O que é mais importante para você?',
    emoji: '✨',
    opcoes: [
      { valor: 'seguranca', label: 'Segurança financeira', emoji: '🔒' },
      { valor: 'qualidade_vida', label: 'Qualidade de vida', emoji: '🌴' },
      { valor: 'patrimonio', label: 'Construir patrimônio', emoji: '🏗️' },
      { valor: 'liberdade', label: 'Liberdade financeira', emoji: '🕊️' },
    ],
  },
]

type Step = 'intro' | 'quiz' | 'generating' | 'result' | 'error'

export default function MentorScreen() {
  const insets = useSafeAreaInsets()
  const { user } = useAuthStore()

  const [step, setStep] = useState<Step>('intro')
  const [currentQ, setCurrentQ] = useState(0)
  const [respostas, setRespostas] = useState<Partial<QuestionarioRespostas>>({})
  const [relatorio, setRelatorio] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [pdfUri, setPdfUri] = useState<string | null>(null)
  const [sharingPdf, setSharingPdf] = useState(false)

  const fadeAnim = useRef(new Animated.Value(1)).current

  const fadeTransition = (callback: () => void) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      callback()
      Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start()
    })
  }

  const handleOpcao = (valor: string) => {
    const pergunta = PERGUNTAS[currentQ]
    const novas = { ...respostas, [pergunta.id]: valor }
    setRespostas(novas)

    if (currentQ < PERGUNTAS.length - 1) {
      fadeTransition(() => setCurrentQ(q => q + 1))
    } else {
      // Last question — generate report
      gerarRelatorio(novas as QuestionarioRespostas)
    }
  }

  const gerarRelatorio = async (r: QuestionarioRespostas) => {
    setStep('generating')
    try {
      const ctx = await coletarContextoFinanceiro(user!.id, user!.cycle_start ?? 1)
      const texto = await gerarRelatorioMentor(r, ctx)
      setRelatorio(texto)

      // Generate PDF in background
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
              Responda 5 perguntas rápidas e a IA vai gerar seu relatório personalizado em segundos.
            </Text>
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

        <Animated.View style={[styles.quizBody, { opacity: fadeAnim }]}>
          <Text style={styles.questionEmoji}>{pergunta.emoji}</Text>
          <Text style={styles.questionText}>{pergunta.texto}</Text>

          <View style={styles.optionsGrid}>
            {pergunta.opcoes.map(op => (
              <TouchableOpacity
                key={op.valor}
                style={styles.optionCard}
                onPress={() => handleOpcao(op.valor)}
                activeOpacity={0.75}
              >
                <Text style={styles.optionEmoji}>{op.emoji}</Text>
                <Text style={styles.optionLabel}>{op.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>
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
            onPress={() => { setStep('quiz'); setCurrentQ(0); setRespostas({}) }}
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
          <TouchableOpacity
            style={[styles.primaryBtn, sharingPdf && styles.btnDisabled]}
            onPress={handleCompartilharPDF}
            disabled={sharingPdf}
            activeOpacity={0.85}
          >
            {sharingPdf
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.primaryBtnText}>📄 Compartilhar PDF</Text>
            }
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.primaryBtn, styles.btnSecondary]}
            onPress={() => { setStep('quiz'); setCurrentQ(0); setRespostas({}) }}
            activeOpacity={0.85}
          >
            <Text style={[styles.primaryBtnText, { color: Colors.primary }]}>🔄 Nova análise</Text>
          </TouchableOpacity>
        )}
        {pdfUri && (
          <TouchableOpacity
            style={[styles.secondaryBtn, { marginTop: 10 }]}
            onPress={() => { setStep('quiz'); setCurrentQ(0); setRespostas({}) }}
            activeOpacity={0.85}
          >
            <Text style={styles.secondaryBtnText}>🔄 Nova análise</Text>
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
  quizBody: { flex: 1, paddingHorizontal: 24, paddingTop: 36 },
  questionEmoji: { fontSize: 44, textAlign: 'center', marginBottom: 16 },
  questionText: { fontSize: 20, fontWeight: '700', color: Colors.textDark, textAlign: 'center', lineHeight: 28, marginBottom: 32 },
  optionsGrid: { gap: 12 },
  optionCard: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    backgroundColor: Colors.white, padding: 18, borderRadius: 14,
    borderWidth: 1.5, borderColor: Colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  optionEmoji: { fontSize: 24 },
  optionLabel: { fontSize: 15, fontWeight: '600', color: Colors.textDark, flex: 1 },

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
    shadowOpacity: 0,
    elevation: 0,
    borderWidth: 1.5, borderColor: Colors.border,
  },
  btnDisabled: { opacity: 0.65 },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#fff', letterSpacing: 0.3 },
  secondaryBtn: {
    borderRadius: 14, paddingVertical: 13, alignItems: 'center',
    borderWidth: 1.5, borderColor: Colors.border,
  },
  secondaryBtnText: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
})
