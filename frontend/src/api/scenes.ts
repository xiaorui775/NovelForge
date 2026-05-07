import client from './client';

export interface Scene {
  id: string;
  chapter_id: string;
  scene_number: number;
  location: string;
  time: string;
  pov_character_id: string | null;
  summary: string;
  mood: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export const scenesApi = {
  list: (chapterId: string) => client.get<Scene[]>(`/chapters/${chapterId}/scenes`),
  create: (chapterId: string, data: Partial<Scene>) =>
    client.post<Scene>(`/chapters/${chapterId}/scenes`, data),
  update: (chapterId: string, sceneId: string, data: Partial<Scene>) =>
    client.put<Scene>(`/chapters/${chapterId}/scenes/${sceneId}`, data),
  delete: (chapterId: string, sceneId: string) =>
    client.delete(`/chapters/${chapterId}/scenes/${sceneId}`),
  reorder: (chapterId: string, sceneIds: string[]) =>
    client.put(`/chapters/${chapterId}/scenes/reorder`, sceneIds),
};
