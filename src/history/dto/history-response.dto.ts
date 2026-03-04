export interface HistoryMessageResponse {
  id: string;
  role: string;
  content: string;
  timestamp: string;
}

export interface HistoryResponse {
  imageId: string;
  messages: HistoryMessageResponse[];
  totalMessages: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
