const GOAL_ICONS: Record<string, string> = {
  viagem: '✈️', viagens: '✈️', europa: '✈️', eua: '✈️', japão: '✈️',
  férias: '🏖️', ferias: '🏖️', praia: '🏖️',
  mochilão: '🎒', mochilao: '🎒',
  imóvel: '🏠', imovel: '🏠', casa: '🏠',
  apartamento: '🏢', entrada: '🔑', reforma: '🔨',
  carro: '🚗', moto: '🏍️', veículo: '🚗', veiculo: '🚗',
  educação: '🎓', educacao: '🎓', faculdade: '🎓', curso: '📚',
  mestrado: '🎓', doutorado: '🎓',
  intercâmbio: '🌍', intercambio: '🌍',
  emergência: '🛡️', emergencia: '🛡️', reserva: '🛡️',
  segurança: '🔒', seguranca: '🔒',
  aposentadoria: '🏆', independência: '🏆', independencia: '🏆',
  liberdade: '🕊️', financeira: '📈',
  negócio: '💼', negocio: '💼', empresa: '🏭',
  investimento: '📈', investimentos: '📈',
  computador: '💻', notebook: '💻', celular: '📱', tecnologia: '📱',
  filho: '👶', filhos: '👶', família: '👨‍👩‍👧', familia: '👨‍👩‍👧',
  casamento: '💍', festa: '🎉',
  saúde: '❤️', saude: '❤️', tratamento: '💊', cirurgia: '🏥',
  sonho: '⭐', objetivo: '🎯', meta: '🎯',
}

export function getGoalIcon(name: string): string {
  const lower = name.toLowerCase()
  const key = Object.keys(GOAL_ICONS).find(k => lower.includes(k))
  return key ? GOAL_ICONS[key] : '🎯'
}
