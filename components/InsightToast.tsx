/**
 * Toast do alerta reativo por lançamento notável. Mesmo padrão visual/animado do
 * BadgeToast (slide-in + fadeOut), porém lê a frase do useInsightStore (global) e
 * fica mais tempo em tela por ser texto para ler. Some sozinho e ao ser tocado.
 */
import React, { useEffect, useRef } from 'react'
import { Animated, Text, StyleSheet, TouchableWithoutFeedback } from 'react-native'
import { Colors } from '../constants/colors'
import { useInsightStore } from '../stores/useInsightStore'

export function InsightToast() {
  const message = useInsightStore(s => s.message)
  const clearInsight = useInsightStore(s => s.clearInsight)
  const opacity = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(-24)).current

  useEffect(() => {
    if (!message) return

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
      ]).start(() => clearInsight())
    }, 6000)

    return () => clearTimeout(timer)
  }, [message])

  if (!message) return null

  return (
    <TouchableWithoutFeedback onPress={clearInsight}>
      <Animated.View style={[styles.container, { opacity, transform: [{ translateY }] }]}>
        <Text style={styles.icon}>💡</Text>
        <Text style={styles.text}>{message}</Text>
      </Animated.View>
    </TouchableWithoutFeedback>
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
    backgroundColor: Colors.primary,
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 10,
  },
  icon: { fontSize: 26 },
  text: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '600', lineHeight: 18 },
})
