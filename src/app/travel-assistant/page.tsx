import { Suspense } from "react";
import { AirportNavPage } from "./AirportNavPage";

export default function TravelAssistantPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0B1F3A] p-6 text-white">Loading navigator…</div>}>
      <AirportNavPage />
    </Suspense>
  );
}
