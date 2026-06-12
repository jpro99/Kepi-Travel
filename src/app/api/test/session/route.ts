import { NextResponse } from 'next/server';
import { SignJWT } from 'jose';

// This endpoint is for testing purposes only
export async function POST() {
  if (process.env.NODE_ENV !== 'development') {
    return new NextResponse('Not found', { status: 404 });
  }

  // Create a mock user payload
  const user = { id: "1", name: "Test User", email: "test-user@kepitravel.com" };

  // Create a JWT
  const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET);
  const token = await new SignJWT(user)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret);

  const response = NextResponse.json({ success: true });

  // Set the session cookie in the response headers
  response.cookies.set('next-auth.session-token', token, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    path: '/',
  });

  return response;
}