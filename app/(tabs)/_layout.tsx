import React from 'react'
import { Text } from 'react-native'
import { Tabs } from 'expo-router'
import { Colors } from '../../constants/colors'

function TabIcon({ emoji, active }: { emoji: string; active: boolean }) {
  return (
    <Text style={{ fontSize: 22, opacity: active ? 1 : 0.45 }}>{emoji}</Text>
  )
}

export default function TabsLayout() {
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
