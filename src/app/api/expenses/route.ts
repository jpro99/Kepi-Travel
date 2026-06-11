import { NextResponse } from 'next/server';

// This is a mock API endpoint. In a real application, this would fetch data from a database.
export async function POST(request: Request) {
    const { tripId } = await request.json();

    const expenses = [
        { id: '1', date: '2024-07-10', category: 'Flights', description: 'SFO to JFK', amount: 543.21 },
        { id: '2', date: '2024-07-10', category: 'Hotels', description: 'The Standard, High Line', amount: 1234.56 },
        { id: '3', date: '2024-07-11', category: 'Taxis', description: 'JFK to The Standard', amount: 78.90 },
        { id: '4', date: '2024-07-12', category: 'Meals', description: 'Dinner at Carbone', amount: 654.32 },
    ];

    return NextResponse.json({ expenses });
}
