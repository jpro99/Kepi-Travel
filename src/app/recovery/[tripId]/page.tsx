
"use client";

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface RecoveryRecommendation {
  category: string;
  advice: string;
}

interface RecoveryPlan {
  recommendations: RecoveryRecommendation[];
}

export default function RecoveryPage() {
    const params = useParams();
    const tripId = params.tripId as string;
    const [plan, setPlan] = useState<RecoveryPlan | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (tripId) {
            fetch(`/api/recovery?tripId=${tripId}`)
            .then(res => res.json())
            .then(data => {
                setPlan(data.plan);
                setLoading(false);
            });
        }
    }, [tripId]);

    if (loading) {
        return <div className="text-center p-8">Analyzing your travel data...</div>;
    }

    if (!plan) {
        return <div className="text-center p-8">Could not generate a recovery plan.</div>;
    }

    return (
        <div className="container mx-auto p-4">
            <h1 className="text-3xl font-bold mb-4">Post-Travel Recovery Plan</h1>
            <p className="text-gray-600 mb-8">A personalized plan to help you get back to your best.</p>
            
            <div className="space-y-4">
                {plan.recommendations.map((rec, index) => (
                    <div key={index} className="p-4 border rounded-lg shadow-sm">
                        <h2 className="text-xl font-semibold mb-2">{rec.category}</h2>
                        <p>{rec.advice}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}
