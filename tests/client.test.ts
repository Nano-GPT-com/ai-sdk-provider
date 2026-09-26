import { describe, expect, it, vi } from 'vitest';
import { NanoGPTClient } from '../src/client';

for (const method of ['request', 'stream'] as const) {
  describe(`NanoGPTClient.${method}`, () => {
    it.each([
      'https://attacker.example/collect',
      'http://nano-gpt.com/api/v1/chat/completions',
      'https://nano-gpt.com:444/collect',
      '//attacker.example/collect',
      ' HTTPS://attacker.example/collect ',
      'https://nano-gpt.com@attacker.example/collect',
      'https://user:password@nano-gpt.com/api/v1/chat/completions',
      'data:text/plain,hello',
    ])('rejects %s before fetch', async (path) => {
      const fetchImpl = vi.fn();
      const client = new NanoGPTClient({ apiKey: 'synthetic-key', fetch: fetchImpl });
      await expect(client[method](path)).rejects.toMatchObject({ code: 'invalid_target_origin' });
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it.each([
      [undefined, '/chat/completions', 'https://nano-gpt.com/api/v1/chat/completions'],
      [undefined, 'https://nano-gpt.com/api/v1/embeddings', 'https://nano-gpt.com/api/v1/embeddings'],
      ['https://proxy.example/custom/v1/', '/chat/completions', 'https://proxy.example/custom/v1/chat/completions'],
      ['https://proxy.example/custom/v1', 'https://proxy.example/other', 'https://proxy.example/other'],
    ])('allows trusted endpoints with base %s and path %s', async (baseURL, path, expected) => {
      const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', {
        headers: { 'content-type': 'application/json' },
      }));
      const client = new NanoGPTClient({ apiKey: 'synthetic-key', baseURL, fetch: fetchImpl });
      await client[method](path!, { redirect: 'follow' });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const [url, init] = fetchImpl.mock.calls[0];
      expect(url).toBe(expected);
      expect(init.redirect).toBe('error');
      const headers = new Headers(init.headers);
      expect(headers.get('authorization')).toBe('Bearer synthetic-key');
      expect(headers.get('x-api-key')).toBe('synthetic-key');
    });

    it('rejects the default origin when a custom proxy is configured', async () => {
      const fetchImpl = vi.fn();
      const client = new NanoGPTClient({
        apiKey: 'synthetic-key', baseURL: 'https://proxy.example/v1', fetch: fetchImpl,
      });
      await expect(client[method]('https://nano-gpt.com/api/v1/chat/completions'))
        .rejects.toMatchObject({ code: 'invalid_target_origin' });
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  });
}
