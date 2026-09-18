// Mock simples de AsyncStorage para os testes (armazena em memória).
const store: Record<string, string> = {}

export default {
  getItem: jest.fn((k: string) => Promise.resolve(store[k] ?? null)),
  setItem: jest.fn((k: string, v: string) => { store[k] = v; return Promise.resolve() }),
  removeItem: jest.fn((k: string) => { delete store[k]; return Promise.resolve() }),
  getMany: jest.fn((ks: string[]) => Promise.resolve(ks.map(k => [k, store[k] ?? null]))),
  clear: jest.fn(() => { for (const k of Object.keys(store)) delete store[k]; return Promise.resolve() }),
}
