import { NextResponse } from 'next/server';

// This is a mock API endpoint. In a real application, this would use a real OCR engine.
export async function POST(request: Request) {
    const { image } = await request.json();

    // "Intelligently" determine if the image is a receipt
    if (!image.includes('data:image/jpeg;base64')) {
        return NextResponse.json({ error: 'Invalid image format' }, { status: 400 });
    }

    // "Read" the receipt
    const expense = {
        id: Math.random().toString(36).substring(2, 9),
        date: new Date().toISOString().split('T')[0],
        category: 'Meals',
        description: 'Dinner with clients',
        amount: 123.45,
    };

    return NextResponse.json({ expense });
}
