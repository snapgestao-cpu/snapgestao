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
