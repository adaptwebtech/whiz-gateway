/**
 * Unit tests — CreateApiKeyDto validation
 *
 * AC-1: name 1-120 chars required
 */

import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateApiKeyDto } from './create-api-key.dto';

describe('CreateApiKeyDto', () => {
  it('AC-1: valid name → no errors', async () => {
    const dto = plainToInstance(CreateApiKeyDto, {
      name: 'integração-x',
    } as object);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('AC-1: name with 120 chars → no errors', async () => {
    const dto = plainToInstance(CreateApiKeyDto, {
      name: 'a'.repeat(120),
    } as object);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('AC-1: empty name → validation error', async () => {
    const dto = plainToInstance(CreateApiKeyDto, { name: '' } as object);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('name');
  });

  it('AC-1: name exceeding 120 chars → validation error', async () => {
    const dto = plainToInstance(CreateApiKeyDto, {
      name: 'a'.repeat(121),
    } as object);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('name');
  });

  it('AC-1: missing name → validation error', async () => {
    const dto = plainToInstance(CreateApiKeyDto, {} as object);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('name');
  });

  it('AC-1: non-string name → validation error', async () => {
    const dto = plainToInstance(CreateApiKeyDto, { name: 123 } as object);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
