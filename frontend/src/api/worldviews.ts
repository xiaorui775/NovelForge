import client from './client';
import { Character } from './characters';

export interface Worldview {
  id: string;
  name: string;
  description: string | null;
  rules: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorldviewCreate {
  name: string;
  description?: string;
  rules?: string;
}

export interface WorldviewUpdate {
  name?: string;
  description?: string;
  rules?: string;
}

export const worldviewsApi = {
  list: () => client.get<Worldview[]>('/worldviews'),

  get: (id: string) => client.get<Worldview>(`/worldviews/${id}`),

  create: (data: WorldviewCreate) => client.post<Worldview>('/worldviews', data),

  update: (id: string, data: WorldviewUpdate) => client.put<Worldview>(`/worldviews/${id}`, data),

  delete: (id: string) => client.delete(`/worldviews/${id}`),

  addCharacter: (worldviewId: string, characterId: string) =>
    client.post(`/worldviews/${worldviewId}/characters/${characterId}`),

  removeCharacter: (worldviewId: string, characterId: string) =>
    client.delete(`/worldviews/${worldviewId}/characters/${characterId}`),

  getCharacters: (worldviewId: string) =>
    client.get<Character[]>(`/worldviews/${worldviewId}/characters`),
};
