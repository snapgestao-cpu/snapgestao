import React, { useState, useMemo } from 'react'
import {
  View, Text, Image, TouchableOpacity, FlatList,
  TextInput, StyleSheet, Dimensions,
} from 'react-native'
import { Colors } from '../constants/colors'
import { CARD_BRAND_LIST, CARD_BRAND_LABELS, CARD_BRANDS } from '../constants/cardBrands'

const SCREEN_W = Dimensions.get('window').width
const COLS = 3
const ITEM_W = (SCREEN_W - 48 - (COLS - 1) * 10) / COLS
const IMG_H = ITEM_W * (54 / 85)

type Props = {
  value: string | null
  onChange: (brand: string) => void
}

export default function CardBrandPicker({ value, onChange }: Props) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return CARD_BRAND_LIST
    return CARD_BRAND_LIST.filter(k =>
      (CARD_BRAND_LABELS[k] ?? k).toLowerCase().includes(q)
    )
  }, [query])

  return (
    <View style={styles.container}>
      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar cartão..."
          placeholderTextColor={Colors.textMuted}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 14, color: Colors.textMuted }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item}
        numColumns={COLS}
        columnWrapperStyle={styles.row}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const isSelected = value === item
          return (
            <TouchableOpacity
              style={[styles.item, isSelected && styles.itemSelected]}
              onPress={() => onChange(item)}
              activeOpacity={0.7}
            >
              {isSelected && (
                <View style={styles.checkBadge}>
                  <Text style={{ fontSize: 10, color: '#fff' }}>✓</Text>
                </View>
              )}
              <Image
                source={CARD_BRANDS[item]}
                style={styles.cardImg}
                resizeMode="contain"
              />
              <Text style={styles.label} numberOfLines={1}>
                {CARD_BRAND_LABELS[item] ?? item}
              </Text>
            </TouchableOpacity>
          )
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Nenhum cartão encontrado</Text>
          </View>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    gap: 8,
  },
  searchIcon: { fontSize: 14 },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: Colors.textDark,
    padding: 0,
  },
  row: { gap: 10, marginBottom: 10 },
  item: {
    width: ITEM_W,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    position: 'relative',
  },
  itemSelected: {
    borderColor: Colors.primary,
    borderWidth: 2,
    backgroundColor: Colors.lightBlue,
  },
  checkBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  cardImg: {
    width: ITEM_W - 16,
    height: IMG_H,
  },
  label: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 4,
    textAlign: 'center',
  },
  empty: { alignItems: 'center', paddingVertical: 32 },
  emptyText: { fontSize: 14, color: Colors.textMuted },
})
