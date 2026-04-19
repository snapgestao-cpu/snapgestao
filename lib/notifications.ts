import { Alert } from 'react-native'
import { supabase } from './supabase'
import { getCycle } from './cycle'

export async function registerForPushNotifications(): Promise<void> {
  // Push notifications not supported in Expo Go SDK 53.
  // Will be implemented in production build.
  console.log('Notificações locais prontas')
}

export async function sendLocalNotification(title: string, body: string) {
  Alert.alert(title, body)
}

export async function checkCriticalPots(userId: string, cycleStart: number) {
  const cycle = getCycle(cycleStart, 0)

  const { data: pots } = await supabase
    .from('pots')
    .select('*')
    .eq('user_id', userId)
    .eq('is_emergency', false)
    .is('deleted_at', null)

  if (!pots) return

  for (const pot of pots) {
    if (!pot.limit_amount) continue

    const { data: transactions } = await supabase
      .from('transactions')
      .select('amount')
      .eq('pot_id', pot.id)
      .eq('type', 'expense')
      .gte('date', cycle.startISO)
      .lte('date', cycle.endISO)

    const spent = (transactions ?? []).reduce((s: number, t: any) => s + Number(t.amount), 0)
    const percent = (spent / pot.limit_amount) * 100
    const remaining = pot.limit_amount - spent

    if (percent >= 100) {
      await sendLocalNotification(
        `🚨 Pote ${pot.name} estourado!`,
        `Você ultrapassou o limite em ${(spent - pot.limit_amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}. Revise seus gastos.`,
      )
    } else if (percent >= 80) {
      await sendLocalNotification(
        `🔴 ${pot.name} quase no limite!`,
        `${Math.round(percent)}% utilizado. Restam ${remaining.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`,
      )
    } else if (percent >= 70) {
      await sendLocalNotification(
        `⚠️ ${pot.name} em atenção`,
        `${Math.round(percent)}% do orçamento usado.`,
      )
    }
  }
}

export async function sendEncouragementNotification(
  userName: string,
  goalName: string,
  percent: number,
) {
  await sendLocalNotification(
    `🎉 Você está indo bem, ${userName}!`,
    `Já conquistou ${Math.round(percent)}% da meta "${goalName}". Continue assim!`,
  )
}

export async function scheduleCycleEndReminder(): Promise<void> {
  // Will be implemented in production build with expo-notifications.
}
