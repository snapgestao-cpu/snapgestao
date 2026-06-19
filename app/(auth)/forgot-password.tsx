import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native'
import { router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { Colors } from '../../constants/colors'

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleReset() {
    const trimmed = email.trim()
    if (!trimmed) { Alert.alert('Informe seu e-mail.'); return }
    if (!trimmed.includes('@')) { Alert.alert('Formato de e-mail inválido.'); return }

    setLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo:
          'https://snapgestao-cpu.github.io/snapgestao/reset-password.html',
      })
      if (error) throw error
      setSent(true)
    } catch (err) {
      Alert.alert('Erro', 'Não foi possível enviar o e-mail. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <View style={styles.centeredFlex}>
        <Text style={styles.bigEmoji}>📧</Text>
        <Text style={styles.sentTitle}>Solicitação enviada!</Text>
        <Text style={styles.sentBody}>
          Se o email{' '}
          <Text style={styles.emailHighlight}>{email.trim()}</Text>
          {' '}estiver cadastrado no SnapGestão, você receberá um link de redefinição de senha em breve.
        </Text>

        <View style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>⏱️ Não recebeu o email?</Text>
          <Text style={styles.tipItem}>• Aguarde até 10 minutos</Text>
          <Text style={styles.tipItem}>• Verifique a pasta de Spam ou Lixo Eletrônico</Text>
          <Text style={styles.tipItem}>• Certifique-se que o email digitado está correto</Text>
          <Text style={styles.tipItem}>• Se não chegar, tente novamente</Text>
        </View>

        <TouchableOpacity
          style={styles.btnRetry}
          onPress={() => setSent(false)}
          activeOpacity={0.85}
        >
          <Text style={styles.btnRetryText}>Tentar novamente</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.btnSecondary}
          onPress={() => router.replace('/(auth)/login')}
          activeOpacity={0.85}
        >
          <Text style={styles.btnSecondaryText}>Voltar para o login</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Esqueceu a senha?</Text>
        <Text style={styles.subtitle}>
          Digite seu e-mail e enviaremos um link para redefinir sua senha.
        </Text>

        <Text style={styles.label}>E-mail</Text>
        <TextInput
          style={styles.input}
          placeholder="seu@email.com"
          placeholderTextColor={Colors.textMuted}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          returnKeyType="done"
          onSubmitEditing={handleReset}
        />

        <TouchableOpacity
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={handleReset}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.btnText}>Enviar link de redefinição</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.btnSecondary}
          onPress={() => router.back()}
          activeOpacity={0.85}
        >
          <Text style={styles.btnSecondaryText}>Voltar para o login</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 48,
  },
  centeredFlex: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },

  title: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.textDark,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    lineHeight: 22,
    marginBottom: 32,
  },

  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textDark,
    marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: Colors.textDark,
    marginBottom: 24,
  },

  btn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  btnDisabled: { opacity: 0.7 },
  btnText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
  btnSecondary: {
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
    width: '100%',
  },
  btnSecondaryText: { color: Colors.primary, fontSize: 16, fontWeight: '700' },

  bigEmoji: { fontSize: 56, marginBottom: 16 },
  sentTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textDark,
    marginBottom: 12,
    textAlign: 'center',
  },
  sentBody: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  emailHighlight: { fontWeight: '700', color: Colors.primary },

  tipsCard: {
    backgroundColor: '#FFF8E1',
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
    gap: 8,
    width: '100%',
  },
  tipsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 4,
  },
  tipItem: {
    fontSize: 13,
    color: '#92400E',
    lineHeight: 20,
  },

  btnRetry: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    paddingVertical: 16,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  btnRetryText: { color: Colors.primary, fontSize: 15, fontWeight: '700' },
})
