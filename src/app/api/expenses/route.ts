import { NextResponse } from 'next/server';

// There is no real expense storage backing this route yet. It used to return four
// hardcoded 2024 expenses (e.g. "Dinner at Carbone", $654.32) for ANY tripId, silently
// fabricating the user's expense history. Returning an honest empty list instead so the
// UI shows "no expenses yet" rather than someone else's invented receipts.
// TODO(product decision): wire this up to a real per-trip expense store (and to the OCR
// route once that's implemented) before this feature is considered functional.
export async function POST(request: Request) {
    const { tripId } = await request.json();
    void tripId;

    return NextResponse.json({ expenses: [] });
}
