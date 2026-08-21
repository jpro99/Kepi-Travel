import { NextResponse } from 'next/server';

// This route used to ignore the `state`/`context` it was given entirely and always return
// the same fabricated situation ("Gate Change Detected" / "Proceed to Gate F8"), regardless
// of what was actually happening on the user's trip. There is no real situation-analysis
// implementation behind this route, so we return an honest "not available yet" response
// instead of inventing a gate change that may not have happened.
// TODO(product decision): a real implementation would need to analyze the actual `state`/
// `context` (flight status, gate data, etc.) against a real disruption-detection source.
export async function POST(request: Request) {
    const { state, context } = await request.json();
    void state;
    void context;

    return NextResponse.json(
        { error: 'Situation analysis is not available yet.' },
        { status: 501 },
    );
}
