import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class OpenAiMessageSchema {
  @ApiProperty({ enum: ['assistant'], example: 'assistant' })
  role!: string;

  @ApiProperty({
    description: 'Response content from the AI assistant',
    example: 'This image shows a mountain landscape with a clear blue sky.',
  })
  content!: string;
}

class OpenAiChoiceSchema {
  @ApiProperty({ description: 'Choice index (always 0)', example: 0 })
  index!: number;

  @ApiProperty({ type: OpenAiMessageSchema })
  message!: OpenAiMessageSchema;

  @ApiProperty({
    description: 'Reason the model stopped generating',
    enum: ['stop', 'length'],
    example: 'stop',
  })
  finish_reason!: string;
}

class OpenAiUsageSchema {
  @ApiProperty({ description: 'Tokens in the prompt', example: 150 })
  prompt_tokens!: number;

  @ApiProperty({ description: 'Tokens in the completion', example: 200 })
  completion_tokens!: number;

  @ApiProperty({ description: 'Total tokens used', example: 350 })
  total_tokens!: number;
}

export class OpenAiChatCompletionSchema {
  @ApiProperty({
    description: 'Unique completion identifier',
    example: 'chatcmpl-abc123def456ghi789jkl012mno',
  })
  id!: string;

  @ApiProperty({ enum: ['chat.completion'], example: 'chat.completion' })
  object!: string;

  @ApiProperty({
    description: 'Unix timestamp (seconds) when the completion was created',
    example: 1709554800,
  })
  created!: number;

  @ApiProperty({ description: 'Model used for the completion', example: 'gpt-4o' })
  model!: string;

  @ApiProperty({ type: [OpenAiChoiceSchema] })
  choices!: OpenAiChoiceSchema[];

  @ApiProperty({ type: OpenAiUsageSchema })
  usage!: OpenAiUsageSchema;
}

class StreamDeltaSchema {
  @ApiPropertyOptional({
    description: 'Role (present only in first chunk)',
    enum: ['assistant'],
    example: 'assistant',
  })
  role?: string;

  @ApiPropertyOptional({
    description: 'Content token (present in content chunks)',
    example: 'This',
  })
  content?: string;
}

class StreamChoiceSchema {
  @ApiProperty({ description: 'Choice index (always 0)', example: 0 })
  index!: number;

  @ApiProperty({ type: StreamDeltaSchema })
  delta!: StreamDeltaSchema;

  @ApiProperty({
    description: 'null until final chunk, then "stop"',
    nullable: true,
    enum: ['stop', null],
    example: null,
  })
  finish_reason!: string | null;
}

export class OpenAiStreamChunkSchema {
  @ApiProperty({ example: 'chatcmpl-abc123def456ghi789jkl012mno' })
  id!: string;

  @ApiProperty({
    enum: ['chat.completion.chunk'],
    example: 'chat.completion.chunk',
  })
  object!: string;

  @ApiProperty({
    description: 'Unix timestamp (seconds)',
    example: 1709554800,
  })
  created!: number;

  @ApiProperty({ example: 'gpt-4o' })
  model!: string;

  @ApiProperty({ type: [StreamChoiceSchema] })
  choices!: StreamChoiceSchema[];
}
