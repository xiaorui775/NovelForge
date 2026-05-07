import client from './client';

export interface SearchResult {
  projects: { id: string; name: string; description: string; type: string }[];
  chapters: { id: string; project_id: string; snippet: string; type: string }[];
  characters: { id: string; name: string; description: string; type: string }[];
  terminology: { id: string; term: string; description: string; project_id: string; type: string }[];
}

export const searchApi = {
  search: (q: string, limit = 5) =>
    client.get<SearchResult>('/search', { params: { q, limit } }),
};
