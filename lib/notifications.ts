/**
 * Criador: Diego Manhães
 * Data: 07/05/2026
 * Modificado em: 07/05/2026
 *
 * Notificações push — completamente desabilitadas nesta versão.
 * As funções são stubs vazios para não bloquear o build.
 * Push notifications requerem build de produção via EAS.
 */

export async function registerForPushNotifications(): Promise<void> {}

export async function sendLocalNotification(_title: string, _body: string): Promise<void> {}

export async function checkCriticalPots(_userId: string, _cycleStart: number): Promise<void> {}

export async function scheduleCycleEndReminder(): Promise<void> {}

export async function sendEncouragementNotification(
  _userName: string,
  _goalName: string,
  _percent: number,
): Promise<void> {}
