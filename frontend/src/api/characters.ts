import client from './client';

export interface Character {
  id: string;
  name: string;
  role_type: string | null;
  description: string | null;
  personality: string | null;
  background: string | null;
  avatar: string | null;
  created_at: string;
  updated_at: string;
}

export interface CharacterCreate {
  name: string;
  role_type?: string;
  description?: string;
  personality?: string;
  background?: string;
}

export interface CharacterUpdate {
  name?: string;
  role_type?: string;
  description?: string;
  personality?: string;
  background?: string;
}

export interface CharacterRelation {
  id: string;
  from_character_id: string;
  to_character_id: string;
  relation_type: string;
  description: string | null;
  created_at: string;
}

export interface CharacterRelationCreate {
  from_character_id: string;
  to_character_id: string;
  relation_type: string;
  description?: string;
}

export const charactersApi = {
  list: () => client.get<Character[]>('/characters'),

  get: (id: string) => client.get<Character>(`/characters/${id}`),

  create: (data: CharacterCreate) => client.post<Character>('/characters', data),

  update: (id: string, data: CharacterUpdate) => client.put<Character>(`/characters/${id}`, data),

  delete: (id: string) => client.delete(`/characters/${id}`),

  listRelations: (characterId: string) =>
    client.get<CharacterRelation[]>(`/characters/${characterId}/relations`),

  createRelation: (data: CharacterRelationCreate) =>
    client.post<CharacterRelation>('/characters/relations', data),

  deleteRelation: (relationId: string) =>
    client.delete(`/characters/relations/${relationId}`),

  listAllRelations: () =>
    client.get<CharacterRelation[]>('/characters/relations/all'),
};
