import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { Colors } from '../constants/colors'

type Props = {
  feature: string
  description: string
  onUpgrade?: () => void
}

export function PaywallBanner({ feature, description, onUpgrade }: Props) {
  const handleUpgrade = () => {
    if (onUpgrade) {
      onUpgrade()
    } else {
      router.push('/premium' as any)
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.iconRow}>
        <Text style={styles.lockIcon}>🔒</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>PREMIUM</Text>
        </View>
      </View>
      <Text style={styles.title}>{feature}</Text>
      <Text style={styles.description}>{description}</Text>
      <TouchableOpacity style={styles.btn} onPress={handleUpgrade} activeOpacity={0.8}>
        <Text style={styles.btnText}>⭐ Fazer upgrade</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.lightBlue,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.primary + '40',
    padding: 16,
    alignItems: 'center',
    marginVertical: 8,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  lockIcon: { fontSize: 28 },
  badge: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 11, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textDark,
    marginBottom: 4,
    textAlign: 'center',
  },
  description: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: 14,
    lineHeight: 18,
  },
  btn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  btnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
})
