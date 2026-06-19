import { Component, ReactNode } from 'react'
import { View, Text, TouchableOpacity } from 'react-native'
import { Colors } from '../constants/colors'

interface Props { children: ReactNode }
interface State { hasError: boolean; error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: any) {
    console.error('[ErrorBoundary]', error.message, info?.componentStack ?? '')
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{
          flex: 1, backgroundColor: Colors.background,
          justifyContent: 'center', alignItems: 'center', padding: 32,
        }}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>⚠️</Text>
          <Text style={{
            fontSize: 16, fontWeight: '700', color: Colors.textDark,
            marginBottom: 8, textAlign: 'center',
          }}>
            Algo deu errado nesta tela
          </Text>
          <Text style={{
            fontSize: 13, color: Colors.textMuted,
            marginBottom: 24, textAlign: 'center',
          }}>
            {this.state.error?.message}
          </Text>
          <TouchableOpacity
            onPress={() => this.setState({ hasError: false, error: null })}
            style={{
              backgroundColor: Colors.primary, borderRadius: 12,
              paddingHorizontal: 24, paddingVertical: 12,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      )
    }
    return this.props.children
  }
}
