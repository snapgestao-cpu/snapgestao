/**
 * Criador: Diego Manhães
 * Data: 08/05/2026
 *
 * Tela de Deduções IR — lista lançamentos dedutíveis agrupados por
 * categoria com progresso vs. limite anual e exportação em PDF.
 * Bloqueada por ir_module_enabled (paywall simples se false).
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, ActivityIndicator, RefreshControl, Alert, Share,
  TextInput, KeyboardAvoidingView, Platform,
} from 'react-native'
import { Image } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import * as Sharing from 'expo-sharing'
import * as FileSystem from 'expo-file-system/legacy'
import { Colors } from '../constants/colors'
import { useAuthStore } from '../stores/useAuthStore'
import { getIRDeductibles, groupByCategory, getIRReceiptImageUrl, IRCategoryGroup, IRDeductible } from '../lib/ir'
import { gerarRelatorioIR, salvarPDFnoDownloads } from '../lib/gerar-pdf'
import { getHealthReimbursement, upsertHealthReimbursement, HealthReimbursement } from '../lib/ir-reimbursement'
import { brl } from '../lib/finance'
import { formatCents, digitsOnly, centsToFloat } from '../lib/onboardingDraft'

function isoToBR(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function ReceiptThumb({ imagePath, onPress }: { imagePath: string; onPress: () => void }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    getIRReceiptImageUrl(imagePath)
      .then(setUrl)
      .catch(() => {})
  }, [imagePath])

  if (!url) {
    return (
      <TouchableOpacity onPress={onPress} style={styles.receiptBtn}>
        <Text style={styles.receiptBtnIcon}>🧾</Text>
      </TouchableOpacity>
    )
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.receiptThumb}
      activeOpacity={0.85}
    >
      <Image source={{ uri: url }} style={styles.receiptThumbImg} resizeMode="cover" />
      <View style={styles.receiptThumbOverlay}>
        <Text style={styles.receiptThumbOverlayText}>🔍 Ver foto</Text>
      </View>
    </TouchableOpacity>
  )
}

export default function IRScreen() {
  const { user, isPremium } = useAuthStore()
  const currentYear = new Date().getFullYear()

  const [year, setYear] = useState(currentYear)
  const [groups, setGroups] = useState<IRCategoryGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [receiptImage, setReceiptImage] = useState<{ uri: string; item: IRDeductible } | null>(null)
  const [loadingImage, setLoadingImage] = useState(false)
  const [reimbursement, setReimbursement] = useState<HealthReimbursement>({ amount: 0, description: null })
  const [showReimbModal, setShowReimbModal] = useState(false)
  const [reimbModalDigits, setReimbModalDigits] = useState('')
  const [reimbModalDesc, setReimbModalDesc] = useState('')
  const [savingReimb, setSavingReimb] = useState(false)
  const reimbAmountRef = useRef<TextInput>(null)

  const load = useCallback(async () => {
    if (!user) return
    try {
      const [items, reimb] = await Promise.all([
        getIRDeductibles(user.id, year),
        getHealthReimbursement(user.id, year),
      ])
      setGroups(groupByCategory(items))
      setReimbursement(reimb)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [user?.id, year])

  useEffect(() => { setLoading(true); load() }, [load])

  const saudeTotal = groups.find(g => g.category === 'saude')?.total ?? 0
  const saudeLiquido = Math.max(0, saudeTotal - reimbursement.amount)
  const totalGeral = groups.reduce((s, g) =>
    s + (g.category === 'saude' ? saudeLiquido : g.total), 0
  )

  const openReimbModal = () => {
    const cents = Math.round(reimbursement.amount * 100)
    setReimbModalDigits(cents > 0 ? String(cents) : '')
    setReimbModalDesc(reimbursement.description ?? '')
    setShowReimbModal(true)
  }

  const saveReimbursement = async () => {
    if (!user || savingReimb) return
    setSavingReimb(true)
    try {
      const parsed = centsToFloat(reimbModalDigits)
      await upsertHealthReimbursement(user.id, year, parsed, reimbModalDesc.trim() || undefined)
      setReimbursement({ amount: parsed, description: reimbModalDesc.trim() || null })
      setShowReimbModal(false)
    } catch {
      Alert.alert('Erro', 'Não foi possível salvar o reembolso.')
    } finally {
      setSavingReimb(false)
    }
  }

  const deleteReimbursement = () => {
    Alert.alert(
      'Remover reembolso',
      'Deseja remover o valor de reembolso cadastrado?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover', style: 'destructive', onPress: async () => {
            if (!user) return
            setSavingReimb(true)
            try {
              await upsertHealthReimbursement(user.id, year, 0, undefined)
              setReimbursement({ amount: 0, description: null })
              setShowReimbModal(false)
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
      setReceiptImage({ uri, item })
    } catch {
      Alert.alert('Erro', 'Não foi possível carregar a imagem do recibo.')
    } finally {
      setLoadingImage(false)
    }
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
                  {group.items.map((item, idx) => (
                    <View key={item.id} style={[styles.txRow, idx < group.items.length - 1 && styles.txBorder]}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.txProvider}>{item.ir_provider_name ?? item.description ?? '—'}</Text>
                        {item.ir_provider_document ? (
                          <Text style={styles.txDoc}>{item.ir_provider_document}</Text>
                        ) : null}
                        <Text style={styles.txDetail}>
                          {item.description ? `${item.description} · ` : ''}{brl(item.amount)} · {isoToBR(item.date)}
                          {item.ir_receipt_number ? ` · Recibo: ${item.ir_receipt_number}` : ''}
                        </Text>
                        {group.category === 'saude' && reimbursement.amount > 0 && idx === group.items.length - 1 ? (
                          <Text style={styles.txReimb}>Reembolso: −{brl(reimbursement.amount)}</Text>
                        ) : null}
                        {item.ir_receipt_image_path ? (
                          <ReceiptThumb
                            imagePath={item.ir_receipt_image_path}
                            onPress={() => handleOpenReceipt(item)}
                          />
                        ) : null}
                      </View>
                    </View>
                  ))}

                  {/* Reembolso footer — apenas Saúde */}
                  {group.category === 'saude' && (
                    <View style={styles.reimbFooter}>
                      <TouchableOpacity style={styles.reimbBtn} onPress={openReimbModal} activeOpacity={0.75}>
                        <Text style={styles.reimbBtnText}>
                          {reimbursement.amount > 0 ? '✏️ Editar reembolso' : '💰 Adicionar reembolso'}
                        </Text>
                      </TouchableOpacity>
                      {reimbursement.amount > 0 && (
                        reimbursement.amount > saudeTotal
                          ? <Text style={styles.reimbWarning}>⚠️ Reembolso maior que os gastos registrados</Text>
                          : <View style={styles.nettoRow}>
                              <Text style={styles.nettoLabel}>Gasto dedutível líquido:</Text>
                              <Text style={styles.nettoValue}>{brl(saudeLiquido)}</Text>
                            </View>
                      )}
                    </View>
                  )}
                </View>
              ))}

              {/* Total geral */}
              <View style={styles.totalBox}>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>TOTAL DE DEDUÇÕES {year}</Text>
                  <Text style={styles.totalValue}>{brl(totalGeral)}</Text>
                </View>
                {reimbursement.amount > 0 && (
                  <Text style={styles.totalNote}>
                    * Saúde: valor líquido após reembolso de {brl(reimbursement.amount)}
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

      {/* Modal reembolso */}
      <Modal
        visible={showReimbModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowReimbModal(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1, justifyContent: 'flex-end' }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableOpacity style={StyleSheet.absoluteFillObject as any} onPress={() => setShowReimbModal(false)} />
          <View style={styles.reimbModalCard}>
            <Text style={styles.reimbModalTitle}>💰 Reembolso do plano de saúde</Text>
            <Text style={styles.reimbModalLabel}>Valor recebido de volta</Text>
            <TouchableOpacity
              style={styles.reimbAmountDisplay}
              onPress={() => reimbAmountRef.current?.focus()}
              activeOpacity={0.8}
            >
              <Text style={styles.reimbAmountText}>
                {reimbModalDigits ? formatCents(reimbModalDigits) : 'R$ 0,00'}
              </Text>
              <TextInput
                ref={reimbAmountRef}
                style={styles.reimbHiddenInput}
                value={reimbModalDigits}
                onChangeText={v => setReimbModalDigits(digitsOnly(v))}
                keyboardType="numeric"
                caretHidden
              />
            </TouchableOpacity>
            <Text style={styles.reimbModalLabel}>Plano/Operadora (opcional)</Text>
            <TextInput
              style={styles.reimbModalInput}
              value={reimbModalDesc}
              onChangeText={setReimbModalDesc}
              placeholder="Ex: Bradesco, Unimed..."
              placeholderTextColor={Colors.textMuted}
            />
            {reimbursement.amount > 0 && (
              <TouchableOpacity style={styles.reimbDeleteBtn} onPress={deleteReimbursement} disabled={savingReimb}>
                <Text style={styles.reimbDeleteBtnText}>🗑️ Remover reembolso</Text>
              </TouchableOpacity>
            )}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
              <TouchableOpacity
                style={[styles.reimbModalBtn, { backgroundColor: Colors.border, flex: 1 }]}
                onPress={() => setShowReimbModal(false)}
              >
                <Text style={[styles.reimbModalBtnText, { color: Colors.textDark }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.reimbModalBtn, { backgroundColor: Colors.primary, flex: 1 }]}
                onPress={saveReimbursement}
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

      {/* Modal imagem recibo */}
      <Modal
        visible={!!receiptImage}
        transparent
        animationType="fade"
        onRequestClose={() => setReceiptImage(null)}
      >
        <View style={styles.imageModalBackdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject as any} onPress={() => setReceiptImage(null)} />
          <View style={styles.imageModalCard}>
            <View style={styles.imageModalHeader}>
              <Text style={styles.imageModalTitle} numberOfLines={1}>
                {receiptImage?.item.ir_provider_name ?? 'Recibo'}
              </Text>
              <TouchableOpacity onPress={() => setReceiptImage(null)}>
                <Text style={styles.imageModalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            {receiptImage && (
              <Image
                source={{ uri: receiptImage.uri }}
                style={styles.receiptImage}
                resizeMode="contain"
              />
            )}
            <TouchableOpacity
              style={styles.shareImageBtn}
              onPress={async () => {
                if (!receiptImage) return
                try {
                  const localUri = (FileSystem.cacheDirectory ?? '') + 'recibo_ir.jpg'
                  await FileSystem.downloadAsync(receiptImage.uri, localUri)
                  await Sharing.shareAsync(localUri, { mimeType: 'image/jpeg', dialogTitle: 'Compartilhar recibo' })
                } catch {
                  Alert.alert('Erro', 'Não foi possível compartilhar a imagem.')
                }
              }}
            >
              <Text style={styles.shareImageBtnText}>Compartilhar imagem</Text>
            </TouchableOpacity>
          </View>
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
  txRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  txBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  txProvider: { fontSize: 13, fontWeight: '700', color: Colors.textDark },
  txDoc: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  txDetail: { fontSize: 12, color: Colors.textMuted, marginTop: 3 },
  txReimb: { fontSize: 12, color: '#C0392B', marginTop: 2, fontWeight: '600' },
  receiptBtn: { alignSelf: 'flex-start', padding: 4, marginTop: 6 },
  receiptBtnIcon: { fontSize: 22 },
  receiptThumb: {
    marginTop: 8, borderRadius: 10, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.border,
  },
  receiptThumbImg: { width: '100%', height: 120 },
  receiptThumbOverlay: {
    position: 'absolute', bottom: 6, right: 6,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 6, padding: 4,
  },
  receiptThumbOverlayText: { color: '#fff', fontSize: 11 },
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
  // Modal imagem
  imageModalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center', alignItems: 'center', padding: 16,
  },
  imageModalCard: {
    backgroundColor: Colors.white, borderRadius: 20, width: '100%', maxHeight: '85%', overflow: 'hidden',
  },
  imageModalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  imageModalTitle: { fontSize: 15, fontWeight: '700', color: Colors.textDark, flex: 1 },
  imageModalClose: { fontSize: 18, color: Colors.textMuted, paddingLeft: 12 },
  receiptImage: { width: '100%', height: 400 },
  shareImageBtn: {
    margin: 16, backgroundColor: Colors.primary, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  shareImageBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  // Reembolso
  reimbFooter: {
    paddingHorizontal: 16, paddingBottom: 12, paddingTop: 4,
  },
  reimbBtn: {
    alignSelf: 'flex-start', borderWidth: 1, borderColor: Colors.primary,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
  },
  reimbBtnText: { fontSize: 12, fontWeight: '600', color: Colors.primary },
  reimbWarning: { fontSize: 12, color: Colors.warning, marginTop: 8 },
  nettoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  nettoLabel: { fontSize: 13, fontWeight: '600', color: Colors.textDark },
  nettoValue: { fontSize: 15, fontWeight: '800', color: Colors.success },
  // Modal reembolso
  reimbModalCard: {
    backgroundColor: Colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 36,
  },
  reimbModalTitle: { fontSize: 16, fontWeight: '800', color: Colors.textDark, marginBottom: 4 },
  reimbModalLabel: { fontSize: 13, color: Colors.textMuted, marginBottom: 6, marginTop: 14 },
  reimbModalInput: {
    backgroundColor: Colors.background, borderRadius: 10, padding: 12,
    fontSize: 15, color: Colors.textDark, borderWidth: 1, borderColor: Colors.border,
  },
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
