export type NFCeState = {
  code: string
  uf: string
  name: string
  portalUrl: string
  qrCodePath: string
  resultPath: string
  isFinalUrl: (url: string) => boolean
  isRedirectUrl: (url: string) => boolean
}

export const NFCE_STATES: Record<string, NFCeState> = {
  '33': {
    code: '33',
    uf: 'RJ',
    name: 'Rio de Janeiro',
    portalUrl: 'https://consultadfe.fazenda.rj.gov.br',
    qrCodePath: '/consultaNFCe/QRCode',
    resultPath: '/consultaNFCe/paginas/resultadoQRCode',
    isFinalUrl: (url) =>
      url.includes('resultadoQRCode') || url.includes('resultadoNfce'),
    isRedirectUrl: (url) =>
      url.includes('QRCode?p=') || url.includes('qrcode?p='),
  },

  '35': {
    code: '35',
    uf: 'SP',
    name: 'São Paulo',
    portalUrl: 'https://www.nfce.fazenda.sp.gov.br',
    qrCodePath: '/NFCeConsultaPublica/Paginas/ConsultaQRCode.aspx',
    resultPath: '/NFCeConsultaPublica',
    isFinalUrl: (url) =>
      url.includes('NFCeConsultaPublica') && !url.includes('QRCode'),
    isRedirectUrl: (url) =>
      url.includes('ConsultaQRCode') || url.includes('QRCode?p='),
  },

  '31': {
    code: '31',
    uf: 'MG',
    name: 'Minas Gerais',
    portalUrl: 'https://portalsped.fazenda.mg.gov.br',
    qrCodePath: '/portalnfce/system/pages/consultaNFCe',
    resultPath: '/portalnfce',
    isFinalUrl: (url) =>
      url.includes('portalnfce') && !url.includes('QRCode') && !url.includes('qrcode'),
    isRedirectUrl: (url) =>
      url.includes('QRCode') || url.includes('qrcode?p='),
  },
}

// Extract state code from QR Code data (URL or raw access key)
export function extractStateCode(qrData: string): string | null {
  try {
    // Format 1: URL with p=KEY|... parameter
    const paramMatch = qrData.match(/[?&]p=([^&|]+)/)
    if (paramMatch) {
      const chave = paramMatch[1].replace(/\D/g, '')
      if (chave.length >= 2) return chave.substring(0, 2)
    }

    // Format 2: domain-based detection
    if (qrData.includes('fazenda.rj') || qrData.includes('rj.gov')) return '33'
    if (qrData.includes('fazenda.sp') || qrData.includes('sp.gov')) return '35'
    if (qrData.includes('fazenda.mg') || qrData.includes('mg.gov')) return '31'

    // Format 3: raw 44-digit access key
    const onlyDigits = qrData.replace(/\D/g, '')
    if (onlyDigits.length >= 44) return onlyDigits.substring(0, 2)

    return null
  } catch {
    return null
  }
}

export function getStateByCode(code: string | null): NFCeState | null {
  if (!code) return null
  return NFCE_STATES[code] ?? null
}

export function isStateSupported(code: string | null): boolean {
  return code !== null && code in NFCE_STATES
}

export const STATE_NAMES: Record<string, string> = {
  '11': 'Rondônia', '12': 'Acre', '13': 'Amazonas', '14': 'Roraima',
  '15': 'Pará', '16': 'Amapá', '17': 'Tocantins', '21': 'Maranhão',
  '22': 'Piauí', '23': 'Ceará', '24': 'Rio Grande do Norte', '25': 'Paraíba',
  '26': 'Pernambuco', '27': 'Alagoas', '28': 'Sergipe', '29': 'Bahia',
  '31': 'Minas Gerais', '32': 'Espírito Santo', '33': 'Rio de Janeiro',
  '35': 'São Paulo', '41': 'Paraná', '42': 'Santa Catarina',
  '43': 'Rio Grande do Sul', '50': 'Mato Grosso do Sul', '51': 'Mato Grosso',
  '52': 'Goiás', '53': 'Distrito Federal',
}
