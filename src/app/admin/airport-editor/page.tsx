"use client";

import { useState } from 'react';

export default function AirportEditorPage() {
    const [iataCode, setIataCode] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [attribution, setAttribution] = useState('');
    const [sourceUrl, setSourceUrl] = useState('');
    const [status, setStatus] = useState<'draft' | 'published'>('draft');
    const [message, setMessage] = useState('');
    const [isUploading, setIsUploading] = useState(false);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files) {
            setFile(event.target.files[0]);
        }
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!file || !iataCode) {
            setMessage('Please provide an IATA code and a Kepi AirportLayout JSON file.');
            return;
        }

        if (iataCode.length !== 3) {
            setMessage('IATA code must be exactly 3 characters.');
            return;
        }

        setIsUploading(true);
        setMessage('');

        const reader = new FileReader();
        reader.readAsText(file);
        reader.onload = async () => {
            try {
                const fileContent = reader.result as string;
                const layout = JSON.parse(fileContent) as unknown;

                const response = await fetch('/api/admin/airport-layout', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        iata: iataCode.toUpperCase(),
                        layout,
                        status,
                        source: {
                            ownership: 'kepi_original',
                            attribution: attribution.trim() || `Kepi original ${iataCode.toUpperCase()} airport schematic`,
                            sourceUrls: sourceUrl.trim() ? [sourceUrl.trim()] : [],
                            licenseNote: 'Kepi-owned vector geometry; official map artwork is not redistributed.',
                            lastVerifiedAt: new Date().toISOString().slice(0, 10),
                        },
                    }),
                });

                const result = await response.json();

                if (response.ok) {
                    setMessage(
                        `Successfully saved ${result.package.iata} revision ${result.package.revision} as ${result.package.status}.`,
                    );
                    setIataCode('');
                    setFile(null);
                    setAttribution('');
                    setSourceUrl('');
                    setStatus('draft');
                    (document.getElementById('file-input') as HTMLInputElement).value = '';
                } else {
                    throw new Error(result.error || 'Failed to upload file.');
                }
            } catch (error) {
                if (error instanceof Error) {
                    setMessage(`Error: ${error.message}`);
                } else {
                    setMessage('An unknown error occurred.');
                }
            }
            finally {
                setIsUploading(false);
            }
        };
        reader.onerror = () => {
            setMessage('Error reading file.');
            setIsUploading(false);
        };
    };

    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center">
            <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-md">
                <h1 className="text-2xl font-bold text-center mb-2">Kepi Airport Package Editor</h1>
                <p className="mb-6 text-center text-sm text-gray-500">
                    Upload original vector geometry, routing nodes, edges, and POIs. Save as draft before publishing.
                </p>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="iata" className="block text-sm font-medium text-gray-700">
                            Airport IATA Code (e.g., JFK, LAX)
                        </label>
                        <input
                            id="iata"
                            type="text"
                            value={iataCode}
                            onChange={(e) => setIataCode(e.target.value.toUpperCase())}
                            maxLength={3}
                            className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            placeholder="JFK"
                            required
                        />
                    </div>
                    <div>
                        <label htmlFor="file-input" className="block text-sm font-medium text-gray-700">
                            Kepi AirportLayout Package (.json)
                        </label>
                        <input
                            id="file-input"
                            type="file"
                            onChange={handleFileChange}
                            accept=".json,application/json"
                            className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100"
                            required
                        />
                    </div>
                    <div>
                        <label htmlFor="attribution" className="block text-sm font-medium text-gray-700">
                            Attribution
                        </label>
                        <input
                            id="attribution"
                            type="text"
                            value={attribution}
                            onChange={(event) => setAttribution(event.target.value)}
                            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm"
                            placeholder="Kepi original SEA terminal schematic"
                        />
                    </div>
                    <div>
                        <label htmlFor="source-url" className="block text-sm font-medium text-gray-700">
                            Official reference URL
                        </label>
                        <input
                            id="source-url"
                            type="url"
                            value={sourceUrl}
                            onChange={(event) => setSourceUrl(event.target.value)}
                            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm"
                            placeholder="https://airport.example/maps"
                        />
                    </div>
                    <div>
                        <label htmlFor="status" className="block text-sm font-medium text-gray-700">
                            Save status
                        </label>
                        <select
                            id="status"
                            value={status}
                            onChange={(event) => setStatus(event.target.value as 'draft' | 'published')}
                            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm"
                        >
                            <option value="draft">Draft — not visible to travelers</option>
                            <option value="published">Published — available immediately</option>
                        </select>
                    </div>
                    <div>
                        <button
                            type="submit"
                            disabled={isUploading}
                            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-300"
                        >
                            {isUploading ? 'Validating and saving…' : `Save ${status}`}
                        </button>
                    </div>
                </form>
                {message && (
                    <p className={`mt-4 text-sm text-center ${message.startsWith('Error') ? 'text-red-500' : 'text-green-500'}`}>
                        {message}
                    </p>
                )}
            </div>
        </div>
    );
}
