import React from 'react'
import { View, Text, TouchableOpacity } from 'react-native'
import { Colors } from '../constants/colors'
import { AIProvider, AI_PROVIDERS } from '../lib/ai-provider'

type Props = {
  selected: AIProvider
  onSelect: (provider: AIProvider) => void
}

export default function AIProviderSelector({ selected, onSelect }: Props) {
  return (
    <View style={{ marginBottom: 20 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.textDark, marginBottom: 10 }}>
        🧠 Escolher modelo de IA:
      </Text>

      <View style={{ gap: 8 }}>
        {AI_PROVIDERS.map(provider => (
          <TouchableOpacity
            key={provider.id}
            onPress={() => onSelect(provider.id)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              padding: 14,
              borderRadius: 14,
              borderWidth: 1.5,
              borderColor: selected === provider.id ? Colors.primary : Colors.border,
              backgroundColor: selected === provider.id ? Colors.lightBlue : Colors.white,
            }}
          >
            {/* Radio button */}
            <View style={{
              width: 20, height: 20, borderRadius: 10, borderWidth: 2,
              borderColor: selected === provider.id ? Colors.primary : Colors.border,
              alignItems: 'center', justifyContent: 'center', marginRight: 12,
            }}>
              {selected === provider.id && (
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary }} />
              )}
            </View>

            {/* Emoji */}
            <Text style={{ fontSize: 20, marginRight: 10 }}>{provider.emoji}</Text>

            {/* Info */}
            <View style={{ flex: 1 }}>
              <Text style={{
                fontSize: 14,
                fontWeight: selected === provider.id ? '700' : '500',
                color: selected === provider.id ? Colors.primary : Colors.textDark,
              }}>
                {provider.label}
              </Text>
              <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>
                {provider.description}
              </Text>
            </View>

            {/* Badge gratuito para Groq */}
            {provider.id === 'groq' && (
              <View style={{
                backgroundColor: '#DCFCE7', borderRadius: 8,
                paddingHorizontal: 8, paddingVertical: 3,
              }}>
                <Text style={{ fontSize: 10, color: '#166534', fontWeight: '700' }}>GRÁTIS</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )
}
