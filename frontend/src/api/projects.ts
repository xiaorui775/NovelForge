import client from './client';

export interface Project {
  id: string;
  name: string;
  genre: string | null;
  description: string | null;
  language: string;
  target_words_per_chapter_min: number;
  target_words_per_chapter_max: number;
  worldview_id: string | null;
  cover_image: string | null;
  status: string;
  style_reference: string | null;
  dialogue_ratio: number;
  tags: string[];
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectCreate {
  name: string;
  genre?: string;
  description?: string;
  language?: string;
  target_words_per_chapter_min?: number;
  target_words_per_chapter_max?: number;
  worldview_id?: string;
  style_reference?: string;
  dialogue_ratio?: number;
  tags?: string[];
}

export interface ProjectUpdate {
  name?: string;
  genre?: string;
  description?: string;
  language?: string;
  target_words_per_chapter_min?: number;
  target_words_per_chapter_max?: number;
  worldview_id?: string;
  style_reference?: string;
  dialogue_ratio?: number;
  status?: string;
  tags?: string[];
}

export interface ProjectStats {
  total_chapters: number;
  completed_chapters: number;
  total_words: number;
  progress_percent: number;
}

export interface TimelineEvent {
  id: string;
  status: string;
  token_input: number;
  token_output: number;
  cost: number;
  duration_ms: number;
  quality_score: number | null;
  model_name: string | null;
  chapter: {
    chapter_id: string;
    chapter_number: number;
    title: string | null;
    word_count: number;
  };
  created_at: string;
}

export const projectsApi = {
  list: (includeArchived = false) =>
    client.get<Project[]>(`/projects?include_archived=${includeArchived}`),

  get: (id: string) => client.get<Project>(`/projects/${id}`),

  create: (data: ProjectCreate) => client.post<Project>('/projects', data),

  update: (id: string, data: ProjectUpdate) => client.put<Project>(`/projects/${id}`, data),

  delete: (id: string) => client.delete(`/projects/${id}`),

  stats: (id: string) => client.get<ProjectStats>(`/projects/${id}/stats`),

  archive: (id: string) => client.post<Project>(`/projects/${id}/archive`),

  unarchive: (id: string) => client.post<Project>(`/projects/${id}/unarchive`),

  getTimeline: (id: string, limit = 50) =>
    client.get<TimelineEvent[]>(`/projects/${id}/timeline?limit=${limit}`),

  // Trash
  listTrash: () => client.get<Project[]>('/projects/trash'),

  restore: (id: string) => client.post<Project>(`/projects/${id}/restore`),

  permanentDelete: (id: string) => client.delete(`/projects/${id}/permanent`),

  cleanupTrash: (days = 30) => client.post<{ deleted_count: number }>(`/projects/trash/cleanup?days=${days}`),
};
