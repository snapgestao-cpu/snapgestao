import { Tabs } from 'expo-router'
import { Colors } from '../../constants/colors'

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
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Potes', tabBarIcon: ({ color }) => <TabIcon emoji="🏺" color={color} /> }}
      />
      <Tabs.Screen
        name="monthly"
        options={{ title: 'Mensal', tabBarIcon: ({ color }) => <TabIcon emoji="📅" color={color} /> }}
      />
      <Tabs.Screen
        name="projection"
        options={{ title: 'Projeção', tabBarIcon: ({ color }) => <TabIcon emoji="📈" color={color} /> }}
      />
      <Tabs.Screen
        name="goals"
        options={{ title: 'Metas', tabBarIcon: ({ color }) => <TabIcon emoji="🎯" color={color} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Perfil', tabBarIcon: ({ color }) => <TabIcon emoji="👤" color={color} /> }}
      />
    </Tabs>
  )
}

function TabIcon({ emoji, color }: { emoji: string; color: string }) {
  const { Text } = require('react-native')
  return <Text style={{ fontSize: 20, opacity: color === Colors.primary ? 1 : 0.5 }}>{emoji}</Text>
}
