import client from './client';

export interface ModelConfig {
  id: string;
  name: string;
  provider: string;
  base_url: string;
  model_name: string;
  model_type: string;
  input_cost_per_1k: number;
  output_cost_per_1k: number;
  max_tokens: number;
  max_context_tokens: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ModelConfigCreate {
  name: string;
  provider?: string;
  base_url: string;
  api_key: string;
  model_name: string;
  model_type?: string;
  input_cost_per_1k?: number;
  output_cost_per_1k?: number;
  max_tokens?: number;
  max_context_tokens?: number;
}

export interface ModelConfigUpdate {
  name?: string;
  provider?: string;
  base_url?: string;
  api_key?: string;
  model_name?: string;
  model_type?: string;
  input_cost_per_1k?: number;
  output_cost_per_1k?: number;
  max_tokens?: number;
  max_context_tokens?: number;
  is_active?: boolean;
}

export interface ModelTestResponse {
  success: boolean;
  message: string;
  latency_ms: number | null;
}

export const modelsApi = {
  list: () => client.get<ModelConfig[]>('/models'),

  get: (id: string) => client.get<ModelConfig>(`/models/${id}`),

  create: (data: ModelConfigCreate) => client.post<ModelConfig>('/models', data),

  update: (id: string, data: ModelConfigUpdate) => client.put<ModelConfig>(`/models/${id}`, data),

  delete: (id: string) => client.delete(`/models/${id}`),

  test: (id: string) => client.post<ModelTestResponse>(`/models/${id}/test`),
};
