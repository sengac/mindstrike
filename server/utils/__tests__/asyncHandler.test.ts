import { describe, it, expect, vi } from 'vitest';
import { asyncHandler } from '../asyncHandler.js';
import type { Request, Response, NextFunction } from 'express';

describe('asyncHandler', () => {
  it('should handle successful async operations', async () => {
    const mockReq = {} as Request;
    const mockRes = {
      json: vi.fn(),
    } as Partial<Response> as Response;
    const mockNext = vi.fn() as NextFunction;

    const asyncFn = async (req: Request, res: Response) => {
      res.json({ success: true });
    };

    const wrapped = asyncHandler(asyncFn);
    wrapped(mockReq, mockRes, mockNext);

    // Wait for the promise to resolve
    await new Promise(resolve => setImmediate(resolve));

    expect(mockRes.json).toHaveBeenCalledWith({ success: true });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should catch and pass errors to next middleware', async () => {
    const mockReq = {} as Request;
    const mockRes = {} as Response;
    const mockNext = vi.fn() as NextFunction;
    const testError = new Error('Test error');

    const asyncFn = async () => {
      throw testError;
    };

    const wrapped = asyncHandler(asyncFn);
    wrapped(mockReq, mockRes, mockNext);

    // Wait for the promise to resolve
    await new Promise(resolve => setImmediate(resolve));

    expect(mockNext).toHaveBeenCalledWith(testError);
  });

  it('should handle functions that return a resolved promise', async () => {
    const mockReq = {} as Request;
    const mockRes = {
      send: vi.fn(),
    } as Partial<Response> as Response;
    const mockNext = vi.fn() as NextFunction;

    const syncFn = async (req: Request, res: Response) => {
      res.send('OK');
    };

    const wrapped = asyncHandler(syncFn);
    wrapped(mockReq, mockRes, mockNext);

    // Wait for the promise to resolve
    await new Promise(resolve => setImmediate(resolve));

    expect(mockRes.send).toHaveBeenCalledWith('OK');
    expect(mockNext).not.toHaveBeenCalled();
  });
});
