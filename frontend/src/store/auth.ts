import { create } from 'zustand';
import { api } from '../utils/api.ts';

export interface User {
  id: string;
  email: string;
  role: string;
  createdAt: string;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  initialized: boolean;
  fetchCurrentUser: () => Promise<void>;
  login: (payload: { email: string; password: string }) => Promise<void>;
  register: (payload: { email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  initialized: false,
  async fetchCurrentUser() {
    set({ loading: true });
    try {
      const response = await api.get('/users/me');
      set({ user: response.data.user, loading: false, initialized: true });
    } catch (error) {
      set({ user: null, loading: false, initialized: true });
    }
  },
  async login(payload) {
    set({ loading: true });
    try {
      const response = await api.post('/auth/login', payload);
      set({ user: response.data.user, loading: false, initialized: true });
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },
  async register(payload) {
    set({ loading: true });
    try {
      const response = await api.post('/auth/register', payload);
      set({ user: response.data.user, loading: false, initialized: true });
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },
  async logout() {
    await api.post('/auth/logout');
    set({ user: null });
  }
}));
