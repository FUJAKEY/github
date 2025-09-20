import { create } from 'zustand';

import { api } from '../utils/api.ts';

export interface AccountToken {
  id: string;
  userId: string;
  name: string;
  permission: 'read' | 'write';
  createdAt: string;
  lastUsedAt?: string;
}

interface AccountState {
  tokens: AccountToken[];
  loading: boolean;
  generatedToken: { token: AccountToken; secret: string } | null;
  fetchTokens: () => Promise<void>;
  createToken: (payload: { name: string; permission: 'read' | 'write' }) => Promise<{ token: AccountToken; secret: string }>;
  deleteToken: (tokenId: string) => Promise<void>;
  clearGenerated: () => void;
}

export const useAccountStore = create<AccountState>((set, get) => ({
  tokens: [],
  loading: false,
  generatedToken: null,
  async fetchTokens() {
    set({ loading: true });
    try {
      const response = await api.get('/users/me/tokens');
      set({ tokens: response.data.tokens, loading: false, generatedToken: null });
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },
  async createToken(payload) {
    set({ loading: true });
    try {
      const response = await api.post('/users/me/tokens', payload);
      const created: AccountToken = response.data.token;
      set((state) => ({
        tokens: [created, ...state.tokens],
        generatedToken: response.data,
        loading: false
      }));
      return response.data as { token: AccountToken; secret: string };
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },
  async deleteToken(tokenId) {
    await api.delete(`/users/me/tokens/${tokenId}`);
    set((state) => ({ tokens: state.tokens.filter((token) => token.id !== tokenId) }));
  },
  clearGenerated() {
    if (get().generatedToken) {
      set({ generatedToken: null });
    }
  }
}));
