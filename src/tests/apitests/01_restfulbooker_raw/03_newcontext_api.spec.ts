import { test, expect, request } from '@playwright/test';

test('newContext for isolated headers', async () => {
    const ctx = await request.newContext({
        baseURL: 'https://gorest.in',
        extraHTTPHeaders: { 'X-Trace-Id': 'demo-123' },
        timeout: 15_000,
    });

    const ping = await ctx.get('/public/v2/users/');
    expect(ping.status()).toBe(200);

    await ctx.dispose();

})
