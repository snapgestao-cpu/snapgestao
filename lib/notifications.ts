export async function registerForPushNotifications(): Promise<void> {}

export async function sendLocalNotification(_title: string, _body: string): Promise<void> {}

export async function checkCriticalPots(_userId: string, _cycleStart: number): Promise<void> {}

export async function scheduleCycleEndReminder(): Promise<void> {}

export async function sendEncouragementNotification(
  _userName: string,
  _goalName: string,
  _percent: number,
): Promise<void> {}
