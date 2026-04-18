import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Colors } from '../../constants/colors'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/useAuthStore'

type MenuItem = {
  label: string
  icon: string
  onPress: () => void
  danger?: boolean
}

export default function ProfileScreen() {
  const { user, signOut } = useAuthStore()

  const handleSignOut = async () => {
    Alert.alert('Sair', 'Deseja realmente sair da sua conta?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut()
          signOut()
          router.replace('/(auth)/login')
        },
      },
    ])
  }

  const menuItems: MenuItem[] = [
    {
      label: 'Fontes de receita',
      icon: '💼',
      onPress: () => {},
    },
    {
      label: 'Cartões de crédito',
      icon: '💳',
      onPress: () => {},
    },
    {
      label: 'Notificações',
      icon: '🔔',
      onPress: () => {},
    },
    {
      label: 'Exportar dados (XLSX)',
      icon: '📊',
      onPress: () => {},
    },
    {
      label: 'Sair da conta',
      icon: '🚪',
      onPress: handleSignOut,
      danger: true,
    },
  ]

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.name?.charAt(0)?.toUpperCase() ?? '?'}
          </Text>
        </View>
        <Text style={styles.name}>{user?.name ?? '—'}</Text>
        <Text style={styles.currency}>Moeda: {user?.currency ?? 'BRL'}</Text>

        <View style={styles.menu}>
          {menuItems.map((item) => (
            <TouchableOpacity
              key={item.label}
              style={styles.menuItem}
              onPress={item.onPress}
              activeOpacity={0.7}
            >
              <Text style={styles.menuIcon}>{item.icon}</Text>
              <Text style={[styles.menuLabel, item.danger && styles.danger]}>
                {item.label}
              </Text>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1, padding: 24 },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 12,
  },
  avatarText: { fontSize: 28, fontWeight: '700', color: Colors.white },
  name: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textDark,
    textAlign: 'center',
    marginBottom: 4,
  },
  currency: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', marginBottom: 32 },
  menu: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  menuIcon: { fontSize: 20, marginRight: 14 },
  menuLabel: { flex: 1, fontSize: 15, color: Colors.textDark },
  danger: { color: Colors.danger },
  chevron: { fontSize: 18, color: Colors.textMuted },
})
