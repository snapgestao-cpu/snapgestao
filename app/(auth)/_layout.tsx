/**
 * Criador: Diego Manhães
 * Data: 07/05/2026
 * Modificado em: 07/05/2026
 *
 * Layout do grupo de autenticação — empilha as telas de login
 * e cadastro com animação slide_from_right e sem header nativo.
 */

import { Stack } from 'expo-router'

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
    </Stack>
  )
}
