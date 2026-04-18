import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import { Platform } from 'react-native'
import { supabase } from './supabase'
import { getCycle } from './cycle'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

export async function registerForPushNotifications(): Promise<void> {
  if (!Device.isDevice) return

  const { status } = await Notifications.requestPermissionsAsync()
  if (status !== 'granted') return

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('snapgestao', {
      name: 'SnapGestão',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0F5EA8',
    })
  }
}

export async function sendLocalNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>,
) {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data },
    trigger: null,
  })
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
        `🔴 Pote ${pot.name} quase no limite!`,
        `${Math.round(percent)}% utilizado. Apenas ${remaining.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} restantes.`,
      )
    } else if (percent >= 70) {
      await sendLocalNotification(
        `⚠️ Pote ${pot.name} em atenção`,
        `Você já usou ${Math.round(percent)}% do orçamento. Restam ${remaining.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`,
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

export async function scheduleCycleEndReminder(cycleEndDate: Date) {
  const reminderDate = new Date(cycleEndDate)
  reminderDate.setHours(20, 0, 0, 0)

  if (reminderDate <= new Date()) return

  await Notifications.scheduleNotificationAsync({
    content: {
      title: '📅 Seu ciclo encerra hoje!',
      body: 'Revise seus gastos e decida o que fazer com as sobras de cada pote.',
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminderDate },
  })
}
