import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CancelMessageDto } from './create-message.dto';
import { describe, it, expect } from 'vitest';

describe('CancelMessageDto', () => {
  it('should validate when both messageId and threadId are provided', async () => {
    const dto = plainToInstance(CancelMessageDto, {
      messageId: 'msg-123',
      threadId: 'thread-456',
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should fail validation when messageId is missing', async () => {
    const dto = plainToInstance(CancelMessageDto, {
      threadId: 'thread-456',
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('messageId');
  });

  it('should fail validation when threadId is missing', async () => {
    const dto = plainToInstance(CancelMessageDto, {
      messageId: 'msg-123',
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('threadId');
  });

  it('should fail validation when both fields are missing', async () => {
    const dto = plainToInstance(CancelMessageDto, {});

    const errors = await validate(dto);
    expect(errors).toHaveLength(2);
    const propertyNames = errors.map(e => e.property);
    expect(propertyNames).toContain('messageId');
    expect(propertyNames).toContain('threadId');
  });

  it('should accept string values (not require UUID format)', async () => {
    const dto = plainToInstance(CancelMessageDto, {
      messageId: 'simple-string-id',
      threadId: 'another-simple-string',
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should fail validation when values are not strings', async () => {
    const dto = plainToInstance(CancelMessageDto, {
      messageId: 123,
      threadId: true,
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(2);
    errors.forEach(error => {
      expect(error.constraints).toHaveProperty('isString');
    });
  });
});
