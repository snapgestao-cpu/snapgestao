/**
 * Bancos suportados para importação de extrato bancário (PDF).
 *
 * Para adicionar suporte a um novo banco, basta acrescentar uma entrada
 * aqui e implementar o parsing correspondente na Edge Function
 * `parse-bank-statement` (o `id` é a chave usada no backend).
 */

export type SupportedBank = {
  id: string
  name: string
}

export const SUPPORTED_BANKS: SupportedBank[] = [
  { id: 'bradesco', name: 'Bradesco' },
]
