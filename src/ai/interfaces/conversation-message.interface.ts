export interface ConversationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
