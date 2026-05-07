/**
 * Criador: Diego Manhães
 * Data: 07/05/2026
 * Modificado em: 07/05/2026
 *
 * Rota raiz ("/") — exibe spinner enquanto o _layout.tsx
 * determina para qual tela redirecionar. Visível por frações
 * de segundo durante a inicialização do app.
 */

import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { Colors } from '../constants/colors'

// Rota raiz ("/"). O _layout.tsx redireciona para a tela correta
// assim que a sessão carrega. Esta tela só aparece por frações de segundo.
export default function Index() {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={Colors.primary} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
})
