import { test, expect } from '@playwright/test';
import { logger } from '@utils/logger';

interface BookingDates {
    checkin: string;
    checkout: string;
}

interface BookingPayLoad {
    firstname: string
    lastname: string;
    totalprice: number;
    depositpaid: boolean;
    bookingdates: BookingDates;
    additionalneeds: string;

}

interface AuthTokenResponse {
    token: string;
}

interface CreateBookingResponse {
    bookingid: number;
    booking: BookingPayLoad;
}

interface BookingFlowState {
    token?: string;
    bookingId?: number;
}

test.describe.serial('Restful Booker CRUD API', () => {
    const baseUrl = process.env.API_BASE_URL || 'https://restful-booker.herokuapp.com/';
    const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    };
    const bookingFlowState: BookingFlowState = {};

    const payload: BookingPayLoad = {
        firstname: 'Shivani',
        lastname: 'Anand',
        totalprice: 666,
        depositpaid: true,
        bookingdates: {
            checkin: '2018-01-06',
            checkout: '2019-06-06'
        },
        additionalneeds: 'Breakfast'
    };

    test('TC#1 @p0-Create token', async ({ request }) => {
        await test.step('Create token', async () => {
            const responseData = await request.post(`${baseUrl}/auth`, {
                headers,
                data: {
                    username: 'admin',
                    password: 'password123'
                },
            });
            expect(responseData.status()).toBe(200);
            const data = await responseData.json() as AuthTokenResponse;
            expect(data.token).toBeTruthy();

            bookingFlowState.token = data.token;
            logger.info('Created auth token for CRUD Flow');
        })
    })
    test('TC#2 @p0-Create booking', async ({ request }) => {
        const responseData = await request.post(`${baseUrl}/booking`, {
            headers,
            data: payload,
        });
        expect(responseData.status()).toBe(200);
        const data = await responseData.json() as CreateBookingResponse;
        expect(data.bookingid).toBeTruthy();
        expect(data.booking.firstname).toBe(payload.firstname);
        expect(data.booking.lastname).toBe(payload.lastname);
        expect(data.booking.totalprice).toBe(payload.totalprice);
        expect(data.booking.depositpaid).toBe(payload.depositpaid);
        expect(data.booking.bookingdates).toEqual(payload.bookingdates);
        expect(data.booking.additionalneeds).toBe(payload.additionalneeds);

        bookingFlowState.bookingId = data.bookingid;
        logger.info(`Created booking id for CRUD flow: ${bookingFlowState.bookingId}`);

    })

    test('TC#3 @p0-Update booking', async ({ request }) => {

        const token = bookingFlowState.token;
        const bookingId = bookingFlowState.bookingId;
        if (!token || !bookingId) {
            throw new Error('Create token and create booking tests must pass before updating')
        }

        const responseData = await request.put(`${baseUrl}/booking/${bookingId}`, {
            headers: {
                ...headers,
                Cookie: `token = ${token}`,
            },
            data: payload,
        });

        expect(responseData.status()).toBe(200);
        const data = await responseData.json() as BookingPayLoad;
        expect(data.firstname).toBe(payload.firstname);
        expect(data.lastname).toBe(payload.lastname);

        logger.info(`Updated booking id ${bookingId}: ${data.firstname} ${data.lastname}`);


    })
})