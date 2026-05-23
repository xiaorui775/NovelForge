import client from './client';

export interface Foreshadowing {
  id: string;
  project_id: string;
  description: string;
  plant_chapter_id: string | null;
  resolution_chapter_id: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ForeshadowingCreate {
  description: string;
  plant_chapter_id?: string;
  resolution_chapter_id?: string;
  status?: string;
  notes?: string;
}

export interface ForeshadowingUpdate {
  description?: string;
  plant_chapter_id?: string;
  resolution_chapter_id?: string;
  status?: string;
  notes?: string;
}

export interface ForeshadowingScanResult {
  description: string;
  plant_chapter_number: number;
  plant_chapter_id: string | null;
  confidence: number;
}

export const foreshadowingApi = {
  list: (projectId: string) =>
    client.get<Foreshadowing[]>(`/projects/${projectId}/foreshadowings`),

  create: (projectId: string, data: ForeshadowingCreate) =>
    client.post<Foreshadowing>(`/projects/${projectId}/foreshadowings`, data),

  update: (id: string, data: ForeshadowingUpdate) =>
    client.put<Foreshadowing>(`/foreshadowings/${id}`, data),

  delete: (id: string) =>
    client.delete(`/foreshadowings/${id}`),

  scan: (projectId: string, modelId: string) =>
    client.post<ForeshadowingScanResult[]>(`/projects/${projectId}/foreshadowings/scan`, { model_id: modelId }, { timeout: 180000 }),
};
