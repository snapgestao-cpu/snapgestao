import React, { useState } from 'react'
import { View, Text, TouchableOpacity } from 'react-native'
import { Colors } from '../constants/colors'

type TxItem = {
  id: string
  description: string | null
  merchant: string | null
  amount: number
  type: string
  payment_method: string
  date: string
  billing_date?: string | null
  pot_id: string | null
  potName?: string
  potColor?: string
  installment_number?: number | null
  installment_total?: number | null
}

type Props = {
  transactions: TxItem[]
  onEdit?: (t: TxItem) => void
  onDeleteGroup?: (transactions: TxItem[]) => void
}

const PAYMENT_LABEL: Record<string, string> = {
  credit: 'Crédito', debit: 'Débito',
  pix: 'Pix', cash: 'Dinheiro', transfer: 'Transferência',
}

const POT_ICONS: Record<string, string> = {
  'alimentação': '🍽️', 'alimentacao': '🍽️', 'mercado': '🛒',
  'moradia': '🏠', 'transporte': '🚗', 'saúde': '❤️', 'saude': '❤️',
  'educação': '📚', 'educacao': '📚', 'lazer': '🎉',
  'lanche': '🍔', 'presente': '🎁', 'presentes': '🎁',
}

function getPotIcon(name: string): string {
  const lower = (name || '').toLowerCase()
  const match = Object.keys(POT_ICONS).find(k => lower.includes(k))
  return match ? POT_ICONS[match] : '💰'
}

function brl(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR')
}

// ── Row única (sem agrupamento) ─────────────────────────────────────────────
function SingleRow({ t, onEdit }: { t: TxItem; onEdit?: (t: TxItem) => void }) {
  const isIncome = t.type === 'income'
  const dotColor = t.potColor ?? (isIncome ? Colors.success : Colors.border)

  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center',
      paddingVertical: 12, paddingHorizontal: 16,
      borderBottomWidth: 0.5, borderBottomColor: Colors.border,
    }}>
      <View style={{
        width: 10, height: 10, borderRadius: 5,
        backgroundColor: dotColor, marginRight: 10,
      }} />

      <View style={{ flex: 1 }}>
        {t.merchant ? (
          <>
            <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.textDark, marginBottom: 2 }}>
              {t.merchant}
            </Text>
            {t.description ? (
              <Text style={{ fontSize: 12, color: Colors.textMuted }}>{t.description}</Text>
            ) : null}
          </>
        ) : (
          <Text style={{ fontSize: 14, fontWeight: isIncome ? '600' : '400', color: Colors.textDark }}>
            {t.description ?? 'Sem descrição'}
          </Text>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
          {t.potName ? (
            <Text style={{ fontSize: 11, color: Colors.textMuted }}>
              {getPotIcon(t.potName)} {t.potName}
            </Text>
          ) : null}
          <Text style={{ fontSize: 11, color: Colors.textMuted }}>
            · {PAYMENT_LABEL[t.payment_method] ?? t.payment_method}
          </Text>
          {(t.installment_total ?? 0) > 1 ? (
            <Text style={{
              fontSize: 10, color: Colors.warning,
              backgroundColor: Colors.lightAmber,
              paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6,
            }}>
              {t.installment_number}/{t.installment_total}
            </Text>
          ) : null}
        </View>

        {t.payment_method === 'credit' && t.billing_date && (
          <Text style={{ fontSize: 10, color: Colors.warning, marginTop: 2 }}>
            🛍️ Compra em {formatDate(t.date)}
          </Text>
        )}
      </View>

      <Text style={{
        fontSize: 14, fontWeight: '700',
        color: isIncome ? Colors.success : Colors.danger,
        marginRight: 8,
      }}>
        {isIncome ? '+' : '-'}{brl(Math.abs(Number(t.amount)))}
      </Text>

      {onEdit && (
        <TouchableOpacity onPress={() => onEdit(t)} style={{ padding: 4 }}>
          <Text style={{ fontSize: 16 }}>✏️</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

// ── Componente principal ────────────────────────────────────────────────────
export default function TransactionGroup({ transactions, onEdit, onDeleteGroup }: Props) {
  const [expanded, setExpanded] = useState(false)

  const hasMerchant = !!transactions[0]?.merchant
  const isMultiple = transactions.length > 1

  // Grupo único ou sem merchant → linha simples
  if (!hasMerchant || !isMultiple) {
    return <SingleRow t={transactions[0]} onEdit={onEdit} />
  }

  // Grupo com merchant + múltiplos itens
  const total = transactions.reduce((s, t) =>
    t.type === 'income' ? s + Number(t.amount) : s - Number(t.amount), 0)

  const potColor = transactions[0].potColor ?? Colors.primary
  const potName = transactions[0].potName ?? ''
  const payMethod = transactions[0].payment_method

  return (
    <View style={{ borderBottomWidth: 0.5, borderBottomColor: Colors.border }}>
      {/* Header do grupo */}
      <TouchableOpacity
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
        style={{
          flexDirection: 'row', alignItems: 'flex-start',
          paddingVertical: 12, paddingHorizontal: 16,
          backgroundColor: expanded ? Colors.background : Colors.white,
        }}
      >
        {/* Coluna esquerda: botão [+] acima da bolinha */}
        <View style={{ alignItems: 'center', marginRight: 10, gap: 4 }}>
          <View style={{
            width: 20, height: 20, borderRadius: 10,
            backgroundColor: Colors.lightBlue,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ fontSize: 14, color: Colors.primary, fontWeight: '700', lineHeight: 18 }}>
              {expanded ? '−' : '+'}
            </Text>
          </View>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: potColor }} />
        </View>

        {/* Conteúdo central */}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.textDark, marginBottom: 2 }}>
            {transactions[0].merchant}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {potName ? (
              <Text style={{ fontSize: 11, color: Colors.textMuted }}>
                {getPotIcon(potName)} {potName}
              </Text>
            ) : null}
            <Text style={{ fontSize: 11, color: Colors.textMuted }}>
              · {PAYMENT_LABEL[payMethod] ?? payMethod}
            </Text>
            <Text style={{ fontSize: 11, color: Colors.textMuted }}>
              · {transactions.length} itens
            </Text>
          </View>
        </View>

        {/* Valor total */}
        <Text style={{ fontSize: 14, fontWeight: '700', color: total >= 0 ? Colors.success : Colors.danger }}>
          {total >= 0 ? '+' : ''}{brl(Math.abs(total))}
        </Text>
      </TouchableOpacity>

      {/* Itens expandidos */}
      {expanded && (
        <View>
          {/* Barra de ações em lote */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 16, paddingVertical: 8,
            backgroundColor: Colors.lightBlue,
            borderTopWidth: 0.5, borderTopColor: Colors.border,
          }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.primary }}>
              {transactions.length}{' '}{transactions.length === 1 ? 'item' : 'itens'}
            </Text>
            {onDeleteGroup && (
              <TouchableOpacity
                onPress={() => onDeleteGroup(transactions)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 4,
                  backgroundColor: '#FEF2F2', borderRadius: 8,
                  paddingHorizontal: 10, paddingVertical: 5,
                  borderWidth: 1, borderColor: '#FCA5A5',
                }}
              >
                <Text style={{ fontSize: 12 }}>🗑️</Text>
                <Text style={{ fontSize: 11, color: Colors.danger, fontWeight: '600' }}>Excluir todos</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Lista de itens */}
          <View style={{ backgroundColor: Colors.background, paddingLeft: 36 }}>
          {transactions.map((t, index) => (
            <View key={t.id} style={{
              flexDirection: 'row', alignItems: 'center',
              paddingVertical: 10, paddingHorizontal: 16,
              borderTopWidth: index === 0 ? 0 : 0.5,
              borderTopColor: Colors.border,
            }}>
              <Text style={{ fontSize: 10, color: Colors.textMuted, marginRight: 8 }}>•</Text>

              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, color: Colors.textDark }}>
                  {t.description ?? 'Sem descrição'}
                </Text>
                {(t.installment_total ?? 0) > 1 ? (
                  <Text style={{ fontSize: 10, color: Colors.warning, marginTop: 2 }}>
                    Parcela {t.installment_number}/{t.installment_total}
                  </Text>
                ) : null}
              </View>

              <Text style={{
                fontSize: 13, fontWeight: '600',
                color: t.type === 'income' ? Colors.success : Colors.danger,
                marginRight: 8,
              }}>
                {t.type === 'income' ? '+' : '-'}{brl(Number(t.amount))}
              </Text>

              {onEdit && (
                <TouchableOpacity onPress={() => onEdit(t)} style={{ padding: 4 }}>
                  <Text style={{ fontSize: 14 }}>✏️</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
          </View>
        </View>
      )}
    </View>
  )
}
