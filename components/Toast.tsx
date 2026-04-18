import React, { useEffect, useRef } from 'react'
import { Animated, Text, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

type Props = {
  message: string | null
  color: string
  onHide: () => void
}

export function Toast({ message, color, onHide }: Props) {
  const insets = useSafeAreaInsets()
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!message) return
    opacity.setValue(1)
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(onHide)
    }, 1700)
    return () => clearTimeout(timer)
  }, [message])

  if (!message) return null

  return (
    <Animated.View
      style={[styles.box, { backgroundColor: color, top: insets.top + 12, opacity }]}
    >
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    left: 20,
    right: 20,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  text: { color: '#fff', fontSize: 15, fontWeight: '600', textAlign: 'center' },
})
