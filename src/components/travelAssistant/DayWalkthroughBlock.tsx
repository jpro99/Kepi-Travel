import type { DayWalkthrough } from "@/lib/travelAssistant/dayWalkthrough";

interface DayWalkthroughBlockProps {
  walkthrough: DayWalkthrough;
  className?: string;
  headlineClassName?: string;
  paragraphClassName?: string;
}

export function DayWalkthroughBlock({
  walkthrough,
  className = "",
  headlineClassName = "text-[15px] font-semibold text-[#1D1D1F]",
  paragraphClassName = "mt-2 text-[13px] leading-relaxed text-[#3A3A3C]",
}: DayWalkthroughBlockProps) {
  return (
    <div className={className}>
      <p className={headlineClassName}>{walkthrough.headline}</p>
      {walkthrough.paragraphs.map((paragraph, index) => (
        <p key={`${walkthrough.headline}-${index}`} className={paragraphClassName}>
          {paragraph}
        </p>
      ))}
    </div>
  );
}
