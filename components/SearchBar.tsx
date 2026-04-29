import React from 'react'
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from 'react-native'
import { Colors } from '../constants/colors'

type Props = {
  value: string
  onChangeText: (text: string) => void
  placeholder?: string
}

export function SearchBar({ value, onChangeText, placeholder = 'Buscar lançamentos...' }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>🔍</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={() => onChangeText('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.clear}>✕</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1.5, borderColor: Colors.border,
    paddingHorizontal: 12, paddingVertical: 8,
    marginBottom: 12, gap: 8,
  },
  icon: { fontSize: 14 },
  input: {
    flex: 1, fontSize: 14, color: Colors.textDark,
    paddingVertical: 0,
  },
  clear: { fontSize: 13, color: Colors.textMuted, paddingHorizontal: 2 },
})
