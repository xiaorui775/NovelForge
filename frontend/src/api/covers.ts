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

export interface JobSubmitResponse {
  job_id: string;
  status: 'pending';
}

export const coversApi = {
  // 后端 /generate 已改为后台任务：立即返回 {job_id,status}，结果由 GET /jobs/{id} 取
  generate: (projectId: string, data: CoverImageGenerate) =>
    client.post<JobSubmitResponse>(`/projects/${projectId}/covers/generate`, data),

  list: (projectId: string) =>
    client.get<{ items: CoverImage[] }>(`/projects/${projectId}/covers`),

  select: (projectId: string, coverId: string) =>
    client.post<CoverImage>(`/projects/${projectId}/covers/${coverId}/select`),

  delete: (projectId: string, coverId: string) =>
    client.delete(`/projects/${projectId}/covers/${coverId}`),
};
