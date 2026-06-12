import { promises as fs } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { z } from 'zod';

// Basic check for admin privileges
function isAdmin(request: Request): boolean {
    // In a real app, this would involve checking a session cookie for a user's role.
    // For now, we'll keep it simple and allow it in a non-production environment.
    return process.env.NODE_ENV !== 'production';
}

const BodySchema = z.object({
    iata: z.string().trim().length(3),
    geojson: z.string(),
});

export async function POST(request: Request) {
    if (!isAdmin(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    try {
        const body = await request.json();
        const validation = BodySchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten() }, { status: 400 });
        }

        const { iata, geojson } = validation.data;

        // Validate that the geojson string is valid JSON
        try {
            JSON.parse(geojson);
        } catch (e) {
            return NextResponse.json({ error: 'Invalid GeoJSON content: Not valid JSON.' }, { status: 400 });
        }

        const upperIata = iata.toUpperCase();
        const filename = `${upperIata.toLowerCase()}.json`;
        
        // IMPORTANT: Ensure the directory exists. Adjust the path according to your project structure.
        const dataDir = path.join(process.cwd(), 'src', 'data', 'airport-layouts');
        await fs.mkdir(dataDir, { recursive: true });

        const filePath = path.join(dataDir, filename);
        await fs.writeFile(filePath, geojson, 'utf8');

        return NextResponse.json({ message: 'Airport layout saved successfully.', iata: upperIata });

    } catch (error) {
        console.error("Error in airport-layout API:", error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown server error occurred';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
