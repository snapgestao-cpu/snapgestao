/**
 * Criador: Diego Manhães
 * Data: 08/05/2026
 *
 * Tela de Deduções IR — lista lançamentos dedutíveis agrupados por
 * categoria com progresso vs. limite anual e exportação em PDF.
 * Bloqueada por isPremium (paywall para usuários Free).
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, ActivityIndicator, RefreshControl, Alert,
  TextInput, KeyboardAvoidingView, Platform,
} from 'react-native'
import { Image } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import * as Sharing from 'expo-sharing'
import * as FileSystem from 'expo-file-system/legacy'
import { Colors } from '../constants/colors'
import { useAuthStore } from '../stores/useAuthStore'
import { getIRDeductibles, groupByCategory, getIRReceiptImageUrl, updateIRReimbursement, IRCategoryGroup, IRDeductible } from '../lib/ir'
import { gerarRelatorioIR, salvarPDFnoDownloads } from '../lib/gerar-pdf'
import { brl } from '../lib/finance'
import { formatCents, digitsOnly, centsToFloat } from '../lib/onboardingDraft'

function isoToBR(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export default function IRScreen() {
  const { user, isPremium } = useAuthStore()
  const currentYear = new Date().getFullYear()

  const [year, setYear] = useState(currentYear)
  const [groups, setGroups] = useState<IRCategoryGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [receiptUri, setReceiptUri] = useState<string | null>(null)
  const [loadingImage, setLoadingImage] = useState(false)
  const [editingReimb, setEditingReimb] = useState<IRDeductible | null>(null)
  const [reimbEditDigits, setReimbEditDigits] = useState('')
  const [savingReimb, setSavingReimb] = useState(false)
  const reimbAmountRef = useRef<TextInput>(null)

  const load = useCallback(async () => {
    if (!user) return
    try {
      const items = await getIRDeductibles(user.id, year)
      setGroups(groupByCategory(items))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [user?.id, year])

  useEffect(() => { setLoading(true); load() }, [load])

  const totalReimbs = groups.reduce((s, g) =>
    s + g.items.reduce((ss, item) => ss + (item.ir_reimbursement_amount ?? 0), 0), 0)
  const totalGeral = groups.reduce((s, g) => s + g.total, 0) - totalReimbs

  const handleExportPDF = async () => {
    if (!user) return
    setExportingPdf(true)
    try {
      const uri = await gerarRelatorioIR(user.id, year, user.name)
      await salvarPDFnoDownloads(uri, `IR_${year}_SnapGestao.pdf`)
    } catch (e: any) {
      Alert.alert('Erro', e?.message ?? 'Não foi possível gerar o PDF.')
    } finally {
      setExportingPdf(false)
    }
  }

  const handleOpenReceipt = async (item: IRDeductible) => {
    if (!item.ir_receipt_image_path) return
    setLoadingImage(true)
    try {
      const uri = await getIRReceiptImageUrl(item.ir_receipt_image_path)
      setReceiptUri(uri)
    } catch {
      Alert.alert('Erro', 'Não foi possível carregar a imagem do recibo.')
    } finally {
      setLoadingImage(false)
    }
  }

  const openReimbEdit = (item: IRDeductible) => {
    const cents = Math.round((item.ir_reimbursement_amount ?? 0) * 100)
    setReimbEditDigits(cents > 0 ? String(cents) : '')
    setEditingReimb(item)
  }

  const saveItemReimb = async () => {
    if (!editingReimb || savingReimb) return
    setSavingReimb(true)
    try {
      const amount = centsToFloat(reimbEditDigits)
      await updateIRReimbursement(editingReimb.id, amount > 0 ? amount : null)
      setEditingReimb(null)
      load()
    } catch {
      Alert.alert('Erro', 'Não foi possível salvar o reembolso.')
    } finally {
      setSavingReimb(false)
    }
  }

  const deleteItemReimb = () => {
    Alert.alert(
      'Remover reembolso',
      'Deseja remover o valor de reembolso deste lançamento?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover', style: 'destructive', onPress: async () => {
            if (!editingReimb) return
            setSavingReimb(true)
            try {
              await updateIRReimbursement(editingReimb.id, null)
              setEditingReimb(null)
              load()
            } catch {
              Alert.alert('Erro', 'Não foi possível remover o reembolso.')
            } finally {
              setSavingReimb(false)
            }
          },
        },
      ]
    )
  }

  // Paywall
  if (!isPremium) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.paywallHeader}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backIcon}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Deduções IR</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.paywallBody}>
          <Text style={styles.paywallIcon}>📋</Text>
          <Text style={styles.paywallTitle}>Funcionalidade Premium</Text>
          <Text style={styles.paywallSub}>
            O módulo de Deduções IR está disponível no plano Premium.{'\n'}
            Registre e organize todas as suas despesas dedutíveis para declarar o IR com facilidade.
          </Text>
          <View style={styles.paywallFeatures}>
            {['Saúde, educação, previdência', 'Limites automáticos por categoria', 'Exportação em PDF', 'Foto dos recibos'].map(f => (
              <View key={f} style={styles.paywallFeatureRow}>
                <Text style={styles.paywallFeatureIcon}>✓</Text>
                <Text style={styles.paywallFeatureText}>{f}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity style={styles.paywallBtn} onPress={() => router.push('/premium')}>
            <Text style={styles.paywallBtnText}>Conhecer plano Premium</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Deduções IR</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Seletor de ano */}
      <View style={styles.yearRow}>
        <TouchableOpacity onPress={() => setYear(y => y - 1)} style={styles.yearBtn}>
          <Text style={styles.yearBtnText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.yearLabel}>{year}</Text>
        <TouchableOpacity
          onPress={() => setYear(y => Math.min(currentYear, y + 1))}
          style={[styles.yearBtn, year >= currentYear && styles.yearBtnDisabled]}
          disabled={year >= currentYear}
        >
          <Text style={[styles.yearBtnText, year >= currentYear && { color: Colors.border }]}>›</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={Colors.primary} />}
        >
          {groups.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyText}>Nenhum lançamento dedutível em {year}.</Text>
              <Text style={styles.emptySub}>Ao registrar gastos, ative "Dedutível no IR" para que apareçam aqui.</Text>
            </View>
          ) : (
            <>
              {groups.map(group => (
                <View key={group.category} style={styles.groupCard}>
                  <View style={styles.groupHeader}>
                    <Text style={styles.groupName}>{group.label}</Text>
                    <Text style={styles.groupTotal}>{brl(group.total)}</Text>
                  </View>

                  {/* Limite e progresso */}
                  {group.limit != null ? (
                    <>
                      <View style={styles.limitRow}>
                        <Text style={styles.limitText}>
                          {group.total <= group.limit
                            ? `⚠️ Limite: ${brl(group.limit)}/ano  ·  Ainda pode deduzir: ${brl(group.limit - group.total)}`
                            : `🔴 Excedido em ${brl(group.total - group.limit)} (limite: ${brl(group.limit)})`}
                        </Text>
                      </View>
                      <View style={styles.progressBg}>
                        <View style={[
                          styles.progressFill,
                          {
                            width: `${Math.min(100, (group.total / group.limit) * 100)}%` as any,
                            backgroundColor: group.total > group.limit ? Colors.danger : Colors.accent,
                          }
                        ]} />
                      </View>
                    </>
                  ) : (
                    <Text style={styles.noLimitText}>✅ Sem limite — 100% dedutível</Text>
                  )}

                  {/* Itens */}
                  {group.items.map((item, idx) => {
                    const reimb = item.ir_reimbursement_amount ?? 0
                    return (
                      <View key={item.id} style={[styles.txRow, idx < group.items.length - 1 && styles.txBorder]}>
                        <Text style={styles.txProvider}>{item.ir_provider_name ?? item.description ?? '—'}</Text>
                        {item.ir_provider_document ? (
                          <Text style={styles.txDoc}>{item.ir_provider_document}</Text>
                        ) : null}
                        <Text style={styles.txDetail}>
                          {item.description ? `${item.description} · ` : ''}{brl(item.amount)} · {isoToBR(item.date)}
                          {item.ir_receipt_number ? ` · Recibo: ${item.ir_receipt_number}` : ''}
                        </Text>

                        {/* Reembolso individual */}
                        {reimb > 0 ? (
                          <>
                            <View style={styles.txReimbRow}>
                              <Text style={styles.txReimbLabel}>Reembolso recebido:</Text>
                              <Text style={styles.txReimbValue}>−{brl(reimb)}</Text>
                            </View>
                            <View style={styles.txNettoRow}>
                              <Text style={styles.txNettoLabel}>Valor dedutível líquido:</Text>
                              <Text style={styles.txNettoValue}>{brl(item.amount - reimb)}</Text>
                            </View>
                          </>
                        ) : null}

                        {/* Botões do card */}
                        <View style={styles.txActionsRow}>
                          <TouchableOpacity
                            onPress={() => openReimbEdit(item)}
                            style={styles.txActionBtn}
                          >
                            <Text style={styles.txActionBtnText}>
                              {reimb > 0 ? '✏️ Editar reembolso' : '+ Adicionar reembolso'}
                            </Text>
                          </TouchableOpacity>
                          {item.ir_receipt_image_path ? (
                            <TouchableOpacity
                              onPress={() => handleOpenReceipt(item)}
                              style={[styles.txActionBtn, styles.txReceiptBtn]}
                              disabled={loadingImage}
                            >
                              {loadingImage ? (
                                <ActivityIndicator size="small" color={Colors.primary} />
                              ) : (
                                <Text style={styles.txReceiptBtnText}>🧾 Ver recibo</Text>
                              )}
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      </View>
                    )
                  })}
                </View>
              ))}

              {/* Total geral */}
              <View style={styles.totalBox}>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>TOTAL DE DEDUÇÕES {year}</Text>
                  <Text style={styles.totalValue}>{brl(totalGeral)}</Text>
                </View>
                {totalReimbs > 0 && (
                  <Text style={styles.totalNote}>
                    * Valor líquido após reembolsos de {brl(totalReimbs)}
                  </Text>
                )}
              </View>
            </>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* Botão exportar PDF */}
      {!loading && groups.length > 0 && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.pdfBtn, exportingPdf && { opacity: 0.7 }]}
            onPress={handleExportPDF}
            disabled={exportingPdf}
          >
            {exportingPdf
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.pdfBtnText}>📄 Exportar PDF</Text>
            }
          </TouchableOpacity>
        </View>
      )}

      {/* Modal reembolso por lançamento */}
      <Modal
        visible={!!editingReimb}
        transparent
        animationType="slide"
        onRequestClose={() => setEditingReimb(null)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1, justifyContent: 'flex-end' }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableOpacity style={StyleSheet.absoluteFillObject as any} onPress={() => setEditingReimb(null)} />
          <View style={styles.reimbModalCard}>
            <Text style={styles.reimbModalTitle}>💰 Reembolso recebido</Text>
            <Text style={styles.reimbModalSub} numberOfLines={1}>
              {editingReimb?.ir_provider_name ?? editingReimb?.description ?? '—'}
            </Text>
            <Text style={styles.reimbModalLabel}>Valor recebido de volta</Text>
            <TouchableOpacity
              style={styles.reimbAmountDisplay}
              onPress={() => reimbAmountRef.current?.focus()}
              activeOpacity={0.8}
            >
              <Text style={styles.reimbAmountText}>
                {reimbEditDigits ? formatCents(reimbEditDigits) : 'R$ 0,00'}
              </Text>
              <TextInput
                ref={reimbAmountRef}
                style={styles.reimbHiddenInput}
                value={reimbEditDigits}
                onChangeText={v => setReimbEditDigits(digitsOnly(v))}
                keyboardType="numeric"
                caretHidden
              />
            </TouchableOpacity>
            {(editingReimb?.ir_reimbursement_amount ?? 0) > 0 && (
              <TouchableOpacity style={styles.reimbDeleteBtn} onPress={deleteItemReimb} disabled={savingReimb}>
                <Text style={styles.reimbDeleteBtnText}>🗑️ Remover reembolso</Text>
              </TouchableOpacity>
            )}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
              <TouchableOpacity
                style={[styles.reimbModalBtn, { backgroundColor: Colors.border, flex: 1 }]}
                onPress={() => setEditingReimb(null)}
              >
                <Text style={[styles.reimbModalBtnText, { color: Colors.textDark }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.reimbModalBtn, { backgroundColor: Colors.primary, flex: 1 }]}
                onPress={saveItemReimb}
                disabled={savingReimb}
              >
                {savingReimb
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.reimbModalBtnText}>Salvar</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal imagem recibo — tela cheia escura */}
      <Modal
        visible={!!receiptUri}
        transparent
        animationType="fade"
        onRequestClose={() => setReceiptUri(null)}
      >
        <View style={styles.imageModalBackdrop}>
          <TouchableOpacity
            onPress={() => setReceiptUri(null)}
            style={styles.imageModalCloseBtn}
          >
            <Text style={styles.imageModalCloseText}>✕</Text>
          </TouchableOpacity>
          {receiptUri && (
            <Image
              source={{ uri: receiptUri }}
              style={styles.receiptImage}
              resizeMode="contain"
            />
          )}
          <TouchableOpacity
            style={styles.shareImageBtn}
            onPress={async () => {
              if (!receiptUri) return
              try {
                const localUri = (FileSystem.cacheDirectory ?? '') + 'recibo_ir.jpg'
                await FileSystem.downloadAsync(receiptUri, localUri)
                await Sharing.shareAsync(localUri, { mimeType: 'image/jpeg', dialogTitle: 'Compartilhar recibo' })
              } catch {
                Alert.alert('Erro', 'Não foi possível compartilhar a imagem.')
              }
            }}
          >
            <Text style={styles.shareImageBtnText}>📤 Compartilhar recibo</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.white,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  backIcon: { fontSize: 28, color: Colors.primary, fontWeight: '300', lineHeight: 32 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: Colors.textDark },
  yearRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 24, paddingVertical: 12, backgroundColor: Colors.white,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  yearBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  yearBtnDisabled: { opacity: 0.3 },
  yearBtnText: { fontSize: 24, color: Colors.primary, fontWeight: '700' },
  yearLabel: { fontSize: 20, fontWeight: '800', color: Colors.textDark, minWidth: 60, textAlign: 'center' },
  scroll: { padding: 16 },
  emptyBox: { alignItems: 'center', paddingVertical: 48 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { fontSize: 16, fontWeight: '700', color: Colors.textDark, textAlign: 'center' },
  emptySub: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  groupCard: {
    backgroundColor: Colors.white, borderRadius: 16, marginBottom: 16, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  groupHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 12,
  },
  groupName: { fontSize: 14, fontWeight: '700', color: '#fff' },
  groupTotal: { fontSize: 16, fontWeight: '800', color: '#fff' },
  limitRow: { paddingHorizontal: 16, paddingTop: 8 },
  limitText: { fontSize: 12, color: Colors.warning },
  noLimitText: { fontSize: 12, color: Colors.success, paddingHorizontal: 16, paddingVertical: 8 },
  progressBg: { height: 6, backgroundColor: Colors.border, marginHorizontal: 16, marginVertical: 8, borderRadius: 3 },
  progressFill: { height: 6, borderRadius: 3 },
  txRow: { paddingHorizontal: 16, paddingVertical: 12 },
  txBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  txProvider: { fontSize: 13, fontWeight: '700', color: Colors.textDark },
  txDoc: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  txDetail: { fontSize: 12, color: Colors.textMuted, marginTop: 3 },
  txReimbRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  txReimbLabel: { fontSize: 12, color: Colors.danger, fontWeight: '600' },
  txReimbValue: { fontSize: 12, color: Colors.danger, fontWeight: '700' },
  txNettoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4,
  },
  txNettoLabel: { fontSize: 12, color: Colors.textMuted },
  txNettoValue: { fontSize: 13, color: Colors.success, fontWeight: '700' },
  txActionsRow: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  txActionBtn: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 8,
    paddingVertical: 4, paddingHorizontal: 10, backgroundColor: Colors.background,
  },
  txActionBtnText: { fontSize: 12, color: Colors.primary, fontWeight: '600' },
  txReceiptBtn: { borderColor: Colors.border },
  txReceiptBtnText: { fontSize: 12, color: Colors.primary, fontWeight: '600' },
  totalBox: {
    backgroundColor: Colors.primary, borderRadius: 16, padding: 20,
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.8)' },
  totalValue: { fontSize: 22, fontWeight: '800', color: '#fff' },
  totalNote: { fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 6 },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 16, backgroundColor: Colors.white,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  pdfBtn: {
    backgroundColor: Colors.primary, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
  },
  pdfBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  // Paywall
  paywallHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.white,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  paywallBody: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  paywallIcon: { fontSize: 56, marginBottom: 16 },
  paywallTitle: { fontSize: 22, fontWeight: '800', color: Colors.textDark, textAlign: 'center', marginBottom: 12 },
  paywallSub: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  paywallFeatures: { width: '100%', marginBottom: 32 },
  paywallFeatureRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  paywallFeatureIcon: { fontSize: 16, color: Colors.accent, fontWeight: '700' },
  paywallFeatureText: { fontSize: 14, color: Colors.textDark },
  paywallBtn: {
    backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 16,
    paddingHorizontal: 32, alignItems: 'center',
  },
  paywallBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  // Modal imagem — tela cheia escura
  imageModalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center', alignItems: 'center',
  },
  imageModalCloseBtn: {
    position: 'absolute', top: 48, right: 20,
    padding: 12, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20,
  },
  imageModalCloseText: { color: '#fff', fontSize: 20 },
  receiptImage: { width: '92%', height: '72%', borderRadius: 8 },
  shareImageBtn: {
    marginTop: 20, backgroundColor: Colors.primary, borderRadius: 12,
    padding: 14, paddingHorizontal: 32, flexDirection: 'row', gap: 8, alignItems: 'center',
  },
  shareImageBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  // Modal reembolso
  reimbModalCard: {
    backgroundColor: Colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 36,
  },
  reimbModalTitle: { fontSize: 16, fontWeight: '800', color: Colors.textDark, marginBottom: 2 },
  reimbModalSub: { fontSize: 13, color: Colors.textMuted, marginBottom: 4 },
  reimbModalLabel: { fontSize: 13, color: Colors.textMuted, marginBottom: 6, marginTop: 14 },
  reimbAmountDisplay: {
    backgroundColor: Colors.background, borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 4, alignItems: 'center',
  },
  reimbAmountText: { fontSize: 22, fontWeight: '800', color: Colors.textDark },
  reimbHiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  reimbDeleteBtn: {
    marginTop: 14, paddingVertical: 10, alignItems: 'center',
    borderRadius: 10, borderWidth: 1, borderColor: '#E74C3C',
  },
  reimbDeleteBtnText: { fontSize: 14, fontWeight: '600', color: '#E74C3C' },
  reimbModalBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  reimbModalBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
})
