
import { test, expect } from '@playwright/test';

test('ping request - GET', async ({ request }) => {
    const responseData = await request.get("/ping");
    console.log(responseData);
    expect(responseData.status()).toBe(201);
})