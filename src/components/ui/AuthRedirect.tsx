"use client";
import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

export function AuthRedirect() {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.push("/travel-assistant");
    }
  }, [isLoaded, isSignedIn, router]);
  return null;
}
