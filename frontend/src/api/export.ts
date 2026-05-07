export interface ExportFormat {
  format: string;
  display_name: string;
  extension: string;
}

export interface ExportOptions {
  include_toc?: boolean;
  include_cover?: boolean;
  chapter_start?: number;
  chapter_end?: number;
  paper_size?: string;
}

export const exportApi = {
  listFormats: async (): Promise<ExportFormat[]> => {
    const response = await fetch('/api/projects/00000000-0000-0000-0000-000000000000/export/formats');
    if (!response.ok) throw new Error('获取格式列表失败');
    return response.json();
  },

  download: async (projectId: string, format: string, options?: ExportOptions) => {
    const params = new URLSearchParams();
    if (options) {
      if (options.include_toc !== undefined) params.set('include_toc', String(options.include_toc));
      if (options.include_cover !== undefined) params.set('include_cover', String(options.include_cover));
      if (options.chapter_start !== undefined) params.set('chapter_start', String(options.chapter_start));
      if (options.chapter_end !== undefined) params.set('chapter_end', String(options.chapter_end));
      if (options.paper_size) params.set('paper_size', options.paper_size);
    }
    const qs = params.toString();
    const url = `/api/projects/${projectId}/export/${format}${qs ? `?${qs}` : ''}`;
    const response = await fetch(url);
    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: '导出失败' }));
      throw new Error(err.detail || '导出失败');
    }
    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition');
    const filename = disposition?.match(/filename="?(.+?)"?$/)?.[1] || `project-${projectId.slice(0, 8)}.${format}`;
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(downloadUrl);
  },

  downloadTxt: async (projectId: string, options?: ExportOptions) => {
    return exportApi.download(projectId, 'txt', options);
  },

  downloadEpub: async (projectId: string, options?: ExportOptions) => {
    return exportApi.download(projectId, 'epub', options);
  },
};
