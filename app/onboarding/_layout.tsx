/**
 * Criador: Diego Manhães
 * Data: 07/05/2026
 * Modificado em: 07/05/2026
 *
 * Layout do onboarding — empilha os 3 passos de configuração
 * inicial sem header nativo e com animação slide_from_right.
 */

import { Stack } from 'expo-router'

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
  )
}
