/**
 * Criador: Diego Manhães
 * Data: 07/05/2026
 * Modificado em: 07/05/2026
 *
 * Grupo de transações agrupadas por data — cabeçalho colapsável com
 * total do dia e lista de TransactionItem. Suporta edição inline de
 * descrição e exclusão de lançamentos.
 */

import React, { useState } from 'react'
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native'
import { Colors } from '../constants/colors'
import { CreditCard } from '../types'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/useAuthStore'

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
  onEditMerchant?: (transactions: TxItem[], newMerchant: string) => Promise<void> | void
  onEditPaymentMethod?: (transactions: TxItem[], newMethod: string, card?: CreditCard | null, installments?: number) => Promise<void> | void
}

const PAYMENT_LABEL: Record<string, string> = {
  credit: 'Crédito', debit: 'Débito',
  pix: 'Pix', cash: 'Dinheiro', transfer: 'Transferência',
  voucher_alimentacao: 'Vale Alimentação', voucher_refeicao: 'Vale Refeição',
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
const EXPENSE_METHODS = ['cash', 'debit', 'credit', 'pix', 'voucher_alimentacao', 'voucher_refeicao']
const INCOME_METHODS = ['pix', 'transfer', 'cash', 'voucher_alimentacao', 'voucher_refeicao']

export default function TransactionGroup({ transactions, onEdit, onDeleteGroup, onEditMerchant, onEditPaymentMethod }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [editingMerchant, setEditingMerchant] = useState(false)
  const [merchantDraft, setMerchantDraft] = useState('')
  const [savingMerchant, setSavingMerchant] = useState(false)
  const [editingPayment, setEditingPayment] = useState(false)
  const [savingPayment, setSavingPayment] = useState(false)
  const [awaitingCard, setAwaitingCard] = useState(false)
  const [cards, setCards] = useState<CreditCard[]>([])
  const [cardsLoaded, setCardsLoaded] = useState(false)
  const [loadingCards, setLoadingCards] = useState(false)
  const [selectedCreditCardId, setSelectedCreditCardId] = useState<string | null>(null)
  const [installmentsCount, setInstallmentsCount] = useState(1)

  const hasMerchant = !!transactions[0]?.merchant
  const isMultiple = transactions.length > 1

  // Grupo único ou sem merchant → linha simples
  if (!hasMerchant || !isMultiple) {
    return <SingleRow t={transactions[0]} onEdit={onEdit} />
  }

  // Grupo com merchant + múltiplos itens
  const total = transactions.reduce((s, t) =>
    t.type === 'income' ? s + Number(t.amount) : s - Number(t.amount), 0)

  const todosDoMesmoPote = transactions.every(t => t.pot_id === transactions[0].pot_id)
  const potColor = todosDoMesmoPote ? (transactions[0].potColor ?? Colors.border) : Colors.border
  const potName = todosDoMesmoPote ? (transactions[0].potName ?? '') : ''
  const paymentMethods = [...new Set(transactions.map(t => t.payment_method).filter(Boolean))]
  const paymentLabel = paymentMethods.length > 1
    ? 'Múltiplos pagamentos'
    : (PAYMENT_LABEL[paymentMethods[0]] ?? paymentMethods[0] ?? '')

  const allCredit = transactions.every(t => t.payment_method === 'credit')
  const purchaseDates = [...new Set(transactions.map(t => t.date))]
  const showPurchaseDateInHeader = allCredit && purchaseDates.length === 1
  const showPurchaseDatePerItem = allCredit && purchaseDates.length > 1

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
          {savingMerchant ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={{ fontSize: 13, color: Colors.primary, fontWeight: '600' }}>
                Salvando...
              </Text>
            </View>
          ) : editingMerchant ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <TextInput
                value={merchantDraft}
                onChangeText={setMerchantDraft}
                autoFocus
                style={{
                  flex: 1, fontSize: 14, fontWeight: '700', color: Colors.textDark,
                  borderBottomWidth: 1.5, borderBottomColor: Colors.primary,
                  paddingVertical: 0, paddingHorizontal: 2,
                }}
                onSubmitEditing={async () => {
                  if (!merchantDraft.trim() || !onEditMerchant) { setEditingMerchant(false); return }
                  setEditingMerchant(false)
                  setSavingMerchant(true)
                  await onEditMerchant(transactions, merchantDraft.trim())
                  setSavingMerchant(false)
                }}
              />
              <TouchableOpacity
                onPress={async () => {
                  if (!merchantDraft.trim() || !onEditMerchant) { setEditingMerchant(false); return }
                  setEditingMerchant(false)
                  setSavingMerchant(true)
                  await onEditMerchant(transactions, merchantDraft.trim())
                  setSavingMerchant(false)
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={{ fontSize: 16, color: Colors.primary }}>✓</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setEditingMerchant(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={{ fontSize: 14, color: Colors.textMuted }}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.textDark, marginBottom: 2 }}>
              {transactions[0].merchant}
            </Text>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {todosDoMesmoPote && potName ? (
              <Text style={{ fontSize: 11, color: Colors.textMuted }}>
                {getPotIcon(potName)} {potName}
              </Text>
            ) : (
              <Text style={{ fontSize: 11, color: Colors.textMuted }}>🫙 Múltiplos potes</Text>
            )}
            <Text style={{ fontSize: 11, color: Colors.textMuted }}>
              · {paymentLabel}
            </Text>
            <Text style={{ fontSize: 11, color: Colors.textMuted }}>
              · {transactions.length} itens
            </Text>
          </View>
          {showPurchaseDateInHeader && (
            <Text style={{ fontSize: 10, color: Colors.warning, marginTop: 2 }}>
              🛍️ Compra em {formatDate(purchaseDates[0])}
            </Text>
          )}
        </View>

        {/* Valor total + botão editar estabelecimento */}
        <Text style={{ fontSize: 14, fontWeight: '700', color: total >= 0 ? Colors.success : Colors.danger }}>
          {total >= 0 ? '+' : ''}{brl(Math.abs(total))}
        </Text>
        {onEditMerchant && !editingMerchant && (
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation?.()
              setMerchantDraft(transactions[0].merchant ?? '')
              setEditingMerchant(true)
              if (!expanded) setExpanded(true)
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ marginLeft: 6 }}
          >
            <Text style={{ fontSize: 12 }}>✏️</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>

      {/* Itens expandidos */}
      {expanded && (
        <View>
          {/* Barra de ações em lote */}
          <View style={{
            backgroundColor: Colors.lightBlue,
            borderTopWidth: 0.5, borderTopColor: Colors.border,
          }}>
            <View style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingHorizontal: 16, paddingVertical: 8,
            }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.primary }}>
                {transactions.length}{' '}{transactions.length === 1 ? 'item' : 'itens'}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {onEditPaymentMethod && (
                  savingPayment ? (
                    <ActivityIndicator size="small" color={Colors.primary} />
                  ) : (
                    <TouchableOpacity
                      onPress={() => setEditingPayment(v => !v)}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 4,
                        backgroundColor: editingPayment ? Colors.primary : Colors.white,
                        borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
                        borderWidth: 1, borderColor: Colors.primary,
                      }}
                    >
                      <Text style={{ fontSize: 12 }}>💳</Text>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: editingPayment ? Colors.white : Colors.primary }}>
                        Pagamento
                      </Text>
                    </TouchableOpacity>
                  )
                )}
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
            </View>

            {/* Chips de seleção de forma de pagamento */}
            {editingPayment && onEditPaymentMethod && !awaitingCard && (
              <View style={{
                flexDirection: 'row', flexWrap: 'wrap', gap: 6,
                paddingHorizontal: 16, paddingBottom: 10,
              }}>
                {(transactions[0]?.type === 'income' ? INCOME_METHODS : EXPENSE_METHODS).map(method => {
                  const currentMethod = paymentMethods.length === 1 ? paymentMethods[0] : null
                  const active = currentMethod === method
                  const isCreditWithoutCards = method === 'credit' && cardsLoaded && cards.length === 0
                  return (
                    <TouchableOpacity
                      key={method}
                      disabled={isCreditWithoutCards}
                      onPress={async () => {
                        if (active) { setEditingPayment(false); return }
                        if (method === 'credit') {
                          setLoadingCards(true)
                          setAwaitingCard(true)
                          const userId = useAuthStore.getState().session?.user?.id
                          if (userId) {
                            const { data } = await supabase.from('credit_cards').select('*').eq('user_id', userId)
                            const list = (data as CreditCard[]) ?? []
                            setCards(list)
                            setSelectedCreditCardId(list[0]?.id ?? null)
                            setCardsLoaded(true)
                          }
                          setLoadingCards(false)
                          return
                        }
                        setEditingPayment(false)
                        setSavingPayment(true)
                        await onEditPaymentMethod(transactions, method, undefined)
                        setSavingPayment(false)
                      }}
                      style={{
                        paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16,
                        backgroundColor: active ? Colors.primary : Colors.white,
                        borderWidth: 1, borderColor: active ? Colors.primary : (isCreditWithoutCards ? Colors.border : Colors.border),
                        opacity: isCreditWithoutCards ? 0.35 : 1,
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '600', color: active ? Colors.white : Colors.textDark }}>
                        {PAYMENT_LABEL[method] ?? method}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            )}

            {/* Seleção de cartão para crédito */}
            {awaitingCard && onEditPaymentMethod && (
              <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
                {loadingCards ? (
                  <ActivityIndicator size="small" color={Colors.primary} style={{ marginVertical: 6 }} />
                ) : (
                  <>
                    <Text style={{ fontSize: 11, color: Colors.textMuted, marginBottom: 6 }}>
                      Selecione o cartão:
                    </Text>
                    {cards.length === 0 ? (
                      <Text style={{ fontSize: 11, color: Colors.danger, marginBottom: 8 }}>
                        Nenhum cartão cadastrado. Adicione um cartão no perfil para usar crédito.
                      </Text>
                    ) : (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                        {cards.map(c => {
                          const active = selectedCreditCardId === c.id
                          return (
                            <TouchableOpacity
                              key={c.id}
                              onPress={() => setSelectedCreditCardId(c.id)}
                              style={{
                                paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16,
                                backgroundColor: active ? Colors.primary : Colors.white,
                                borderWidth: 1, borderColor: active ? Colors.primary : Colors.border,
                              }}
                            >
                              <Text style={{ fontSize: 11, fontWeight: '600', color: active ? Colors.white : Colors.textDark }}>
                                {c.name}{c.last_four ? ` ••••${c.last_four}` : ''}
                              </Text>
                            </TouchableOpacity>
                          )
                        })}
                      </View>
                    )}

                    <Text style={{ fontSize: 11, color: Colors.textMuted, marginBottom: 6 }}>
                      Parcelas:
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <TouchableOpacity
                        onPress={() => setInstallmentsCount(v => Math.max(1, v - 1))}
                        style={{
                          width: 28, height: 28, borderRadius: 14, borderWidth: 1.5,
                          borderColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.primary, lineHeight: 20 }}>−</Text>
                      </TouchableOpacity>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.textDark, minWidth: 36, textAlign: 'center' }}>
                        {installmentsCount}x
                      </Text>
                      <TouchableOpacity
                        onPress={() => setInstallmentsCount(v => Math.min(24, v + 1))}
                        style={{
                          width: 28, height: 28, borderRadius: 14, borderWidth: 1.5,
                          borderColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.primary, lineHeight: 20 }}>+</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity
                        disabled={cards.length === 0}
                        onPress={async () => {
                          setAwaitingCard(false)
                          setEditingPayment(false)
                          setSavingPayment(true)
                          const card = cards.find(c => c.id === selectedCreditCardId) ?? null
                          await onEditPaymentMethod(transactions, 'credit', card, installmentsCount)
                          setInstallmentsCount(1)
                          setSavingPayment(false)
                        }}
                        style={{
                          flex: 1, paddingVertical: 7, borderRadius: 8,
                          backgroundColor: cards.length === 0 ? Colors.border : Colors.primary,
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.white }}>Confirmar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => { setAwaitingCard(false); setEditingPayment(false); setInstallmentsCount(1) }}
                        style={{
                          paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8,
                          borderWidth: 1.5, borderColor: Colors.danger, alignItems: 'center',
                          backgroundColor: '#FEF2F2',
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.danger }}>Cancelar</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            )}
          </View>

          {/* Lista de itens */}
          <View style={{ backgroundColor: Colors.background, paddingLeft: 36 }}>
            {transactions.map((t, index) => {
              const itemPoteName = t.potName ?? ''
              const itemPoteColor = t.potColor ?? Colors.border

              return (
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
                    {itemPoteName ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: itemPoteColor }} />
                        <Text style={{ fontSize: 10, color: Colors.textMuted }}>
                          {getPotIcon(itemPoteName)} {itemPoteName}
                        </Text>
                      </View>
                    ) : null}
                    {(t.installment_total ?? 0) > 1 ? (
                      <Text style={{ fontSize: 10, color: Colors.warning, marginTop: 2 }}>
                        Parcela {t.installment_number}/{t.installment_total}
                      </Text>
                    ) : null}
                    {showPurchaseDatePerItem && (
                      <Text style={{ fontSize: 10, color: Colors.warning, marginTop: 2 }}>
                        🛍️ Compra em {formatDate(t.date)}
                      </Text>
                    )}
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
              )
            })}
          </View>
        </View>
      )}
    </View>
  )
}
