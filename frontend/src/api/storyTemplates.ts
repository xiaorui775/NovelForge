import client from './client';

export interface StoryPhase {
  name: string;
  ratio: number;
  description: string;
  guides: string[];
}

export interface StoryTemplate {
  id: string;
  name: string;
  description: string;
  structure: { phases: StoryPhase[] };
  genre_hint: string;
  is_builtin: boolean;
  created_at: string;
}

export const storyTemplatesApi = {
  list: () => client.get<StoryTemplate[]>('/story-templates'),
  get: (id: string) => client.get<StoryTemplate>(`/story-templates/${id}`),
  create: (data: { name: string; description: string; structure: object; genre_hint?: string }) =>
    client.post<StoryTemplate>('/story-templates', data),
  delete: (id: string) => client.delete(`/story-templates/${id}`),
  apply: (projectId: string, templateId: string, totalChapters: number) =>
    client.post<{ outline_id: string; chapter_count: number }>('/story-templates/apply', {
      project_id: projectId,
      template_id: templateId,
      total_chapters: totalChapters,
    }),
};
