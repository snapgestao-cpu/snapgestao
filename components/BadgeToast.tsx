import React, { useEffect, useRef, useState } from 'react'
import { Animated, Text, View, StyleSheet } from 'react-native'
import { Badge } from '../lib/badges'

type Props = {
  badges: Badge[]
  onDone: () => void
}

export function BadgeToast({ badges, onDone }: Props) {
  const [index, setIndex] = useState(0)
  const opacity = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(-24)).current

  const current = badges[index]

  useEffect(() => {
    if (!current) { onDone(); return }

    opacity.setValue(0)
    translateY.setValue(-24)

    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start()

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -24, duration: 300, useNativeDriver: true }),
      ]).start(() => {
        if (index + 1 < badges.length) {
          setIndex(i => i + 1)
        } else {
          onDone()
        }
      })
    }, 3000)

    return () => clearTimeout(timer)
  }, [index, badges.length])

  if (!current) return null

  return (
    <Animated.View
      style={[styles.container, { backgroundColor: current.color, opacity, transform: [{ translateY }] }]}
    >
      <Text style={styles.icon}>{current.icon}</Text>
      <View style={styles.textBlock}>
        <Text style={styles.label}>Nova conquista desbloqueada!</Text>
        <Text style={styles.name}>{current.name}</Text>
        <Text style={styles.desc} numberOfLines={1}>{current.description}</Text>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60, left: 16, right: 16,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 10,
  },
  icon: { fontSize: 34 },
  textBlock: { flex: 1 },
  label: { color: 'rgba(255,255,255,0.85)', fontSize: 11, marginBottom: 2 },
  name: { color: '#fff', fontSize: 15, fontWeight: '700' },
  desc: { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 2 },
})
