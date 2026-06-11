"use client";

import { useRef, useEffect, useCallback } from 'react';

export function Camera({ onCapture, onCancel }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    useEffect(() => {
        const openCamera = async () => {
            try {
                streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                if (videoRef.current) {
                    videoRef.current.srcObject = streamRef.current;
                }
            } catch (err) {
                console.error("Error accessing camera:", err);
                onCancel();
            }
        };

        openCamera();

        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
        };
    }, [onCancel]);

    const handleCapture = useCallback(() => {
        if (videoRef.current) {
            const canvas = document.createElement('canvas');
            canvas.width = videoRef.current.videoWidth;
            canvas.height = videoRef.current.videoHeight;
            const context = canvas.getContext('2d');
            if (context) {
                context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL('image/jpeg');
                onCapture(dataUrl);
            }
        }
    }, [onCapture]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75">
            <div className="relative w-full max-w-4xl rounded-xl bg-white p-4 shadow-2xl dark:bg-slate-900">
                <video ref={videoRef} autoPlay playsInline className="aspect-video w-full rounded-lg" />
                <div className="mt-4 flex justify-center gap-x-4">
                    <button onClick={handleCapture} className="rounded-full bg-slate-800 px-6 py-3 text-lg font-bold text-white shadow-lg transition hover:bg-slate-700">Capture</button>
                    <button onClick={onCancel} className="rounded-full bg-slate-200 px-6 py-3 text-lg font-semibold text-slate-900 transition hover:bg-slate-300 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600">Cancel</button>
                </div>
            </div>
        </div>
    );
}
