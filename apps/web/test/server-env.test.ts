import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readEnvValue, serverSecret } from '@/lib/server/env';

const envFile = (content: string) => {
  const dir = mkdtempSync(join(tmpdir(), 'chess-env-'));
  const file = join(dir, '.env');
  writeFileSync(file, content);
  return file;
};

describe('readEnvValue', () => {
  it('reads plain, quoted and spaced values and ignores comments', () => {
    const file = envFile(
      [
        '# comment',
        'project_url=https://x',
        'LICHESS_API_TOKEN = "lip_abc"',
        "OTHER='single'",
        '',
      ].join('\n'),
    );
    expect(readEnvValue(file, 'LICHESS_API_TOKEN')).toBe('lip_abc');
    expect(readEnvValue(file, 'OTHER')).toBe('single');
    expect(readEnvValue(file, 'MISSING')).toBeUndefined();
  });

  it('returns undefined when the file does not exist', () => {
    expect(readEnvValue(join(tmpdir(), 'nope-does-not-exist', '.env'), 'X')).toBeUndefined();
  });
});

describe('serverSecret', () => {
  it('prefers the process environment, then the repo-root .env', () => {
    const file = envFile('LICHESS_API_TOKEN=lip_from_file\n');
    expect(
      serverSecret('LICHESS_API_TOKEN', { env: { LICHESS_API_TOKEN: 'lip_env' }, files: [file] }),
    ).toBe('lip_env');
    expect(serverSecret('LICHESS_API_TOKEN', { env: {}, files: [file] })).toBe('lip_from_file');
    expect(serverSecret('LICHESS_API_TOKEN', { env: {}, files: [] })).toBeUndefined();
  });
});
