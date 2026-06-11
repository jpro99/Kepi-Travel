"use client";

import { useState } from 'react';

export default function AirportEditorPage() {
    const [iataCode, setIataCode] = useState('');
    const [file, setFile] = useState<File | null>(null);
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
            setMessage('Please provide both an IATA code and a GeoJSON file.');
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
                JSON.parse(fileContent); // Validate JSON

                const response = await fetch('/api/admin/airport-layout', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ iata: iataCode.toUpperCase(), geojson: fileContent }),
                });

                const result = await response.json();

                if (response.ok) {
                    setMessage(`Successfully uploaded layout for ${result.iata}.`);
                    setIataCode('');
                    setFile(null);
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
                <h1 className="text-2xl font-bold text-center mb-6">Airport Layout Uploader</h1>
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
                            GeoJSON File (.json)
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
                        <button
                            type="submit"
                            disabled={isUploading}
                            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-300"
                        >
                            {isUploading ? 'Uploading...' : 'Upload Layout'}
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
