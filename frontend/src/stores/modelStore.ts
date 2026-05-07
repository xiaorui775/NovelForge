import { create } from 'zustand';
import { modelsApi, ModelConfig, ModelConfigCreate, ModelConfigUpdate } from '../api/models';

interface ModelState {
  models: ModelConfig[];
  loading: boolean;
  error: string | null;

  fetchModels: () => Promise<void>;
  createModel: (data: ModelConfigCreate) => Promise<ModelConfig>;
  updateModel: (id: string, data: ModelConfigUpdate) => Promise<void>;
  deleteModel: (id: string) => Promise<void>;
  testModel: (id: string) => Promise<{ success: boolean; message: string; latency_ms: number | null }>;
}

let _modelsFetching = false;

export const useModelState = create<ModelState>((set) => ({
  models: [],
  loading: false,
  error: null,

  fetchModels: async () => {
    if (_modelsFetching) return;
    _modelsFetching = true;
    set({ loading: true, error: null });
    try {
      const { data } = await modelsApi.list();
      set({ models: data, loading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '获取模型列表失败';
      set({ error: message, loading: false });
    } finally {
      _modelsFetching = false;
    }
  },

  createModel: async (data: ModelConfigCreate) => {
    const { data: model } = await modelsApi.create(data);
    set((state) => ({ models: [...state.models, model] }));
    return model;
  },

  updateModel: async (id: string, data: ModelConfigUpdate) => {
    const { data: model } = await modelsApi.update(id, data);
    set((state) => ({
      models: state.models.map((m) => (m.id === id ? model : m)),
    }));
  },

  deleteModel: async (id: string) => {
    await modelsApi.delete(id);
    set((state) => ({
      models: state.models.filter((m) => m.id !== id),
    }));
  },

  testModel: async (id: string) => {
    const { data } = await modelsApi.test(id);
    return data;
  },
}));
