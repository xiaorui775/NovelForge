import client from './client';

export interface StoryBibleEntry {
  id: string;
  project_id: string;
  category: string;
  title: string;
  content: string;
  tags: string;
  created_at: string;
  updated_at: string;
}

export interface StoryBibleCreate {
  title: string;
  content?: string;
  category?: string;
  tags?: string;
}

export interface StoryBibleUpdate {
  title?: string;
  content?: string;
  category?: string;
  tags?: string;
}

export const BIBLE_CATEGORIES = [
  { value: 'character', label: '角色' },
  { value: 'worldview', label: '世界观' },
  { value: 'plot', label: '情节' },
  { value: 'timeline', label: '时间线' },
  { value: 'custom', label: '自定义' },
];

export const storyBibleApi = {
  list: (projectId: string, category?: string) => {
    const params = category ? `?category=${category}` : '';
    return client.get<StoryBibleEntry[]>(`/projects/${projectId}/story-bible${params}`);
  },

  get: (id: string) => client.get<StoryBibleEntry>(`/story-bible/${id}`),

  create: (projectId: string, data: StoryBibleCreate) =>
    client.post<StoryBibleEntry>(`/projects/${projectId}/story-bible`, data),

  update: (id: string, data: StoryBibleUpdate) =>
    client.put<StoryBibleEntry>(`/story-bible/${id}`, data),

  delete: (id: string) => client.delete(`/story-bible/${id}`),

  search: (projectId: string, query: string) =>
    client.get<StoryBibleEntry[]>(`/story-bible/search?project_id=${projectId}&q=${encodeURIComponent(query)}`),
};
