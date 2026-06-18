/**
 * Criador: Diego Manhães
 * Data: 07/05/2026
 * Modificado em: 07/05/2026
 *
 * Tela de cadastro — criação de conta por nome, e-mail e senha
 * via Supabase Auth. Após o signUp bem-sucedido, redireciona
 * automaticamente para o onboarding.
 */

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
  Modal,
} from 'react-native'
import { Link, router } from 'expo-router'
import { Colors } from '../../constants/colors'
import { supabase } from '../../lib/supabase'

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
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showEmailSent, setShowEmailSent] = useState(false)

  const clearError = () => setError(null)

  const passwordReqs = [
    { ok: password.length >= 8, text: 'Mínimo 8 caracteres' },
    { ok: /[A-Z]/.test(password), text: 'Uma letra maiúscula' },
    { ok: /[0-9]/.test(password), text: 'Um número' },
  ]

  const validate = (): string | null => {
    if (!name.trim()) return 'Informe seu nome completo.'
    if (!email.trim()) return 'Informe seu e-mail.'
    if (!email.includes('@')) return 'Formato de e-mail inválido.'
    if (!password) return 'Informe uma senha.'
    if (password.length < 8) return 'A senha deve ter pelo menos 8 caracteres.'
    if (!/[A-Z]/.test(password)) return 'A senha deve ter pelo menos uma letra maiúscula.'
    if (!/[0-9]/.test(password)) return 'A senha deve ter pelo menos um número.'
    if (password !== confirmPassword) return 'As senhas não coincidem.'
    return null
  }

  const handleRegister = async () => {
    const validationError = validate()
    if (validationError) { setError(validationError); return }

    setError(null)
    setLoading(true)

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { name: name.trim() } },
    })

    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    // Supabase retorna identities vazio quando o email já existe
    if ((data.user?.identities?.length ?? 0) === 0) {
      setError('Este e-mail já está cadastrado. Faça login ou use "Esqueceu a senha?".')
      return
    }

    setShowEmailSent(true)
  }

  return (
    <>
    <Modal visible={showEmailSent} animationType="fade" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalEmoji}>📧</Text>
          <Text style={styles.modalTitle}>Confirme seu e-mail</Text>
          <Text style={styles.modalBody}>
            Enviamos um link de confirmação para{' '}
            <Text style={styles.modalEmail}>{email.trim()}</Text>
            {'\n\n'}
            Acesse seu e-mail e clique no link para ativar sua conta.
          </Text>
          <TouchableOpacity
            style={styles.btn}
            onPress={() => {
              setShowEmailSent(false)
              router.replace('/(auth)/login')
            }}
          >
            <Text style={styles.btnText}>Ir para o login</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>

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
              placeholder="Mínimo 8 caracteres"
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
          {password.length > 0 && (
            <View style={styles.reqList}>
              {passwordReqs.map((req, i) => (
                <Text key={i} style={[styles.reqItem, req.ok && styles.reqOk]}>
                  {req.ok ? '✓' : '○'} {req.text}
                </Text>
              ))}
            </View>
          )}

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
    </>
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

  // Password requirements checklist
  reqList: { marginTop: -10, marginBottom: 12, gap: 4 },
  reqItem: { fontSize: 12, color: Colors.textMuted },
  reqOk: { color: Colors.success },

  // Email sent modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    width: '100%',
  },
  modalEmoji: { fontSize: 48, marginBottom: 16 },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textDark,
    marginBottom: 12,
    textAlign: 'center',
  },
  modalBody: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  modalEmail: { fontWeight: '700', color: Colors.primary },

  // Footer
  footer: { alignItems: 'center' },
  footerText: { fontSize: 14, color: Colors.textMuted },
  footerLink: { color: Colors.primary, fontWeight: '700' },
})
