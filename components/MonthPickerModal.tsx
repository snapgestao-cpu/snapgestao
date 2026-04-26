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
  const opcoes: { offset: number; label: string; year: number; month: number }[] = []
  for (let offset = 0; offset >= -24; offset--) {
    const date = new Date()
    date.setDate(1)
    date.setMonth(date.getMonth() + offset)
    opcoes.push({
      offset,
      label: MONTHS[date.getMonth()] + '/' + date.getFullYear(),
      year: date.getFullYear(),
      month: date.getMonth(),
    })
  }

  const porAno: Record<number, typeof opcoes> = {}
  opcoes.forEach(o => {
    if (!porAno[o.year]) porAno[o.year] = []
    porAno[o.year].push(o)
  })
  const anos = Object.keys(porAno).map(Number).sort((a, b) => b - a)

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
            maxHeight: Dimensions.get('window').height * 0.6,
          }}
          onStartShouldSetResponder={() => true}
        >
          <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.textDark, marginBottom: 16, textAlign: 'center' }}>
            Selecionar mês
          </Text>

          <ScrollView showsVerticalScrollIndicator={false}>
            {anos.map(ano => (
              <View key={ano} style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.textMuted, marginBottom: 8, paddingHorizontal: 4 }}>
                  {ano}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {porAno[ano].map(opcao => (
                    <TouchableOpacity
                      key={opcao.offset}
                      onPress={() => { onSelect(opcao.offset); onClose() }}
                      style={{
                        width: '30%', paddingVertical: 10, borderRadius: 10, alignItems: 'center',
                        backgroundColor: opcao.offset === currentOffset ? Colors.primary : Colors.background,
                        borderWidth: 1,
                        borderColor: opcao.offset === currentOffset ? Colors.primary : Colors.border,
                      }}
                    >
                      <Text style={{
                        fontSize: 13,
                        fontWeight: opcao.offset === currentOffset ? '700' : '400',
                        color: opcao.offset === currentOffset ? '#fff' : Colors.textDark,
                      }}>
                        {opcao.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
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
