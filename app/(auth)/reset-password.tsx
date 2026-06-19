import { useState, useEffect } from 'react'
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
import * as Linking from 'expo-linking'
import { supabase } from '../../lib/supabase'
import { Colors } from '../../constants/colors'

export default function ResetPasswordScreen() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)

  const passwordReqs = [
    { ok: password.length >= 8, text: 'Mínimo 8 caracteres' },
    { ok: /[A-Z]/.test(password), text: 'Uma letra maiúscula' },
    { ok: /[0-9]/.test(password), text: 'Um número' },
  ]

  useEffect(() => {
    console.log('[Reset] Tela montada')

    async function handleDeepLink(url: string) {
      console.log('[Reset] handleDeepLink:', url)

      if (
        !url.includes('reset-password') &&
        !url.includes('recovery') &&
        !url.includes('access_token')
      ) {
        console.log('[Reset] URL não relevante, ignorando')
        return
      }

      let params: URLSearchParams
      const hashIndex  = url.indexOf('#')
      const queryIndex = url.indexOf('?')

      if (hashIndex !== -1) {
        const hashPart = url.substring(hashIndex + 1)
        console.log('[Reset] Hash part:', hashPart)
        params = new URLSearchParams(hashPart)
      } else if (queryIndex !== -1) {
        const queryPart = url.substring(queryIndex + 1)
        console.log('[Reset] Query part:', queryPart)
        params = new URLSearchParams(queryPart)
      } else {
        console.warn('[Reset] Sem params na URL')
        return
      }

      const accessToken  = params.get('access_token')
      const refreshToken = params.get('refresh_token') ?? ''
      const type         = params.get('type')
      const code         = params.get('code')

      console.log('[Reset] access_token:', accessToken ? 'presente' : 'ausente')
      console.log('[Reset] type:', type)

      if (accessToken && (type === 'recovery' || url.includes('recovery'))) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        if (error) {
          console.error('[Reset] setSession erro:', error.message)
          Alert.alert('Link inválido', 'O link expirou ou já foi usado. Solicite um novo.')
          router.replace('/(auth)/login')
          return
        }
        console.log('[Reset] Sessão criada OK')
        setReady(true)
        return
      }

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(url)
        if (error) {
          console.error('[Reset] exchangeCode erro:', error.message)
          Alert.alert('Link inválido', 'O link expirou ou já foi usado. Solicite um novo.')
          router.replace('/(auth)/login')
          return
        }
        // PASSWORD_RECOVERY disparado pelo exchange — caught pelo listener abaixo
        return
      }

      console.warn('[Reset] Tokens ausentes ou tipo incorreto:', type)
    }

    Linking.getInitialURL().then(url => {
      console.log('[Reset] Initial URL:', url)
      if (url) handleDeepLink(url)
    })

    const linkSub = Linking.addEventListener('url', ({ url }) => {
      console.log('[Reset] Deep link:', url)
      handleDeepLink(url)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[Reset] Auth event:', event, !!session)
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true)
      }
    })

    return () => {
      linkSub.remove()
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!ready) {
        console.warn('[Reset] Timeout — nenhum token recebido')
        Alert.alert(
          'Link expirado',
          'O link de redefinição expirou ou é inválido.\n\nSolicite um novo link.',
          [{
            text: 'Solicitar novo link',
            onPress: () => router.replace('/(auth)/forgot-password'),
          }]
        )
      }
    }, 10000)

    return () => clearTimeout(timeout)
  }, [ready])

  async function handleReset() {
    const reqFailed = passwordReqs.find(r => !r.ok)
    if (reqFailed) {
      Alert.alert('Senha inválida', reqFailed.text)
      return
    }
    if (password !== confirm) {
      Alert.alert('Erro', 'As senhas não coincidem.')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error

      Alert.alert(
        '✅ Senha redefinida!',
        'Sua senha foi alterada com sucesso.',
        [{
          text: 'Fazer login',
          onPress: async () => {
            await supabase.auth.signOut()
            router.replace('/(auth)/login')
          },
        }]
      )
    } catch (err) {
      Alert.alert('Erro', 'Não foi possível redefinir a senha. O link pode ter expirado.')
    } finally {
      setLoading(false)
    }
  }

  if (!ready) {
    return (
      <View style={styles.centeredFlex}>
        <Text style={styles.lockEmoji}>🔐</Text>
        <Text style={styles.waitingText}>Validando link de redefinição...</Text>
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
        <Text style={styles.title}>Nova senha</Text>
        <Text style={styles.subtitle}>Escolha uma senha forte para sua conta.</Text>

        <Text style={styles.label}>Nova senha</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="Mínimo 8 caracteres"
          placeholderTextColor={Colors.textMuted}
          secureTextEntry
          autoComplete="new-password"
          returnKeyType="next"
        />

        {password.length > 0 && (
          <View style={styles.reqList}>
            {passwordReqs.map((req, i) => (
              <Text key={i} style={[styles.reqItem, req.ok && styles.reqOk]}>
                {req.ok ? '✓' : '○'} {req.text}
              </Text>
            ))}
          </View>
        )}

        <Text style={styles.label}>Confirmar nova senha</Text>
        <TextInput
          style={[
            styles.input,
            confirm.length > 0
              ? { borderColor: password === confirm ? Colors.success : Colors.danger }
              : null,
          ]}
          value={confirm}
          onChangeText={setConfirm}
          placeholder="Repita a senha"
          placeholderTextColor={Colors.textMuted}
          secureTextEntry
          autoComplete="new-password"
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
            <Text style={styles.btnText}>Salvar nova senha</Text>
          )}
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
  lockEmoji: { fontSize: 48, marginBottom: 16 },
  waitingText: { fontSize: 16, color: Colors.textMuted, textAlign: 'center' },

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
    marginBottom: 8,
  },
  reqList: { marginBottom: 16, gap: 4 },
  reqItem: { fontSize: 12, color: Colors.textMuted },
  reqOk: { color: Colors.success },

  btn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  btnDisabled: { opacity: 0.7 },
  btnText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
})
