import React from 'react'
import { Text } from 'react-native'
import { Tabs } from 'expo-router'
import { Colors } from '../../constants/colors'
import { useCycleStore } from '../../stores/useCycleStore'

function TabIcon({ emoji, active }: { emoji: string; active: boolean }) {
  return (
    <Text style={{ fontSize: 22, opacity: active ? 1 : 0.45 }}>{emoji}</Text>
  )
}

export default function TabsLayout() {
  const pendingScheduledCount = useCycleStore(s => s.pendingScheduledCount)

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          backgroundColor: Colors.white,
          borderTopColor: Colors.border,
          elevation: 8,
          shadowOpacity: 0.1,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Potes',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🫙" active={focused} />,
          tabBarBadge: pendingScheduledCount > 0 ? pendingScheduledCount : undefined,
        }}
      />
      <Tabs.Screen
        name="monthly"
        options={{
          title: 'Mensal',
          tabBarIcon: ({ focused }) => <TabIcon emoji="📅" active={focused} />,
        }}
      />
      <Tabs.Screen
        name="projection"
        options={{
          title: 'Projeção',
          tabBarIcon: ({ focused }) => <TabIcon emoji="📈" active={focused} />,
        }}
      />
      <Tabs.Screen
        name="goals"
        options={{
          title: 'Metas',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🎯" active={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ focused }) => <TabIcon emoji="👤" active={focused} />,
        }}
      />
    </Tabs>
  )
}
