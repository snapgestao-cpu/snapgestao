import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Colors } from '../../constants/colors'
import { onboardingDraft, formatCents, digitsOnly, centsToFloat } from '../../lib/onboardingDraft'

const CURRENCIES = ['BRL', 'USD', 'EUR'] as const
type Currency = typeof CURRENCIES[number]

const CURRENCY_SYMBOL: Record<Currency, string> = { BRL: 'R$', USD: 'US$', EUR: '€' }

// Wallet icon made with Views
function WalletIcon() {
  return (
    <View style={iconStyles.wallet}>
      <View style={iconStyles.walletTop} />
      <View style={iconStyles.walletBody}>
        <View style={iconStyles.walletCircle} />
      </View>
    </View>
  )
}

export default function Step1() {
  const insets = useSafeAreaInsets()
  const [rawDigits, setRawDigits] = useState('')
  const [currency, setCurrency] = useState<Currency>('BRL')
  const [error, setError] = useState<string | null>(null)

  const displayValue = rawDigits
    ? formatCents(rawDigits).replace('R$', CURRENCY_SYMBOL[currency])
    : ''

  const handleChange = (text: string) => {
    const digits = digitsOnly(text)
    setRawDigits(digits)
    if (error) setError(null)
  }

  const handleContinue = () => {
    const value = centsToFloat(rawDigits)
    if (value <= 0) {
      setError('Informe um saldo inicial maior que zero.')
      return
    }
    onboardingDraft.set({ balance: value, currency })
    router.push('/onboarding/step2')
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Barra de progresso */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: '33%' }]} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
          {/* Ícone da etapa */}
          <View style={styles.iconWrap}>
            <WalletIcon />
          </View>

          <Text style={styles.stepLabel}>Passo 1 de 3</Text>
          <Text style={styles.title}>Qual é seu saldo inicial?</Text>
          <Text style={styles.subtitle}>
            É o valor que você tem disponível agora. Será o ponto de partida do seu controle.
          </Text>

          {/* Input de valor */}
          <TextInput
            style={styles.balanceInput}
            value={displayValue}
            onChangeText={handleChange}
            keyboardType="numeric"
            placeholder={`${CURRENCY_SYMBOL[currency]} 0,00`}
            placeholderTextColor={Colors.textMuted}
            textAlign="center"
            returnKeyType="done"
          />

          {error && <Text style={styles.error}>{error}</Text>}

          {/* Seletor de moeda */}
          <Text style={styles.label}>Moeda</Text>
          <View style={styles.currencyRow}>
            {CURRENCIES.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.currencyBtn, currency === c && styles.currencyBtnActive]}
                onPress={() => setCurrency(c)}
                activeOpacity={0.75}
              >
                <Text style={[styles.currencySymbol, currency === c && styles.currencySymbolActive]}>
                  {CURRENCY_SYMBOL[c]}
                </Text>
                <Text style={[styles.currencyCode, currency === c && styles.currencyCodeActive]}>
                  {c}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
      </ScrollView>

      {/* Botão fixo no rodapé */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity style={styles.btn} onPress={handleContinue} activeOpacity={0.85}>
          <Text style={styles.btnText}>Continuar</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const iconStyles = StyleSheet.create({
  wallet: { width: 48, height: 38, justifyContent: 'space-between' },
  walletTop: {
    height: 10,
    backgroundColor: Colors.primary,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  walletBody: {
    flex: 1,
    backgroundColor: Colors.primaryDark,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 8,
  },
  walletCircle: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.accent,
  },
})

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  progressTrack: {
    height: 4,
    backgroundColor: Colors.border,
    marginHorizontal: 0,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 2,
  },

  scroll: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 16,
  },

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
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.textDark,
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.textMuted,
    lineHeight: 22,
    marginBottom: 36,
  },

  balanceInput: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 18,
    fontSize: 32,
    fontWeight: '700',
    color: Colors.textDark,
    marginBottom: 8,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },

  error: {
    fontSize: 13,
    color: Colors.danger,
    marginBottom: 16,
    textAlign: 'center',
  },

  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textDark,
    marginBottom: 10,
    marginTop: 8,
  },

  currencyRow: { flexDirection: 'row', gap: 12 },
  currencyBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
    gap: 2,
  },
  currencyBtnActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.lightBlue,
  },
  currencySymbol: { fontSize: 16, fontWeight: '700', color: Colors.textMuted },
  currencySymbolActive: { color: Colors.primary },
  currencyCode: { fontSize: 11, color: Colors.textMuted, fontWeight: '500' },
  currencyCodeActive: { color: Colors.primary },

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
  btnText: { color: Colors.white, fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
})
