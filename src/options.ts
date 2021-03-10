import { Dependencies } from './dependencies';
import { ExpirationStrategy } from './cache/expiration-strategy';
import { MemoryStorage } from './cache/memory-storage';

export class Options {
  private readonly cache: ExpirationStrategy;

  constructor() {
    this.cache = new ExpirationStrategy(new MemoryStorage());
  }



  public getUserHomeDir(): string {
    if (this.isPortable()) return process.env['VSCODE_PORTABLE'] as string;

    return process.env[Dependencies.isWindows() ? 'USERPROFILE' : 'HOME'] || '';
  }

  public isPortable(): boolean {
    return !!process.env['VSCODE_PORTABLE'];
  }

  public startsWith(outer: string, inner: string): boolean {
    return outer.slice(0, inner.length) === inner;
  }

  public endsWith(outer: string, inner: string): boolean {
    return inner === '' || outer.slice(-inner.length) === inner;
  }
}
