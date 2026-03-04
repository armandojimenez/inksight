import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PaginationQueryDto } from '@/chat/dto/pagination-query.dto';

function toDto(plain: Record<string, unknown>): PaginationQueryDto {
  return plainToInstance(PaginationQueryDto, plain);
}

describe('PaginationQueryDto', () => {
  it('should use defaults when no values are provided', async () => {
    const dto = toDto({});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('should accept valid page and limit', async () => {
    const dto = toDto({ page: '5', limit: '25' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(5);
    expect(dto.limit).toBe(25);
  });

  it('should reject page less than 1', async () => {
    const dto = toDto({ page: '0' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.property).toBe('page');
  });

  it('should reject limit greater than 50', async () => {
    const dto = toDto({ limit: '51' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.property).toBe('limit');
  });

  it('should reject limit less than 1', async () => {
    const dto = toDto({ limit: '0' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.property).toBe('limit');
  });

  it('should reject non-integer page', async () => {
    const dto = toDto({ page: '1.5' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.property).toBe('page');
  });

  it('should coerce string numbers to integers', async () => {
    const dto = toDto({ page: '3', limit: '10' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(typeof dto.page).toBe('number');
    expect(typeof dto.limit).toBe('number');
  });
});
