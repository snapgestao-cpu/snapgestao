import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Colors } from '../../constants/colors'
import { useAuthStore } from '../../stores/useAuthStore'
import { supabase } from '../../lib/supabase'
import { onboardingDraft, formatCents, digitsOnly, centsToFloat } from '../../lib/onboardingDraft'
import { PotCard } from '../../components/PotCard'

const POT_COLORS = [
  '#0F5EA8', // Azul primário
  '#1D9E75', // Verde
  '#E24B4A', // Vermelho
  '#BA7517', // Âmbar
  '#534AB7', // Roxo
  '#D4537E', // Rosa
  '#0891B2', // Ciano
  '#059669', // Esmeralda
  '#DC6803', // Laranja
  '#7C3AED', // Violeta
  '#DB2777', // Pink
  '#374151', // Grafite
]

const SUGGESTIONS = ['Alimentação', 'Moradia', 'Transporte', 'Saúde', 'Lazer', 'Educação']

// Ícone de pote/balde feito com Views
function PotIcon() {
  return (
    <View style={iconStyles.potWrap}>
      <View style={iconStyles.potOpening} />
      <View style={iconStyles.potBody}>
        <View style={iconStyles.potCoin} />
      </View>
    </View>
  )
}

export default function Step3() {
  const insets = useSafeAreaInsets()
  const { setUser } = useAuthStore()

  const [potName, setPotName] = useState('')
  const [limitDigits, setLimitDigits] = useState('')
  const [selectedColor, setSelectedColor] = useState(POT_COLORS[0])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSuggestion = (name: string) => {
    setPotName(name)
    if (error) setError(null)
  }

  const handleFinish = async () => {
    if (!potName.trim()) {
      setError('Dê um nome ao seu primeiro pote.')
      return
    }
    if (loading) return

    setError(null)
    setLoading(true)

    try {
      const draft = onboardingDraft.get()

      // Usar sessão já carregada — evita chamada de rede extra
      const { session } = useAuthStore.getState()
      const userId = session?.user?.id
      if (!userId) {
        setError('Sessão inválida. Faça login novamente.')
        return
      }
      const userName = session.user.user_metadata?.name ?? 'Usuário'

      // 1. Upsert do perfil do usuário
      const { data: savedUser, error: userError } = await supabase
        .from('users')
        .upsert({
          id: userId,
          name: userName,
          currency: draft.currency,
          cycle_start: draft.cycleStart,
          initial_balance: draft.balance,
        })
        .select()
        .single()

      if (userError) {
        console.error('Erro ao salvar user:', userError)
        setError('Erro ao salvar perfil: ' + userError.message)
        return
      }

      // 2. Inserir fontes de receita (se houver)
      if (draft.incomeSources.length > 0) {
        const { error: incomeError } = await supabase
          .from('income_sources')
          .insert(draft.incomeSources.map((s) => ({
            user_id: userId,
            name: s.name,
            type: s.type,
            amount: s.amount,
            recurrence_day: s.recurrence_day,
            is_primary: s.is_primary,
          })))
        if (incomeError) {
          console.error('Erro ao salvar income_sources:', incomeError)
          setError('Erro ao salvar receitas: ' + incomeError.message)
          return
        }
      }

      // 3. Inserir o pote
      const limitAmount = centsToFloat(limitDigits)
      const { error: potError } = await supabase.from('pots').insert({
        user_id: userId,
        name: potName.trim(),
        color: selectedColor,
        limit_amount: limitAmount > 0 ? limitAmount : null,
        limit_type: 'absolute',
        is_emergency: false,
      })
      if (potError) {
        console.error('Erro ao salvar pote:', potError)
        setError('Erro ao criar pote: ' + potError.message)
        return
      }

      // 4. Atualizar store → guard do _layout reconhece onboarding completo
      if (savedUser) setUser(savedUser)

      // 5. Limpar draft e navegar
      onboardingDraft.clear()
      router.replace('/(tabs)/')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Barra de progresso */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: '100%' }]} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
          {/* Ícone da etapa */}
          <View style={styles.iconWrap}>
            <PotIcon />
          </View>

          <Text style={styles.stepLabel}>Passo 3 de 3</Text>
          <Text style={styles.title}>Crie seu primeiro pote</Text>
          <Text style={styles.subtitle}>
            Potes são categorias de orçamento com limite mensal definido.
          </Text>

          {/* Sugestões rápidas */}
          <Text style={styles.label}>Sugestões rápidas</Text>
          <View style={styles.suggestionsGrid}>
            {SUGGESTIONS.map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.suggestion, potName === s && styles.suggestionActive]}
                onPress={() => handleSuggestion(s)}
                activeOpacity={0.75}
              >
                <Text style={[styles.suggestionText, potName === s && styles.suggestionTextActive]}>
                  {s}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Nome do pote */}
          <Text style={styles.label}>Nome do pote</Text>
          <TextInput
            style={styles.input}
            placeholder="Ex: Alimentação"
            placeholderTextColor={Colors.textMuted}
            value={potName}
            onChangeText={(t) => { setPotName(t); if (error) setError(null) }}
            returnKeyType="next"
          />

          {/* Limite mensal */}
          <Text style={styles.label}>Limite mensal</Text>
          <TextInput
            style={styles.input}
            placeholder="R$ 0,00 (opcional)"
            placeholderTextColor={Colors.textMuted}
            value={formatCents(limitDigits)}
            onChangeText={(t) => setLimitDigits(digitsOnly(t))}
            keyboardType="numeric"
            returnKeyType="done"
          />

          {/* Seletor de cor */}
          <Text style={styles.label}>Cor</Text>
          <View style={styles.colorGrid}>
            {POT_COLORS.map((color) => (
              <TouchableOpacity
                key={color}
                style={[
                  styles.colorCircle,
                  { backgroundColor: color },
                  selectedColor === color && styles.colorCircleActive,
                ]}
                onPress={() => setSelectedColor(color)}
                activeOpacity={0.8}
              >
                {selectedColor === color && <View style={styles.colorCheck} />}
              </TouchableOpacity>
            ))}
          </View>

          {/* Preview em tempo real */}
          <Text style={styles.label}>Preview</Text>
          <PotCard
            name={potName.trim() || 'Novo pote'}
            color={selectedColor}
            limit_amount={centsToFloat(limitDigits)}
            spent={0}
            remaining={centsToFloat(limitDigits)}
          />

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠ {error}</Text>
            </View>
          )}
      </ScrollView>

      {/* Botão fixo no rodapé */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={handleFinish}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.btnText}>Criar pote e começar 🚀</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const iconStyles = StyleSheet.create({
  potWrap: { width: 40, height: 42, alignItems: 'center' },
  potOpening: {
    width: 36,
    height: 8,
    backgroundColor: Colors.primaryDark,
    borderRadius: 4,
    marginBottom: 2,
  },
  potBody: {
    width: 40,
    height: 32,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  potCoin: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.accent,
  },
})

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  progressTrack: { height: 4, backgroundColor: Colors.border },
  progressFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 2 },

  scroll: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 32, paddingBottom: 16 },

  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: Colors.lightBlue,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  stepLabel: { fontSize: 13, color: Colors.textMuted, marginBottom: 8 },
  title: { fontSize: 26, fontWeight: '800', color: Colors.textDark, marginBottom: 10, letterSpacing: -0.3 },
  subtitle: { fontSize: 15, color: Colors.textMuted, lineHeight: 22, marginBottom: 28 },

  label: { fontSize: 13, fontWeight: '600', color: Colors.textDark, marginBottom: 8, marginTop: 4 },

  // Sugestões
  suggestionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  suggestion: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  suggestionActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.lightBlue,
  },
  suggestionText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  suggestionTextActive: { color: Colors.primary },

  input: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: Colors.textDark,
    marginBottom: 20,
  },

  // Cores
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  colorCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  colorCircleActive: {
    borderWidth: 3,
    borderColor: Colors.white,
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 6,
  },
  colorCheck: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: Colors.white,
  },

  // Erro
  errorBox: {
    backgroundColor: Colors.lightRed,
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: Colors.danger,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
  },
  errorText: { fontSize: 13, color: Colors.danger, fontWeight: '500' },

  // Botão rodapé
  bottomBar: {
    paddingHorizontal: 28,
    paddingTop: 12,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  btn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  btnDisabled: { opacity: 0.7 },
  btnText: { color: Colors.white, fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
})
