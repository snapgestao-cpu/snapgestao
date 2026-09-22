/**
 * Tela "Fale com seu CFO" (Fase 3a) — chat de perguntas, SOMENTE LEITURA.
 * Sessão só em memória (estado do componente); sem persistência de histórico.
 * Provider por plano + limite diário próprio (ver lib/cfo-chat.ts).
 */
import React, { useState, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Colors } from '../constants/colors'
import { useAuthStore } from '../stores/useAuthStore'
import { sendCfoMessage, dailyMessageLimit, ChatTurn } from '../lib/cfo-chat'

type Msg = ChatTurn | { role: 'system'; text: string }

const SUGGESTIONS = [
  'Quanto gastei este mês?',
  'Quais potes estão perto do limite?',
  'Onde está mais barato o arroz?',
]

export default function ChatScreen() {
  const insets = useSafeAreaInsets()
  const { user } = useAuthStore()
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<ScrollView>(null)

  const plan = user?.plan ?? 'free'
  const scrollToEnd = () => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80)

  const send = async (text: string) => {
    const question = text.trim()
    if (!question || loading || !user) return
    setInput('')

    // Histórico de conversa (só user/assistant) enviado à IA.
    const history: ChatTurn[] = [
      ...messages.filter((m): m is ChatTurn => m.role === 'user' || m.role === 'assistant'),
      { role: 'user', text: question },
    ]
    setMessages(prev => [...prev, { role: 'user', text: question }])
    setLoading(true)
    scrollToEnd()

    try {
      const { reply, limitReached } = await sendCfoMessage({
        userId: user.id,
        plan,
        cycleStart: user.cycle_start ?? 1,
        history,
      })
      if (limitReached) {
        setMessages(prev => [...prev, {
          role: 'system',
          text: `Você atingiu o limite de ${dailyMessageLimit(plan)} perguntas de hoje. Volte amanhã 🌙`,
        }])
      } else {
        setMessages(prev => [...prev, { role: 'assistant', text: reply }])
      }
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'system', text: 'Algo deu errado ao falar com a IA. Tente de novo em instantes.' }])
    } finally {
      setLoading(false)
      scrollToEnd()
    }
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.back}>‹ Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>💬 Fale com seu CFO</Text>
        <View style={{ width: 60 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 8}
      >
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 && (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🤖</Text>
              <Text style={styles.emptyTitle}>Pergunte sobre suas finanças</Text>
              <Text style={styles.emptyText}>
                Seu CFO pessoal responde com base nos seus dados (potes, lançamentos e a base de preços). Só leitura — ele não altera nada.
              </Text>
              <View style={{ gap: 8, marginTop: 16, alignSelf: 'stretch' }}>
                {SUGGESTIONS.map(s => (
                  <TouchableOpacity key={s} style={styles.suggestion} onPress={() => send(s)}>
                    <Text style={styles.suggestionText}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {messages.map((m, i) => {
            if (m.role === 'system') {
              return <View key={i} style={styles.systemBubble}><Text style={styles.systemText}>{m.text}</Text></View>
            }
            const isUser = m.role === 'user'
            return (
              <View key={i} style={[styles.row, { justifyContent: isUser ? 'flex-end' : 'flex-start' }]}>
                <View style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}>
                  <Text style={[styles.bubbleText, isUser && { color: '#fff' }]}>{m.text}</Text>
                </View>
              </View>
            )
          })}

          {loading && (
            <View style={[styles.row, { justifyContent: 'flex-start' }]}>
              <View style={[styles.bubble, styles.aiBubble, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                <ActivityIndicator color={Colors.primary} size="small" />
                <Text style={styles.bubbleText}>Pensando…</Text>
              </View>
            </View>
          )}
        </ScrollView>

        <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Pergunte ao seu CFO…"
            placeholderTextColor={Colors.textMuted}
            multiline
            editable={!loading}
            onSubmitEditing={() => send(input)}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (loading || !input.trim()) && { opacity: 0.4 }]}
            onPress={() => send(input)}
            disabled={loading || !input.trim()}
          >
            <Text style={styles.sendBtnText}>➤</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.white,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  back: { color: Colors.primary, fontSize: 15, fontWeight: '600', width: 60 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: Colors.textDark },
  list: { padding: 16, gap: 10, flexGrow: 1 },
  empty: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 8 },
  emptyEmoji: { fontSize: 44 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.textDark, marginTop: 10 },
  emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', marginTop: 6, lineHeight: 19 },
  suggestion: {
    backgroundColor: Colors.white, borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    paddingVertical: 12, paddingHorizontal: 14,
  },
  suggestionText: { fontSize: 14, color: Colors.primary, fontWeight: '600' },
  row: { flexDirection: 'row' },
  bubble: { maxWidth: '85%', borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14 },
  userBubble: { backgroundColor: Colors.primary, borderBottomRightRadius: 4 },
  aiBubble: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 14, color: Colors.textDark, lineHeight: 20 },
  systemBubble: {
    alignSelf: 'center', backgroundColor: Colors.lightBlue, borderRadius: 12,
    paddingVertical: 8, paddingHorizontal: 14, maxWidth: '90%',
  },
  systemText: { fontSize: 12, color: Colors.textDark, textAlign: 'center' },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 12, paddingTop: 8, backgroundColor: Colors.white,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  input: {
    flex: 1, maxHeight: 120, backgroundColor: Colors.background, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, color: Colors.textDark,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
})
