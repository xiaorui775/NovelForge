import client from './client';

export interface PromptTemplate {
  id: string;
  name: string;
  type: string;
  content: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface PromptTemplateCreate {
  name: string;
  type: string;
  content: string;
  is_default?: boolean;
}

export interface PromptTemplateUpdate {
  name?: string;
  type?: string;
  content?: string;
  is_default?: boolean;
}

export const promptTemplatesApi = {
  list: (type?: string) => client.get<PromptTemplate[]>('/prompt-templates', { params: type ? { type } : {} }),

  get: (id: string) => client.get<PromptTemplate>(`/prompt-templates/${id}`),

  create: (data: PromptTemplateCreate) => client.post<PromptTemplate>('/prompt-templates', data),

  update: (id: string, data: PromptTemplateUpdate) => client.put<PromptTemplate>(`/prompt-templates/${id}`, data),

  delete: (id: string) => client.delete(`/prompt-templates/${id}`),

  setDefault: (id: string) => client.post<PromptTemplate>(`/prompt-templates/${id}/set-default`),
};
