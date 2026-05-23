import client from './client';

export interface SeriesProjectItem {
  id: string;
  name: string;
  genre: string | null;
  status: string;
  sort_order: number;
  cover_image: string | null;
}

export interface Series {
  id: string;
  name: string;
  description: string | null;
  projects: SeriesProjectItem[];
  created_at: string;
  updated_at: string;
}

export interface SeriesCreate {
  name: string;
  description?: string;
  project_ids?: string[];
}

export interface SeriesUpdate {
  name?: string;
  description?: string;
}

export const seriesApi = {
  list: () => client.get<Series[]>('/series'),
  get: (id: string) => client.get<Series>(`/series/${id}`),
  create: (data: SeriesCreate) => client.post<Series>('/series', data),
  update: (id: string, data: SeriesUpdate) => client.put<Series>(`/series/${id}`, data),
  delete: (id: string) => client.delete(`/series/${id}`),
  addProject: (seriesId: string, projectId: string) =>
    client.post(`/series/${seriesId}/projects/${projectId}`),
  removeProject: (seriesId: string, projectId: string) =>
    client.delete(`/series/${seriesId}/projects/${projectId}`),
  reorder: (seriesId: string, projectIds: string[]) =>
    client.put(`/series/${seriesId}/reorder`, { project_ids: projectIds }),
};
