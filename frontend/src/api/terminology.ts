import client from './client';

export interface Terminology {
  id: string;
  project_id: string;
  term: string;
  category: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface TerminologyCreate {
  term: string;
  category?: string;
  description?: string;
}

export interface TerminologyUpdate {
  term?: string;
  category?: string;
  description?: string;
}

export const terminologyApi = {
  list: (projectId: string) =>
    client.get<Terminology[]>(`/projects/${projectId}/terminology`),

  create: (projectId: string, data: TerminologyCreate) =>
    client.post<Terminology>(`/projects/${projectId}/terminology`, data),

  update: (id: string, data: TerminologyUpdate) =>
    client.put<Terminology>(`/terminology/${id}`, data),

  delete: (id: string) => client.delete(`/terminology/${id}`),
};
