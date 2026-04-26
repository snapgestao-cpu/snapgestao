import React from 'react'
import { View, Text, TouchableOpacity, Modal, ScrollView, Dimensions } from 'react-native'
import { Colors } from '../constants/colors'

type Props = {
  visible: boolean
  currentOffset: number
  cycleStart: number
  onSelect: (offset: number) => void
  onClose: () => void
}

const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

export default function MonthPickerModal({ visible, currentOffset, onSelect, onClose }: Props) {
  const futuros: { offset: number; label: string }[] = []
  const passados: { offset: number; label: string; year: number }[] = []

  for (let offset = 12; offset >= -24; offset--) {
    const date = new Date()
    date.setDate(1)
    date.setMonth(date.getMonth() + offset)
    const label = MONTHS[date.getMonth()] + '/' + date.getFullYear()
    if (offset > 0) {
      futuros.push({ offset, label })
    } else if (offset < 0) {
      passados.push({ offset, label, year: date.getFullYear() })
    }
  }

  // Mês atual separado
  const hoje = new Date()
  const atualLabel = MONTHS[hoje.getMonth()] + '/' + hoje.getFullYear()

  // Agrupar passados por ano
  const porAno: Record<number, typeof passados> = {}
  passados.forEach(o => {
    if (!porAno[o.year]) porAno[o.year] = []
    porAno[o.year].push(o)
  })
  const anos = Object.keys(porAno).map(Number).sort((a, b) => b - a)

  function MonthBtn({ offset, label }: { offset: number; label: string }) {
    const isActive = offset === currentOffset
    return (
      <TouchableOpacity
        onPress={() => { onSelect(offset); onClose() }}
        style={{
          width: '30%', paddingVertical: 10, borderRadius: 10, alignItems: 'center',
          backgroundColor: isActive ? Colors.primary : Colors.background,
          borderWidth: 1, borderColor: isActive ? Colors.primary : Colors.border,
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: isActive ? '700' : '400', color: isActive ? '#fff' : Colors.textDark }}>
          {label}
        </Text>
      </TouchableOpacity>
    )
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}
        activeOpacity={1}
        onPress={onClose}
      >
        <View
          style={{
            backgroundColor: Colors.white, borderRadius: 20, padding: 20,
            width: Dimensions.get('window').width - 48,
            maxHeight: Dimensions.get('window').height * 0.7,
          }}
          onStartShouldSetResponder={() => true}
        >
          <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.textDark, marginBottom: 16, textAlign: 'center' }}>
            Selecionar mês
          </Text>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Próximos meses */}
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#4F46E5', marginBottom: 8, paddingHorizontal: 4 }}>
              🔮 Próximos meses
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {futuros.map(o => <MonthBtn key={o.offset} offset={o.offset} label={o.label} />)}
            </View>

            {/* Mês atual */}
            <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.primary, marginBottom: 8, paddingHorizontal: 4 }}>
              📍 Mês atual
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              <MonthBtn offset={0} label={atualLabel} />
            </View>

            {/* Meses anteriores */}
            <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.textMuted, marginBottom: 8, paddingHorizontal: 4 }}>
              📅 Meses anteriores
            </Text>
            {anos.map(ano => (
              <View key={ano} style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 11, color: Colors.textMuted, marginBottom: 6, paddingHorizontal: 4 }}>
                  {ano}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {porAno[ano].map(o => <MonthBtn key={o.offset} offset={o.offset} label={o.label} />)}
                </View>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity
            onPress={onClose}
            style={{ marginTop: 16, padding: 12, alignItems: 'center', borderTopWidth: 0.5, borderTopColor: Colors.border }}
          >
            <Text style={{ color: Colors.textMuted, fontSize: 14 }}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  )
}
