import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ChatRequestDto } from '@/chat/dto/chat-request.dto';

function toDto(plain: Record<string, unknown>): ChatRequestDto {
  return plainToInstance(ChatRequestDto, plain);
}

describe('ChatRequestDto', () => {
  it('should accept a normal message', async () => {
    const dto = toDto({ message: 'Hello, world!' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.message).toBe('Hello, world!');
  });

  it('should trim whitespace', async () => {
    const dto = toDto({ message: '  Hello  ' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.message).toBe('Hello');
  });

  it('should strip control characters but keep tabs and newlines', async () => {
    // \x01 (SOH) should be stripped, \t and \n should remain
    const dto = toDto({ message: 'line1\tcolumn\nline2\x01gone' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.message).toBe('line1\tcolumn\nline2gone');
  });

  it('should strip backspace and bell characters', async () => {
    const dto = toDto({ message: 'hello\x07bell\x08back' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.message).toBe('hellobellback');
  });

  it('should reject null bytes', async () => {
    const dto = toDto({ message: 'hello\0world' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
    expect(messages.some((m) => m.includes('null bytes'))).toBe(true);
  });

  it('should reject empty message after trim', async () => {
    const dto = toDto({ message: '   ' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject message exceeding 2000 characters', async () => {
    const dto = toDto({ message: 'a'.repeat(2001) });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should accept exactly 2000 characters', async () => {
    const dto = toDto({ message: 'a'.repeat(2000) });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.message).toHaveLength(2000);
  });

  it('should preserve carriage return characters', async () => {
    const dto = toDto({ message: 'line1\r\nline2' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.message).toBe('line1\r\nline2');
  });

  it('should strip DEL and C1 control characters', async () => {
    const dto = toDto({ message: 'hello\x7Fworld\x80gone\x9Fend' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.message).toBe('helloworldgoneend');
  });
});
