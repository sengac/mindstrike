import { vi } from 'vitest';

export const stat = vi.fn();
export const statSync = vi.fn();
export const createReadStream = vi.fn();

export const promises = {
  readdir: vi.fn(),
};

export class Dirent {
  name: string;

  constructor(name: string) {
    this.name = name;
  }

  isFile() {
    return false;
  }
  isDirectory() {
    return false;
  }
  isBlockDevice() {
    return false;
  }
  isCharacterDevice() {
    return false;
  }
  isSymbolicLink() {
    return false;
  }
  isFIFO() {
    return false;
  }
  isSocket() {
    return false;
  }
}

export default {
  stat,
  statSync,
  createReadStream,
  promises,
  Dirent,
};
