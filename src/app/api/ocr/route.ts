import { NextResponse } from 'next/server';

// Receipt OCR is not implemented yet. This previously returned a hardcoded fake
// expense ("Dinner with clients", $123.45) regardless of the photo taken, silently
// fabricating data. Returning a clear "not available" response instead so the UI can
// tell the user nothing was actually read, rather than quietly lying about it.
// TODO(product decision): wire to a real vision/OCR provider (e.g. Claude vision,
// since ANTHROPIC_API_KEY is already configured) before re-enabling this feature.
export async function POST(request: Request) {
    const { image } = await request.json();

    if (typeof image !== 'string' || !image.includes('data:image/jpeg;base64')) {
        return NextResponse.json({ error: 'Invalid image format' }, { status: 400 });
    }

    return NextResponse.json(
        { error: 'Receipt scanning is not available yet. Add this expense manually for now.' },
        { status: 501 },
    );
}
