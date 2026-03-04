export interface OpenAiStreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: [
    {
      index: 0;
      delta: {
        role?: 'assistant';
        content?: string;
      };
      finish_reason: 'stop' | null;
    },
  ];
}
