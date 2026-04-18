import React, { useState } from 'react'
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
} from 'react-native'
import { Link, router } from 'expo-router'
import { Colors } from '../../constants/colors'
import { useAuthStore } from '../../stores/useAuthStore'

function LogoBars() {
  return (
    <View style={styles.logoBars}>
      <View style={[styles.bar, { height: 14, backgroundColor: Colors.primary }]} />
      <View style={[styles.bar, { height: 22, backgroundColor: Colors.primary }]} />
      <View style={[styles.bar, { height: 18, backgroundColor: Colors.accent }]} />
      <View style={[styles.bar, { height: 28, backgroundColor: Colors.primary }]} />
      <View style={[styles.bar, { height: 20, backgroundColor: Colors.primaryDark }]} />
    </View>
  )
}

export default function RegisterScreen() {
  const { signUp } = useAuthStore()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clearError = () => setError(null)

  const validate = (): string | null => {
    if (!name.trim()) return 'Informe seu nome completo.'
    if (!email.trim()) return 'Informe seu e-mail.'
    if (!email.includes('@')) return 'Formato de e-mail inválido.'
    if (!password) return 'Informe uma senha.'
    if (password.length < 6) return 'A senha deve ter no mínimo 6 caracteres.'
    if (password !== confirmPassword) return 'As senhas não coincidem.'
    return null
  }

  const handleRegister = async () => {
    const validationError = validate()
    if (validationError) { setError(validationError); return }

    setError(null)
    setLoading(true)
    const err = await signUp(name.trim(), email.trim(), password)
    setLoading(false)

    if (err) {
      setError(err)
      return
    }

    router.replace('/onboarding/step1')
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
        {/* Logo */}
        <View style={styles.logoWrap}>
          <LogoBars />
          <Text style={styles.logoText}>SnapGestão</Text>
          <Text style={styles.logoSub}>Crie sua conta gratuita</Text>
        </View>

        {/* Campos */}
        <View style={styles.form}>
          <Text style={styles.label}>Nome completo</Text>
          <TextInput
            style={styles.input}
            placeholder="Seu nome"
            placeholderTextColor={Colors.textMuted}
            value={name}
            onChangeText={(v) => { setName(v); clearError() }}
            autoComplete="name"
            autoCapitalize="words"
            returnKeyType="next"
          />

          <Text style={styles.label}>E-mail</Text>
          <TextInput
            style={styles.input}
            placeholder="seu@email.com"
            placeholderTextColor={Colors.textMuted}
            value={email}
            onChangeText={(v) => { setEmail(v); clearError() }}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            returnKeyType="next"
          />

          <Text style={styles.label}>Senha</Text>
          <View style={styles.passwordWrap}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Mínimo 6 caracteres"
              placeholderTextColor={Colors.textMuted}
              value={password}
              onChangeText={(v) => { setPassword(v); clearError() }}
              secureTextEntry={!showPassword}
              autoComplete="new-password"
              returnKeyType="next"
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowPassword((v) => !v)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Confirmar senha</Text>
          <View style={[
            styles.passwordWrap,
            confirmPassword.length > 0 && password !== confirmPassword
              ? styles.inputError
              : null,
          ]}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Repita a senha"
              placeholderTextColor={Colors.textMuted}
              value={confirmPassword}
              onChangeText={(v) => { setConfirmPassword(v); clearError() }}
              secureTextEntry={!showConfirm}
              autoComplete="new-password"
              returnKeyType="done"
              onSubmitEditing={handleRegister}
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowConfirm((v) => !v)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.eyeIcon}>{showConfirm ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠ {error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.btnText}>Criar conta</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Rodapé */}
        <Link href="/(auth)/login" asChild>
          <TouchableOpacity style={styles.footer}>
            <Text style={styles.footerText}>
              Já tem conta?{' '}
              <Text style={styles.footerLink}>Entrar</Text>
            </Text>
          </TouchableOpacity>
        </Link>
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

  // Logo
  logoWrap: { alignItems: 'center', marginBottom: 36 },
  logoBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    height: 32,
    marginBottom: 14,
  },
  bar: { width: 7, borderRadius: 3 },
  logoText: {
    fontSize: 30,
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  logoSub: { fontSize: 14, color: Colors.textMuted },

  // Form
  form: { marginBottom: 32 },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textDark,
    marginBottom: 6,
    marginTop: 4,
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
    marginBottom: 16,
  },
  passwordWrap: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    marginBottom: 16,
  },
  inputError: { borderColor: Colors.danger },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: Colors.textDark,
  },
  eyeBtn: { paddingHorizontal: 14 },
  eyeIcon: { fontSize: 18 },

  // Error
  errorBox: {
    backgroundColor: Colors.lightRed,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: Colors.danger,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  errorText: { fontSize: 13, color: Colors.danger, fontWeight: '500' },

  // Button
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

  // Footer
  footer: { alignItems: 'center' },
  footerText: { fontSize: 14, color: Colors.textMuted },
  footerLink: { color: Colors.primary, fontWeight: '700' },
})
