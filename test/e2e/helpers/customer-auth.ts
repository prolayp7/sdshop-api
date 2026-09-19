import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';

/** Registers a storefront customer and verifies their email via the dev-mode
 * OTP the register/otp endpoints echo back, mirroring what the real
 * register -> enter code -> auto-login flow does, so tests get a usable
 * access token without a live inbox. */
export async function registerCustomer(
  app: INestApplication,
  input: { email: string; password: string; firstName: string; lastName: string },
): Promise<{ accessToken: string; refreshToken: string }> {
  const registerRes = await request(app.getHttpServer()).post('/api/v1/auth/register').send(input).expect(201);
  const otp = registerRes.body.data.otp as string;

  const verifyRes = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({ email: input.email, purpose: 'email_verification', code: otp })
    .expect(200);

  return { accessToken: verifyRes.body.data.accessToken, refreshToken: verifyRes.body.data.refreshToken };
}
