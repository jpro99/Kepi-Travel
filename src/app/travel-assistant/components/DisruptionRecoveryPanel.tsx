// @ts-nocheck
"use client";

interface RecoveryOption {
    id: string;
    label: string;
    description: string;
}

interface DisruptionRecoveryPanelProps {
    recoveryOptions: RecoveryOption[];
    onSelectOption: (optionId: string) => void;
}

export function DisruptionRecoveryPanel({ recoveryOptions, onSelectOption }: DisruptionRecoveryPanelProps) {
    return (
        <div className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-lg">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Let's solve this.</h2>
            <p className="mt-2 text-slate-600 dark:text-slate-400">Here are a few options based on your situation. Kepi can handle the details.</p>

            <div className="mt-6 space-y-4">
                {recoveryOptions.length > 0 ? (
                    recoveryOptions.map((option) => (
                        <button 
                            key={option.id} 
                            onClick={() => onSelectOption(option.id)}
                            className="block w-full text-left rounded-xl border border-slate-200 dark:border-slate-800 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                        >
                            <p className="font-semibold text-slate-800 dark:text-slate-200">{option.label}</p>
                            <p className="text-sm text-slate-500 dark:text-slate-400">{option.description}</p>
                        </button>
                    ))
                ) : (
                    <div className="text-center py-8">
                        <p className="text-slate-500 dark:text-slate-400">Analyzing the situation...</p>
                        {/* Spinner or loader can go here */}
                    </div>
                )}
            </div>
        </div>
    );
}
