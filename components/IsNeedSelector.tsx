import { View, TouchableOpacity, Text } from 'react-native'
import { Colors } from '../constants/colors'

interface Props {
  value: boolean | null
  onChange: (v: boolean | null) => void
  disabled?: boolean
}

export default function IsNeedSelector({ value, onChange, disabled }: Props) {
  const opts: {
    label: string
    val: boolean | null
    color: string
    bg: string
  }[] = [
    { label: '✓ Necessidade', val: true, color: '#fff', bg: Colors.success },
    { label: '✗ Desejo', val: false, color: '#fff', bg: Colors.danger },
    { label: '? Não informado', val: null, color: Colors.textMuted, bg: Colors.background },
  ]

  return (
    <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
      {opts.map(opt => {
        const selected = value === opt.val
        return (
          <TouchableOpacity
            key={String(opt.val)}
            disabled={disabled}
            onPress={() => onChange(opt.val)}
            style={{
              flex: 1,
              paddingVertical: 8,
              paddingHorizontal: 4,
              borderRadius: 10,
              alignItems: 'center',
              backgroundColor: selected ? opt.bg : Colors.white,
              borderWidth: 1.5,
              borderColor: selected ? opt.bg : Colors.border,
              opacity: disabled ? 0.5 : 1,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: selected ? '800' : '600',
                color: selected ? opt.color : Colors.textMuted,
                textAlign: 'center',
              }}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}
