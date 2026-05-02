import React from 'react'
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native'
import { Colors } from '../constants/colors'

type Props = {
  visible: boolean
  onAccept: () => void
  onDecline: () => void
}

const SHARED_ITEMS = [
  'Nome do produto e preço',
  'Nome do estabelecimento',
  'Cidade (do estabelecimento)',
  'Data da compra',
]

const NEVER_SHARED = [
  'Seu nome ou email',
  'Seus dados financeiros',
  'Seu histórico pessoal',
  'Qualquer dado que te identifique',
]

export default function PriceShareOptInModal({ visible, onAccept, onDecline }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.emoji}>🤝</Text>

          <Text style={styles.title}>Comparar preços com a comunidade?</Text>

          <Text style={styles.description}>
            Ao escanear cupons fiscais, podemos compartilhar anonimamente os preços
            dos produtos com outros usuários.
          </Text>

          <View style={styles.listBox}>
            <Text style={styles.listTitle}>✅ O que é compartilhado:</Text>
            {SHARED_ITEMS.map(item => (
              <Text key={item} style={styles.listItem}>• {item}</Text>
            ))}
          </View>

          <View style={[styles.listBox, styles.listBoxDanger]}>
            <Text style={[styles.listTitle, { color: Colors.danger }]}>❌ Nunca compartilhado:</Text>
            {NEVER_SHARED.map(item => (
              <Text key={item} style={styles.listItem}>• {item}</Text>
            ))}
          </View>

          <TouchableOpacity onPress={onAccept} style={styles.acceptBtn}>
            <Text style={styles.acceptBtnText}>✅ Sim, quero contribuir</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onDecline} style={styles.declineBtn}>
            <Text style={styles.declineBtnText}>Não, prefiro não compartilhar</Text>
          </TouchableOpacity>

          <Text style={styles.footer}>
            Você pode alterar essa preferência a qualquer momento nas configurações.
          </Text>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  emoji: { fontSize: 48, textAlign: 'center', marginBottom: 16 },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textDark,
    textAlign: 'center',
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  listBox: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  listBoxDanger: { backgroundColor: '#FEF2F2' },
  listTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.success,
    marginBottom: 8,
  },
  listItem: { fontSize: 12, color: Colors.textMuted, marginBottom: 4 },
  acceptBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 10,
  },
  acceptBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  declineBtn: { padding: 12, alignItems: 'center' },
  declineBtnText: { color: Colors.textMuted, fontSize: 14 },
  footer: {
    fontSize: 10,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
  },
})
