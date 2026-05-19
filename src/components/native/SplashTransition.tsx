"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { isNative } from "@/lib/native/capacitorBridge";
import { Logo } from "@/components/ui/Logo";

interface SplashTransitionProps {
  children: ReactNode;
}

export function SplashTransition({ children }: SplashTransitionProps) {
  const nativeContext = useMemo(() => isNative(), []);
  const [visible, setVisible] = useState(nativeContext);

  useEffect(() => {
    if (!nativeContext) return;
    const timeout = window.setTimeout(() => {
      setVisible(false);
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [nativeContext]);

  return (
    <>
      {visible ? (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-slate-950 text-slate-100">
          <div className="flex flex-col items-center text-center">
            <Logo size="md" className="[&>span:last-child]:text-slate-100" />
            <p className="mt-2 text-xl font-semibold">Travel Assistant</p>
            <p className="mt-2 text-xs text-slate-400">Preparing your trip dashboard...</p>
          </div>
        </div>
      ) : null}
      <div className={visible ? "opacity-0" : "opacity-100 transition-opacity duration-300"}>{children}</div>
    </>
  );
}
