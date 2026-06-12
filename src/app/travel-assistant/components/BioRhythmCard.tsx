import { BioHarmonizationPlan } from '@/lib/journey/types';

interface BioRhythmCardProps {
    plan: BioHarmonizationPlan;
}

export function BioRhythmCard({ plan }: BioRhythmCardProps) {
    return (
        <div className="relative rounded-xl border border-slate-200 bg-white p-6 shadow-lg dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Bio-Rhythm Guidance</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{plan.activeRecommendations[0]?.title ?? "Stay aligned with your travel rhythm."}</p>
        </div>
    );
}