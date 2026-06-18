import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import { Platform, Alert } from 'react-native'

/**
 * Salva um arquivo na pasta escolhida pelo usuário via SAF (Android)
 * ou abre o share sheet como fallback (iOS / permissão negada).
 */
export async function saveToDownloads(
  sourceUri: string,
  fileName: string,
  mimeType: string = 'application/pdf',
): Promise<void> {
  try {
    if (Platform.OS === 'android') {
      const permissions =
        await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync()

      if (permissions.granted) {
        const fileContent = await FileSystem.readAsStringAsync(sourceUri, {
          encoding: FileSystem.EncodingType.Base64,
        })
        const destinationUri =
          await FileSystem.StorageAccessFramework.createFileAsync(
            permissions.directoryUri,
            fileName,
            mimeType,
          )
        await FileSystem.writeAsStringAsync(destinationUri, fileContent, {
          encoding: FileSystem.EncodingType.Base64,
        })
        Alert.alert('✅ Arquivo salvo!', `"${fileName}" foi salvo na pasta selecionada.`)
        return
      }
    }

    // iOS ou usuário cancelou o seletor de pasta — compartilhar
    await Sharing.shareAsync(sourceUri, {
      mimeType,
      dialogTitle: `Salvar ${fileName}`,
      UTI: mimeType === 'application/pdf' ? 'com.adobe.pdf' : 'public.data',
    })
  } catch (err) {
    console.error('[saveToDownloads] Erro:', String(err))
    try {
      await Sharing.shareAsync(sourceUri)
    } catch {
      Alert.alert('Erro', 'Não foi possível salvar o arquivo.')
    }
  }
}
