import client from './client';

export interface CoverImage {
  id: string;
  project_id: string;
  image_url: string;
  prompt: string;
  revised_prompt?: string;
  model_id?: string;
  style?: string;
  is_selected: boolean;
  created_at: string;
}

export interface CoverImageGenerate {
  prompt: string;
  model_id: string;
  size?: string;
  quality?: string;
  style?: string;
}

export const coversApi = {
  generate: (projectId: string, data: CoverImageGenerate) =>
    client.post<CoverImage>(`/projects/${projectId}/covers/generate`, data, { timeout: 180000 }),

  list: (projectId: string) =>
    client.get<{ items: CoverImage[] }>(`/projects/${projectId}/covers`),

  select: (projectId: string, coverId: string) =>
    client.post<CoverImage>(`/projects/${projectId}/covers/${coverId}/select`),

  delete: (projectId: string, coverId: string) =>
    client.delete(`/projects/${projectId}/covers/${coverId}`),
};
