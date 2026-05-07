import client from './client';

export interface ProjectNote {
  id: string;
  project_id: string;
  title: string;
  content: string;
  category: string;
  created_at: string;
  updated_at: string;
}

export interface NoteCreate {
  title: string;
  content?: string;
  category?: string;
}

export interface NoteUpdate {
  title?: string;
  content?: string;
  category?: string;
}

export const CATEGORIES = [
  { value: 'general', label: '通用' },
  { value: 'inspiration', label: '灵感' },
  { value: 'research', label: '资料' },
  { value: 'setting', label: '设定' },
  { value: 'todo', label: '待办' },
];

export const notesApi = {
  list: (projectId: string, category?: string) => {
    const params = category ? `?category=${category}` : '';
    return client.get<ProjectNote[]>(`/projects/${projectId}/notes${params}`);
  },

  get: (id: string) => client.get<ProjectNote>(`/notes/${id}`),

  create: (projectId: string, data: NoteCreate) =>
    client.post<ProjectNote>(`/projects/${projectId}/notes`, data),

  update: (id: string, data: NoteUpdate) =>
    client.put<ProjectNote>(`/notes/${id}`, data),

  delete: (id: string) => client.delete(`/notes/${id}`),
};
