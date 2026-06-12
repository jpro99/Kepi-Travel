// @ts-nocheck
"use client";

import { AlertTriangle, ShieldCheck } from "lucide-react";
import { triggerHaptic } from "@/lib/native/capacitorBridge";
import { useEffect } from "react";

interface GuardianAlertProps {
  message: string;
  onDismiss: () => void;
  onReportProblem: () => void;
}

export function GuardianAlert({ message, onDismiss, onReportProblem }: GuardianAlertProps) {
  useEffect(() => {
    triggerHaptic();
  }, []);
  return (
    <div className="fixed bottom-24 right-4 md:bottom-4 z-50 max-w-sm rounded-2xl border border-blue-500/30 bg-slate-950/80 p-4 text-white shadow-lg backdrop-blur-lg animate-in fade-in-50 slide-in-from-bottom-10">
      <div className="flex items-start">
        <div className="flex-shrink-0 pt-0.5">
          <AlertTriangle className="h-6 w-6 text-blue-400" />
        </div>
        <div className="ml-3 flex-1">
          <p className="font-bold text-blue-50">Guardian Angel</p>
          <p className="mt-1 text-sm text-slate-300">{message}</p>
          <div className="mt-4 flex space-x-3">
            <button
              onClick={onDismiss}
              className="flex-1 rounded-lg bg-blue-600/50 px-3 py-2 text-center text-sm font-semibold text-white hover:bg-blue-600/80"
            >
              I'm OK
            </button>
            <button
              onClick={onReportProblem}
              className="flex-1 rounded-lg bg-slate-700/50 px-3 py-2 text-center text-sm font-semibold text-white hover:bg-slate-700/80"
            >
              Report a Problem
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
