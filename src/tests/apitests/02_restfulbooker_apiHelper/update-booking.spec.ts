import { test, expect } from '@playwright/test';
import { APIHelper } from '@utils/APIHelper';

test.describe('@P0 @regression Level 2 (APIHelper) - PUT update booking', () => {
    test('PUT /booking/{id} replaces the booking with a Cookie token', async ({ request }) => {
        const api = new APIHelper(request);

        //1. Token
        const authRes = await api.post('/auth', { username: 'admin', password: 'password123' });
        const { token } = await api.parseJsonResponse<{ token: string }>(authRes);

        //2. Create something to update
        const created = await api.post('/booking', {
            firstname: 'Before',
            lastname: 'Helper',
            totalprice: 100,
            depositpaid: false,
            bookingdates: { checkin: '2026-05-01', checkout: '2026-05-05' },
        });

        const { bookingid } = await api.parseJsonResponse<{ bookingid: number }>(created);

        //3. PUT with the cookie header
        const response = await api.put(
            `/booking/${bookingid}`,
            {
                firstname: 'After',
                lastname: 'Helper',
                totalprice: 880,
                depositpaid: true,
                bookingdates: { checkin: '2026-05-02', checkout: '2026-05-09' },
                additionaldates: 'Extra bed',
            },
            { headers: { Cookie: `token= ${token}` } },
        );

        expect(api.isSuccess(response)).toBe(true);
        const updated = await api.parseJsonResponse<{ firstname: string, totalprice: number }>(
            response,
        );
        expect(updated.firstname).toBe('After');
        expect(updated.totalprice).toBe(880);

    });
});