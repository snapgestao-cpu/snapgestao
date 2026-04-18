const POT_ICONS: Record<string, string> = {
  // Alimentação
  'alimentação': '🍽️', 'alimentacao': '🍽️',
  'mercado': '🛒', 'supermercado': '🛒',
  'restaurante': '🍴', 'lanches': '🍔', 'delivery': '🛵',

  // Moradia
  'moradia': '🏠', 'aluguel': '🏠', 'casa': '🏡',
  'condomínio': '🏢', 'condimínio': '🏢',
  'água': '💧', 'luz': '💡', 'energia': '💡',
  'internet': '📶', 'gás': '🔥',

  // Transporte
  'transporte': '🚗', 'combustível': '⛽', 'combustivel': '⛽',
  'uber': '🚕', 'táxi': '🚕', 'taxi': '🚕',
  'ônibus': '🚌', 'onibus': '🚌',
  'metrô': '🚇', 'metro': '🚇',
  'estacionamento': '🅿️', 'pedágio': '🛣️', 'pedagio': '🛣️',

  // Saúde
  'saúde': '❤️', 'saude': '❤️',
  'farmácia': '💊', 'farmacia': '💊',
  'médico': '🏥', 'medico': '🏥', 'academia': '💪',
  'dentista': '🦷', 'plano de saúde': '🏥', 'plano de saude': '🏥',

  // Educação
  'educação': '📚', 'educacao': '📚',
  'escola': '🎓', 'faculdade': '🎓', 'universidade': '🎓',
  'curso': '📖', 'livros': '📕', 'material escolar': '✏️',

  // Lazer e entretenimento
  'lazer': '🎉', 'entretenimento': '🎬', 'cinema': '🎬',
  'streaming': '📺', 'netflix': '📺',
  'spotify': '🎵', 'música': '🎵', 'musica': '🎵',
  'jogos': '🎮', 'games': '🎮',
  'viagem': '✈️', 'viagens': '✈️', 'hotel': '🏨',
  'passeios': '🗺️', 'festas': '🥳', 'bar': '🍺', 'balada': '🎶',

  // Vestuário
  'vestuário': '👕', 'vestuario': '👕', 'roupas': '👔',
  'calçados': '👟', 'calcados': '👟',
  'acessórios': '👜', 'acessorios': '👜',

  // Pets
  'pet': '🐾', 'pets': '🐾', 'animal': '🐶',
  'veterinário': '🐾', 'veterinario': '🐾',
  'ração': '🦴', 'racao': '🦴',

  // Finanças e investimentos
  'investimento': '📈', 'investimentos': '📈',
  'poupança': '🏦', 'poupanca': '🏦',
  'reserva': '🛡️', 'emergência': '🛡️', 'emergencia': '🛡️',
  'meta': '🎯', 'metas': '🎯',
  'cartão': '💳', 'cartao': '💳',
  'dívida': '📋', 'divida': '📋',

  // Beleza e cuidados
  'beleza': '💄', 'salão': '💇', 'salao': '💇',
  'barbearia': '✂️', 'cabelo': '💇',
  'estética': '💅', 'estetica': '💅',

  // Tecnologia
  'tecnologia': '💻', 'eletrônicos': '📱', 'eletronicos': '📱',
  'celular': '📱', 'computador': '💻',
  'assinatura': '📋', 'assinaturas': '📋',

  // Família e filhos
  'família': '👨‍👩‍👧', 'familia': '👨‍👩‍👧',
  'filhos': '👶', 'criança': '👶', 'crianca': '👶',
  'escola dos filhos': '🎒', 'mesada': '🪙',

  // Presentes e doações
  'presentes': '🎁', 'presente': '🎁',
  'doação': '❤️', 'doacao': '❤️', 'caridade': '🤝',

  // Outros
  'outros': '📦', 'diverso': '📦', 'diversos': '📦',
  'geral': '📦', 'extra': '⭐', 'extras': '⭐',
}

export function getPotIcon(name: string): string {
  const lower = name.toLowerCase().trim()
  if (!lower) return '💰'
  if (POT_ICONS[lower]) return POT_ICONS[lower]
  const match = Object.keys(POT_ICONS).find(
    (key) => lower.includes(key) || key.includes(lower)
  )
  return match ? POT_ICONS[match] : '💰'
}
