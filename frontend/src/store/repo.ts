import { create } from 'zustand';
import { api } from '../utils/api.ts';

export interface RepoSummary {
  id: string;
  name: string;
  description: string;
  private: boolean;
  createdAt: string;
  defaultBranch: string;
  permission: 'owner' | 'write' | 'read';
  inviteCode?: string;
  collaborators: Array<{ userId: string; role: string; invitedAt?: string }>;
}

export interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'dir';
  children?: TreeNode[];
}

export interface BranchInfo {
  name: string;
  isDefault: boolean;
  isCurrent: boolean;
}

export interface CommitInfo {
  oid: string;
  message: string;
  committedAt: string;
  author: { name: string; email: string };
}

interface RepoState {
  repos: RepoSummary[];
  reposLoading: boolean;
  currentRepo: RepoSummary | null;
  tree: TreeNode[];
  currentBranch: string | null;
  branches: BranchInfo[];
  commits: CommitInfo[];
  selectedFile?: { path: string; content: string; branch: string };
  diff?: string;
  fetchRepos: () => Promise<void>;
  createRepo: (payload: { name: string; description?: string; private?: boolean }) => Promise<RepoSummary>;
  loadRepo: (repoId: string) => Promise<void>;
  fetchTree: (repoId: string, branch: string, path?: string) => Promise<TreeNode[]>;
  fetchBranches: (repoId: string) => Promise<void>;
  fetchCommits: (repoId: string, branch: string) => Promise<void>;
  loadFile: (repoId: string, branch: string, path: string) => Promise<void>;
  saveFile: (repoId: string, payload: { path: string; branch: string; content: string; message: string }) => Promise<void>;
  deleteFile: (repoId: string, payload: { path: string; branch: string; message?: string }) => Promise<void>;
  createFolder: (repoId: string, payload: { path: string }) => Promise<void>;
  createBranch: (repoId: string, payload: { name: string; from?: string }) => Promise<void>;
  deleteBranch: (repoId: string, name: string) => Promise<void>;
  checkoutBranch: (repoId: string, branch: string) => Promise<void>;
  downloadArchive: (repoId: string, branch: string) => Promise<void>;
  fetchDiff: (repoId: string, from: string, to: string) => Promise<string>;
  updateRepo: (
    repoId: string,
    payload: { name?: string; description?: string; private?: boolean; rotateInviteCode?: boolean }
  ) => Promise<void>;
  removeCollaborator: (repoId: string, userId: string) => Promise<void>;
  clearCurrent: () => void;
}

export const useRepoStore = create<RepoState>((set, get) => ({
  repos: [],
  reposLoading: false,
  currentRepo: null,
  tree: [],
  currentBranch: null,
  branches: [],
  commits: [],
  selectedFile: undefined,
  diff: undefined,
  async fetchRepos() {
    set({ reposLoading: true });
    try {
      const response = await api.get('/repos');
      set({ repos: response.data.items, reposLoading: false });
    } catch (error) {
      set({ reposLoading: false });
      throw error;
    }
  },
  async createRepo(payload) {
    const response = await api.post('/repos', payload);
    const repo: RepoSummary = response.data.repo;
    set((state) => ({ repos: [repo, ...state.repos] }));
    return repo;
  },
  async loadRepo(repoId) {
    const response = await api.get(`/repos/${repoId}`);
    const repo: RepoSummary = response.data.repo;
    set({ currentRepo: repo, currentBranch: repo.defaultBranch });
  },
  async fetchTree(repoId, branch, path = '') {
    const response = await api.get(`/repos/${repoId}/tree`, { params: { branch, path } });
    set({ tree: response.data.tree, currentBranch: branch });
    return response.data.tree as TreeNode[];
  },
  async fetchBranches(repoId) {
    const response = await api.get(`/repos/${repoId}/branches`);
    set({ branches: response.data.branches, currentBranch: response.data.current });
  },
  async fetchCommits(repoId, branch) {
    const response = await api.get(`/repos/${repoId}/commits`, { params: { branch } });
    set({ commits: response.data.commits });
  },
  async loadFile(repoId, branch, path) {
    const response = await api.get(`/repos/${repoId}/file`, { params: { branch, path } });
    set({ selectedFile: { path, content: response.data.content, branch } });
  },
  async saveFile(repoId, payload) {
    await api.put(`/repos/${repoId}/file`, payload);
    await get().loadFile(repoId, payload.branch, payload.path);
    await get().fetchCommits(repoId, payload.branch);
  },
  async deleteFile(repoId, payload) {
    await api.delete(`/repos/${repoId}/file`, { params: payload });
    set({ selectedFile: undefined });
    await get().fetchCommits(repoId, payload.branch);
  },
  async createFolder(repoId, payload) {
    await api.post(`/repos/${repoId}/folder`, payload);
    const branch = get().currentBranch ?? get().currentRepo?.defaultBranch ?? 'main';
    await get().fetchTree(repoId, branch, '');
  },
  async createBranch(repoId, payload) {
    await api.post(`/repos/${repoId}/branches`, payload);
    await get().fetchBranches(repoId);
  },
  async deleteBranch(repoId, name) {
    await api.delete(`/repos/${repoId}/branches/${name}`);
    await get().fetchBranches(repoId);
  },
  async checkoutBranch(repoId, branch) {
    await api.post(`/repos/${repoId}/checkout`, { branch });
    set({ currentBranch: branch });
  },
  async downloadArchive(repoId, branch) {
    const response = await api.get(`/repos/${repoId}/archive.zip`, {
      params: { branch },
      responseType: 'blob'
    });
    const blob = new Blob([response.data], { type: 'application/zip' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${get().currentRepo?.name ?? 'repo'}-${branch}.zip`;
    link.click();
    window.URL.revokeObjectURL(url);
  },
  async fetchDiff(repoId, from, to) {
    const response = await api.get(`/repos/${repoId}/diff`, { params: { from, to } });
    set({ diff: response.data.diff });
    return response.data.diff as string;
  },
  async updateRepo(repoId, payload) {
    const response = await api.patch(`/repos/${repoId}`, payload);
    set({ currentRepo: response.data.repo });
    set((state) => ({
      repos: state.repos.map((repo) => (repo.id === repoId ? response.data.repo : repo))
    }));
  },
  async removeCollaborator(repoId, userId) {
    await api.delete(`/repos/${repoId}/collaborators/${userId}`);
    await get().loadRepo(repoId);
  },
  clearCurrent() {
    set({
      currentRepo: null,
      tree: [],
      commits: [],
      branches: [],
      selectedFile: undefined
    });
  }
}));
