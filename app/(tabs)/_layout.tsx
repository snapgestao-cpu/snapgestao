import React from 'react'
import { Tabs } from 'expo-router'
import Svg, { Path, Circle, Line, Rect, Polyline } from 'react-native-svg'
import { Colors } from '../../constants/colors'

function JarIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 22 22" fill="none">
      <Rect x="7" y="1" width="8" height="2.5" rx="1" stroke={color} strokeWidth="1.6" />
      <Rect x="5.5" y="3.2" width="11" height="1.8" rx="0.8" stroke={color} strokeWidth="1.6" />
      <Path
        d="M5 5 Q3.5 5 3.5 6.8 L3.5 18.5 Q3.5 20 5 20 L17 20 Q18.5 20 18.5 18.5 L18.5 6.8 Q18.5 5 17 5 Z"
        stroke={color} strokeWidth="1.6"
      />
      <Line x1="16" y1="7.5" x2="16" y2="13" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
    </Svg>
  )
}

function CalendarIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 22 22" fill="none">
      <Rect x="2" y="4" width="18" height="16" rx="2.5" stroke={color} strokeWidth="1.8" />
      <Line x1="7" y1="2" x2="7" y2="6" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <Line x1="15" y1="2" x2="15" y2="6" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <Line x1="2" y1="9" x2="20" y2="9" stroke={color} strokeWidth="1.5" />
      <Rect x="6" y="12" width="3" height="3" rx="0.5" fill={color} />
      <Rect x="11" y="12" width="3" height="3" rx="0.5" fill={color} />
    </Svg>
  )
}

function ChartIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 22 22" fill="none">
      <Polyline
        points="2,16 7,10 12,13 17,5 21,7"
        stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      />
      <Line x1="2" y1="19" x2="20" y2="19" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  )
}

function TargetIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 22 22" fill="none">
      <Circle cx="11" cy="11" r="9" stroke={color} strokeWidth="1.8" />
      <Circle cx="11" cy="11" r="5.5" stroke={color} strokeWidth="1.5" />
      <Circle cx="11" cy="11" r="2" fill={color} />
    </Svg>
  )
}

function UserIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 22 22" fill="none">
      <Circle cx="11" cy="7.5" r="4" stroke={color} strokeWidth="1.8" />
      <Path
        d="M2.5 19.5 C2.5 15.5 6.5 12.5 11 12.5 C15.5 12.5 19.5 15.5 19.5 19.5"
        stroke={color} strokeWidth="1.8" strokeLinecap="round"
      />
    </Svg>
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
        options={{ title: 'Potes', tabBarIcon: ({ color }) => <JarIcon color={color} /> }}
      />
      <Tabs.Screen
        name="monthly"
        options={{ title: 'Mensal', tabBarIcon: ({ color }) => <CalendarIcon color={color} /> }}
      />
      <Tabs.Screen
        name="projection"
        options={{ title: 'Projeção', tabBarIcon: ({ color }) => <ChartIcon color={color} /> }}
      />
      <Tabs.Screen
        name="goals"
        options={{ title: 'Metas', tabBarIcon: ({ color }) => <TargetIcon color={color} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Perfil', tabBarIcon: ({ color }) => <UserIcon color={color} /> }}
      />
    </Tabs>
  )
}
