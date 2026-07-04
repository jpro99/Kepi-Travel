"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Bell,
  Camera,
  CheckCircle2,
  Compass,
  MapPin,
  Navigation,
  Plane,
  Play,
  Shield,
  Sparkles,
  Timer,
} from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { InviteCodeForm } from "@/components/ui/InviteCodeForm";
import {
  appleBtnPrimary,
  appleBtnSecondary,
  appleCaption,
  appleMetadata,
  appleSectionHeader,
} from "@/lib/ui/appleDesign";

/* ─── Tokens (match globals.css / appleDesign.ts) ─────────────── */

const pageBg = "bg-[var(--apple-bg)]";
const textPrimary = "text-[var(--apple-text)]";
const textSecondary = "text-[var(--apple-text-secondary)]";
const container = "mx-auto w-full max-w-6xl px-4 sm:px-8";
const sectionPad = "py-20 sm:py-28";

/* ─── Motion helpers ──────────────────────────────────────────── */

function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/* ─── Data ────────────────────────────────────────────────────── */

const navLinks = [
  { href: "#features", label: "Features" },
  { href: "#airport-mode", label: "Airport Mode" },
  { href: "#journey", label: "Journey" },
  { href: "#memories", label: "Memories" },
  { href: "#pricing", label: "Pricing" },
] as const;

const pillars = [
  {
    title: "Plan",
    description:
      "Build a living itinerary — where to go, when to stay, what's missing. Compare options in Kepi, then book on Google or the airline when the price is right.",
    icon: Compass,
  },
  {
    title: "Guide",
    description:
      "Real-time guidance from packing through arrival. Gate changes, connection timing, and airport navigation — delivered when you need them, not all at once.",
    icon: Navigation,
  },
  {
    title: "Remember",
    description:
      "When the trip ends, Kepi helps you hold onto it — photo collages, route recaps, and a gentle archive of the journey you actually lived.",
    icon: Camera,
  },
] as const;

const airportFeatures = [
  { icon: MapPin, label: "Terminal navigation", detail: "Step-by-step directions to your gate" },
  { icon: Bell, label: "Gate & delay alerts", detail: "Calm notifications before things get urgent" },
  { icon: Shield, label: "Checkpoint guidance", detail: "PreCheck, security, and lounge timing" },
  { icon: Timer, label: "Leave-by timing", detail: "Know when to move — not just when you board" },
] as const;

const journeySteps = [
  {
    phase: "Before",
    title: "Prepare with clarity",
    body: "Packing cues, document checks, and a timeline that reflects your real reservations — not a generic checklist.",
  },
  {
    phase: "During",
    title: "Move with confidence",
    body: "Airport Mode, live flight status, and connection awareness keep you oriented when terminals get loud and crowded.",
  },
  {
    phase: "After",
    title: "Land softly",
    body: "Arrival guides, hotel check-in context, and shared family views so nobody is guessing on the other side.",
  },
] as const;

const memoryTiles = [
  {
    src: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80",
    alt: "Calm beach at golden hour",
    caption: "Day 4 · Maui",
  },
  {
    src: "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=800&q=80",
    alt: "Window seat above the clouds",
    caption: "En route · HNL",
  },
  {
    src: "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=800&q=80",
    alt: "City street at dusk",
    caption: "Evening walk · Lisbon",
  },
] as const;

const stats = [
  { value: "12k+", label: "Trips guided" },
  { value: "4.9", label: "Traveler rating" },
  { value: "98%", label: "On-time assist rate" },
] as const;

const testimonials = [
  {
    name: "Maya R.",
    route: "NYC → Lisbon",
    quote:
      "Gate changed twice in twenty minutes. Kepi rerouted my airport steps and I still boarded without sprinting.",
  },
  {
    name: "David L.",
    route: "Chicago → Tokyo",
    quote:
      "Airport Mode felt like having someone who already knew the terminal walk me through it — quietly, clearly.",
  },
  {
    name: "Priya S.",
    route: "Austin family trip",
    quote:
      "The memory recap at the end was unexpectedly moving. It captured the trip better than my camera roll alone.",
  },
] as const;

const pricingPlans = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: "/month",
    description: "Essential travel execution for one active trip.",
    cta: "Start free",
    highlighted: false,
    features: ["1 active trip", "Manual trip updates", "Core readiness board"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$9",
    period: "/month",
    description: "Automation and alerts for frequent travelers.",
    cta: "Start Pro",
    highlighted: true,
    features: ["Unlimited trips", "Gmail import + AI guidance", "Push gate & delay alerts"],
  },
  {
    id: "concierge",
    name: "Concierge",
    price: "$29",
    period: "/month",
    description: "Proactive support before disruption escalates.",
    cta: "Start Concierge",
    highlighted: false,
    features: ["5-minute monitoring", "Auto-rebook workflows", "Priority concierge support"],
  },
] as const;

/* ─── Subcomponents ───────────────────────────────────────────── */

function LandingNavbar({ userId }: { userId: string | null }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = (): void => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "border-b border-[var(--apple-border)] bg-[var(--apple-card)]/92 shadow-[0_1px_0_rgba(0,0,0,0.04)] backdrop-blur-xl"
          : "bg-transparent"
      }`}
    >
      <div className={`${container} flex h-16 items-center justify-between sm:h-[4.5rem]`}>
        <Link href="/" className="shrink-0" aria-label="Kepi Travel home">
          <Logo size="sm" />
        </Link>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Primary">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={`text-[15px] font-medium ${textSecondary} transition-colors hover:text-[var(--apple-text)]`}
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          {userId ? (
            <Link
              href="/travel-assistant"
              className={`${appleBtnPrimary} inline-flex min-h-[40px] items-center px-4 text-[15px]`}
            >
              Open app
            </Link>
          ) : (
            <>
              <Link
                href="/sign-in"
                className={`hidden sm:inline-flex min-h-[40px] items-center px-3 text-[15px] font-semibold ${textSecondary} transition-colors hover:text-[var(--apple-text)]`}
              >
                Sign in
              </Link>
              <Link
                href="/sign-up"
                className={`${appleBtnPrimary} inline-flex min-h-[40px] items-center px-4 text-[15px]`}
              >
                Download app
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function HeroSection({ userId, authCtaHref }: { userId: string | null; authCtaHref: string }) {
  const scrollToAirport = useCallback((): void => {
    document.getElementById("airport-mode")?.scrollIntoView({ behavior: "smooth" });
  }, []);

  return (
    <section className={`${sectionPad} pt-28 sm:pt-32`} aria-labelledby="hero-heading">
      <div className={`${container} grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16`}>
        <Reveal>
          <p className="inline-flex items-center gap-2 rounded-full border border-[var(--apple-border)] bg-[var(--apple-card)] px-3.5 py-1.5 text-[13px] font-medium text-[var(--apple-text-secondary)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--apple-accent)]" aria-hidden />
            Trip OS · not another booking site
          </p>
          <h1
            id="hero-heading"
            className="mt-6 max-w-xl text-[2.75rem] font-semibold leading-[1.08] tracking-tight text-[var(--apple-text)] sm:text-5xl lg:text-[3.25rem]"
          >
            Book anywhere. Kepi runs the trip.
          </h1>
          <p className={`mt-5 max-w-lg text-[17px] leading-relaxed sm:text-lg ${textSecondary}`}>
            Plan cities and dates in Kepi, compare flights and hotels, then book on Google, airlines, or Booking.com.
            Forward your confirmations — Kepi walks you through the whole journey with timeline, alerts, and airport
            guidance.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href={userId ? "/travel-assistant" : authCtaHref}
              className={`${appleBtnPrimary} inline-flex min-h-[48px] items-center justify-center gap-2 px-6 text-[17px]`}
            >
              Download app
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <button
              type="button"
              onClick={scrollToAirport}
              className={`${appleBtnSecondary} inline-flex min-h-[48px] items-center justify-center gap-2 px-6 text-[17px]`}
            >
              <Play className="h-4 w-4 fill-current" aria-hidden />
              Watch demo
            </button>
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[var(--apple-border)] pt-8">
            {["Forward confirmations", "Real-time flight monitoring", "iOS & web"].map((item) => (
              <span key={item} className={`inline-flex items-center gap-2 text-[13px] ${textSecondary}`}>
                <CheckCircle2 className="h-3.5 w-3.5 text-[var(--apple-accent)]" aria-hidden />
                {item}
              </span>
            ))}
          </div>

          {!userId ? (
            <div className="mt-8 max-w-md">
              <InviteCodeForm />
            </div>
          ) : null}
        </Reveal>

        <Reveal delay={0.1} className="relative mx-auto w-full max-w-[22rem] lg:max-w-none">
          <div className="absolute -inset-6 rounded-[2.5rem] bg-[var(--bg-grouped)]/80 blur-2xl" aria-hidden />
          <div className="relative overflow-hidden rounded-[2rem] border border-[var(--apple-border)] bg-[var(--apple-card)] shadow-[var(--shadow-card)]">
            <div className="border-b border-[var(--apple-border)] px-5 py-4">
              <p className="text-[13px] font-medium text-[var(--apple-text-secondary)]">Today · SFO → JFK</p>
              <p className="mt-1 text-[22px] font-semibold tracking-tight text-[var(--apple-text)]">UA 410 · On time</p>
            </div>
            <div className="space-y-3 p-5">
              <div className="rounded-[14px] bg-[var(--bg-grouped)] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--apple-accent)]">
                  Airport Mode
                </p>
                <p className="mt-2 text-[15px] font-medium text-[var(--apple-text)]">Security → Gate C12</p>
                <p className={`mt-1 text-[13px] ${textSecondary}`}>12 min walk · PreCheck lane open</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-[14px] border border-[var(--apple-border)] p-3">
                  <p className={`text-[11px] ${textSecondary}`}>Leave by</p>
                  <p className="mt-1 text-[17px] font-semibold text-[var(--apple-text)]">11:55 AM</p>
                </div>
                <div className="rounded-[14px] border border-[var(--apple-border)] p-3">
                  <p className={`text-[11px] ${textSecondary}`}>Boarding</p>
                  <p className="mt-1 text-[17px] font-semibold text-[var(--apple-text)]">1:25 PM</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-[14px] border border-[var(--apple-border)] p-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--bg-grouped)]">
                  <Plane className="h-4 w-4 text-[var(--apple-accent)]" aria-hidden />
                </span>
                <div>
                  <p className="text-[14px] font-medium text-[var(--apple-text)]">Gate updated · C12</p>
                  <p className={`text-[12px] ${textSecondary}`}>Notified 8 minutes ago</p>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function ProductDifferenceSection() {
  return (
    <section id="features" className={sectionPad} aria-labelledby="features-heading">
      <div className={container}>
        <Reveal className="max-w-2xl">
          <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[var(--apple-accent)]">Why Kepi</p>
          <h2 id="features-heading" className={`mt-3 ${appleSectionHeader} text-[2rem] sm:text-[2.25rem]`}>
            Not a booking site. A companion for the whole trip.
          </h2>
          <p className={`mt-4 text-[17px] leading-relaxed ${textSecondary}`}>
            Most tools stop at confirmation emails. Kepi stays with you — before wheels up, through the terminal, and
            long after you land.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-5 lg:grid-cols-3">
          {pillars.map((pillar, index) => (
            <Reveal key={pillar.title} delay={index * 0.08}>
              <article className="apple-card flex h-full flex-col p-7 sm:p-8">
                <span className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-[var(--bg-grouped)]">
                  <pillar.icon className="h-5 w-5 text-[var(--apple-text-secondary)]" strokeWidth={1.75} aria-hidden />
                </span>
                <h3 className="mt-6 text-[22px] font-semibold tracking-tight text-[var(--apple-text)]">{pillar.title}</h3>
                <p className={`mt-3 flex-1 text-[16px] leading-relaxed ${textSecondary}`}>{pillar.description}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function AirportModeSection() {
  return (
    <section
      id="airport-mode"
      className={`${sectionPad} bg-[var(--apple-card)]`}
      aria-labelledby="airport-heading"
    >
      <div className={`${container} grid items-center gap-12 lg:grid-cols-2 lg:gap-20`}>
        <Reveal className="order-2 lg:order-1">
          <div className="relative mx-auto max-w-[19rem] sm:max-w-[21rem]">
            <div
              className="absolute inset-x-8 -bottom-6 h-12 rounded-full bg-black/[0.06] blur-2xl"
              aria-hidden
            />
            <div className="relative overflow-hidden rounded-[2.25rem] border-[6px] border-[var(--apple-text)] bg-[var(--apple-card)] shadow-[0_24px_60px_rgba(0,0,0,0.12)]">
              <div className="bg-[var(--bg-grouped)] px-4 py-2 text-center text-[11px] font-medium text-[var(--apple-text-secondary)]">
                9:41
              </div>
              <div className="space-y-4 p-4">
                <div className="rounded-2xl bg-[var(--apple-accent)] p-4 text-white">
                  <p className="text-[11px] font-semibold uppercase tracking-wider opacity-90">Airport Mode active</p>
                  <p className="mt-2 text-[20px] font-semibold leading-tight">Terminal 3 → Gate C12</p>
                  <p className="mt-2 text-[13px] opacity-90">12 min · Stay on Level 2</p>
                </div>
                <div className="space-y-2">
                  {["Clear security — PreCheck", "Walk past Gate C8–C10", "Arrive at C12 · boarding 1:25"].map(
                    (step, i) => (
                      <div
                        key={step}
                        className="flex items-start gap-3 rounded-xl border border-[var(--apple-border)] px-3 py-2.5"
                      >
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--bg-grouped)] text-[11px] font-semibold text-[var(--apple-accent)]">
                          {i + 1}
                        </span>
                        <p className="text-[14px] leading-snug text-[var(--apple-text)]">{step}</p>
                      </div>
                    ),
                  )}
                </div>
                <div className="rounded-xl border border-amber-200/80 bg-amber-50 px-3 py-2.5">
                  <p className="text-[12px] font-medium text-amber-900">You&apos;re one concourse away — head left at sign 14</p>
                </div>
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal className="order-1 lg:order-2" delay={0.05}>
          <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[var(--apple-accent)]">
            Airport Mode
          </p>
          <h2 id="airport-heading" className="mt-3 text-[2rem] font-semibold leading-tight tracking-tight text-[var(--apple-text)] sm:text-[2.5rem]">
            Calm guidance when terminals get loud.
          </h2>
          <p className={`mt-4 text-[17px] leading-relaxed ${textSecondary}`}>
            The feature travelers feel first. Live airport guidance, gate updates, and step-by-step navigation — designed
            to reduce anxiety, not add another screen to stare at.
          </p>

          <ul className="mt-8 space-y-4">
            {airportFeatures.map((feature) => (
              <li key={feature.label} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[var(--bg-grouped)]">
                  <feature.icon className="h-[18px] w-[18px] text-[var(--apple-text-secondary)]" strokeWidth={1.75} aria-hidden />
                </span>
                <div>
                  <p className="text-[16px] font-semibold text-[var(--apple-text)]">{feature.label}</p>
                  <p className={`mt-0.5 text-[15px] ${textSecondary}`}>{feature.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

function JourneySection() {
  return (
    <section id="journey" className={sectionPad} aria-labelledby="journey-heading">
      <div className={container}>
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[var(--apple-accent)]">End to end</p>
          <h2 id="journey-heading" className="mt-3 text-[2rem] font-semibold tracking-tight text-[var(--apple-text)] sm:text-[2.25rem]">
            With you before, during, and after.
          </h2>
          <p className={`mt-4 text-[17px] leading-relaxed ${textSecondary}`}>
            One continuous thread — from the first packing note to the last photo from the trip.
          </p>
        </Reveal>

        <div className="relative mt-16">
          <div
            className="absolute left-4 top-0 hidden h-full w-px bg-[var(--apple-border)] sm:left-1/2 sm:block"
            aria-hidden
          />
          <div className="space-y-10 sm:space-y-14">
            {journeySteps.map((step, index) => (
              <Reveal key={step.phase} delay={index * 0.06}>
                <div
                  className={`relative grid items-center gap-6 sm:grid-cols-2 sm:gap-12 ${
                    index % 2 === 1 ? "sm:[&>div:first-child]:order-2" : ""
                  }`}
                >
                  <div className={`${index % 2 === 1 ? "sm:text-right" : ""}`}>
                    <span className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[var(--apple-accent)]">
                      {step.phase}
                    </span>
                    <h3 className="mt-2 text-[22px] font-semibold text-[var(--apple-text)]">{step.title}</h3>
                    <p className={`mt-3 text-[16px] leading-relaxed ${textSecondary}`}>{step.body}</p>
                  </div>
                  <div className="apple-card p-6 sm:p-7">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--apple-accent)] text-[13px] font-bold text-white">
                        {index + 1}
                      </span>
                      <p className="text-[15px] font-medium text-[var(--apple-text)]">{step.phase} your trip</p>
                    </div>
                    <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--bg-grouped)]">
                      <div
                        className="h-full rounded-full bg-[var(--apple-accent)]"
                        style={{ width: `${((index + 1) / journeySteps.length) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function MemoriesSection() {
  return (
    <section
      id="memories"
      className={`${sectionPad} bg-[var(--bg-grouped)]`}
      aria-labelledby="memories-heading"
    >
      <div className={container}>
        <div className="grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <Reveal>
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[var(--apple-accent)]">Memories</p>
            <h2 id="memories-heading" className="mt-3 text-[2rem] font-semibold tracking-tight text-[var(--apple-text)] sm:text-[2.5rem]">
              The trip doesn&apos;t end at baggage claim.
            </h2>
            <p className={`mt-4 text-[17px] leading-relaxed ${textSecondary}`}>
              Kepi weaves your photos, cities, and moments into a quiet recap — an editorial memory of the journey, not a
              slideshow template.
            </p>
            <div className="mt-8 flex items-start gap-3 rounded-[18px] border border-[var(--apple-border)] bg-[var(--apple-card)] p-5">
              <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-[var(--apple-accent)]" aria-hidden />
              <div>
                <p className="text-[16px] font-semibold text-[var(--apple-text)]">Automatic photo collages</p>
                <p className={`mt-1 text-[15px] leading-relaxed ${textSecondary}`}>
                  Places, dates, and routes arranged with restraint — ready to share or keep private.
                </p>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.08}>
            <div className="grid grid-cols-6 grid-rows-4 gap-3 sm:gap-4">
              <div className="col-span-4 row-span-4 overflow-hidden rounded-[18px] border border-[var(--apple-border)] bg-[var(--apple-card)] shadow-[var(--shadow-card)]">
                <div className="relative h-full min-h-[280px] w-full">
                  <Image
                    src={memoryTiles[0].src}
                    alt={memoryTiles[0].alt}
                    fill
                    className="object-cover"
                    sizes="(max-width: 1024px) 100vw, 40vw"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/45 to-transparent p-4">
                    <p className="text-[13px] font-medium text-white">{memoryTiles[0].caption}</p>
                  </div>
                </div>
              </div>
              {memoryTiles.slice(1).map((tile, i) => (
                <div
                  key={tile.caption}
                  className={`overflow-hidden rounded-[14px] border border-[var(--apple-border)] bg-[var(--apple-card)] shadow-[var(--shadow-card)] ${
                    i === 0 ? "col-span-2 row-span-2" : "col-span-2 row-span-2"
                  }`}
                >
                  <div className="relative h-full min-h-[120px] w-full">
                    <Image
                      src={tile.src}
                      alt={tile.alt}
                      fill
                      className="object-cover"
                      sizes="200px"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/40 to-transparent p-2.5">
                      <p className="text-[11px] font-medium text-white">{tile.caption}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function SocialProofSection() {
  return (
    <section className={sectionPad} aria-labelledby="social-heading">
      <div className={container}>
        <Reveal className="flex flex-col items-start justify-between gap-8 border-b border-[var(--apple-border)] pb-12 sm:flex-row sm:items-end">
          <div className="max-w-xl">
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[var(--apple-accent)]">
              Travelers
            </p>
            <h2 id="social-heading" className="mt-3 text-[2rem] font-semibold tracking-tight text-[var(--apple-text)]">
              Trusted when plans change fast.
            </h2>
          </div>
          <div className="flex flex-wrap gap-8 sm:gap-12">
            {stats.map((stat) => (
              <div key={stat.label}>
                <p className="text-[2rem] font-semibold tracking-tight text-[var(--apple-text)]">{stat.value}</p>
                <p className={`mt-1 ${appleCaption}`}>{stat.label}</p>
              </div>
            ))}
          </div>
        </Reveal>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {testimonials.map((item, index) => (
            <Reveal key={item.name} delay={index * 0.06}>
              <blockquote className="apple-card flex h-full flex-col p-7">
                <p className={`flex-1 text-[16px] leading-relaxed ${textSecondary}`}>&ldquo;{item.quote}&rdquo;</p>
                <footer className="mt-6 border-t border-[var(--apple-border)] pt-5">
                  <p className="text-[15px] font-semibold text-[var(--apple-text)]">{item.name}</p>
                  <p className={appleCaption}>{item.route}</p>
                </footer>
              </blockquote>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingSection({
  authCtaHref,
  hasProAccess,
  userId,
}: {
  authCtaHref: string;
  hasProAccess: boolean;
  userId: string | null;
}) {
  if (hasProAccess) {
    return (
      <section id="pricing" className={`${sectionPad} bg-[var(--bg-grouped)]`}>
        <div className={container}>
          <Reveal className="apple-card mx-auto max-w-2xl p-8 text-center sm:p-10">
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[var(--apple-accent)]">
              Your plan
            </p>
            <h2 className="mt-3 text-[1.75rem] font-semibold text-[var(--apple-text)]">Pro access is active</h2>
            <p className={`mt-3 ${appleMetadata}`}>Open your trip workspace to continue planning and guiding.</p>
            <Link
              href="/travel-assistant"
              className={`${appleBtnPrimary} mt-6 inline-flex min-h-[48px] items-center px-6 text-[17px]`}
            >
              Open app
            </Link>
          </Reveal>
        </div>
      </section>
    );
  }

  return (
    <section id="pricing" className={`${sectionPad} bg-[var(--bg-grouped)]`} aria-labelledby="pricing-heading">
      <div className={container}>
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[var(--apple-accent)]">Pricing</p>
          <h2 id="pricing-heading" className="mt-3 text-[2rem] font-semibold tracking-tight text-[var(--apple-text)]">
            Plans that match how often you travel.
          </h2>
          <p className={`mt-4 ${appleMetadata}`}>Start free. Upgrade when you want automation, alerts, and priority support.</p>
        </Reveal>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {pricingPlans.map((plan, index) => (
            <Reveal key={plan.id} delay={index * 0.06}>
              <article
                className={`relative flex h-full flex-col rounded-[18px] border p-7 sm:p-8 ${
                  plan.highlighted
                    ? "border-[var(--apple-accent)] bg-[var(--apple-card)] shadow-[0_8px_30px_rgba(0,122,255,0.08)]"
                    : "border-[var(--apple-border)] bg-[var(--apple-card)] shadow-[var(--shadow-card)]"
                }`}
              >
                {plan.highlighted ? (
                  <span className="absolute right-5 top-5 rounded-full bg-[var(--apple-accent)] px-2.5 py-1 text-[11px] font-semibold text-white">
                    Popular
                  </span>
                ) : null}
                <h3 className="text-[20px] font-semibold text-[var(--apple-text)]">{plan.name}</h3>
                <p className="mt-3 text-[2.25rem] font-semibold tracking-tight text-[var(--apple-text)]">
                  {plan.price}
                  <span className={`text-[15px] font-medium ${textSecondary}`}>{plan.period}</span>
                </p>
                <p className={`mt-2 text-[15px] ${textSecondary}`}>{plan.description}</p>
                <ul className={`mt-6 flex-1 space-y-2.5 text-[15px] ${textSecondary}`}>
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--apple-accent)]" aria-hidden />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link
                  href={userId ? "/billing" : authCtaHref}
                  className={`mt-8 inline-flex min-h-[44px] w-full items-center justify-center text-[16px] ${
                    plan.highlighted ? appleBtnPrimary : appleBtnSecondary
                  }`}
                >
                  {plan.cta}
                </Link>
              </article>
            </Reveal>
          ))}
        </div>

        <p className={`mt-8 text-center ${appleCaption}`}>
          <Link href="/billing" className="font-semibold text-[var(--apple-accent)] hover:underline">
            Manage billing &amp; invites
          </Link>
        </p>
      </div>
    </section>
  );
}

function FinalCtaSection({ userId, authCtaHref }: { userId: string | null; authCtaHref: string }) {
  return (
    <section className={`${sectionPad} pb-24`} aria-labelledby="cta-heading">
      <div className={container}>
        <Reveal>
          <div className="overflow-hidden rounded-[24px] border border-[var(--apple-border)] bg-[var(--apple-card)] px-6 py-14 text-center shadow-[var(--shadow-card)] sm:px-12 sm:py-16">
            <h2 id="cta-heading" className="mx-auto max-w-2xl text-[2rem] font-semibold leading-tight tracking-tight text-[var(--apple-text)] sm:text-[2.5rem]">
              One intelligent companion from departure to memory.
            </h2>
            <p className={`mx-auto mt-4 max-w-lg text-[17px] leading-relaxed ${textSecondary}`}>
              Download Kepi Travel and let Airport Mode guide you through your next terminal — calmly, clearly, on time.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href={userId ? "/travel-assistant" : authCtaHref}
                className={`${appleBtnPrimary} inline-flex min-h-[48px] items-center gap-2 px-7 text-[17px]`}
              >
                Download app
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                href="/sign-in"
                className={`${appleBtnSecondary} inline-flex min-h-[48px] items-center px-7 text-[17px]`}
              >
                Sign in
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer className="border-t border-[var(--apple-border)] bg-[var(--apple-card)] px-4 py-10 sm:px-8">
      <div className={`${container} flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between`}>
        <Logo size="sm" />
        <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Footer">
          {[
            { href: "/privacy", label: "Privacy" },
            { href: "/terms", label: "Terms" },
            { href: "mailto:support@kepitravel.com", label: "Support" },
            { href: "https://x.com/kepitravel", label: "@kepitravel", external: true },
          ].map((link) =>
            link.external ? (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className={`text-[14px] ${textSecondary} hover:text-[var(--apple-text)]`}
              >
                {link.label}
              </a>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                className={`text-[14px] ${textSecondary} hover:text-[var(--apple-text)]`}
              >
                {link.label}
              </Link>
            ),
          )}
        </nav>
        <p className={`text-[13px] ${textSecondary}`}>&copy; {new Date().getFullYear()} Kepi Travel</p>
      </div>
    </footer>
  );
}

/* ─── Main export ─────────────────────────────────────────────── */

export interface HomeLandingProps {
  userId: string | null;
  hasProAccess: boolean;
}

export function HomeLanding({ userId, hasProAccess }: HomeLandingProps) {
  const authCtaHref = userId ? "/travel-assistant" : "/sign-up";

  return (
    <div className={`min-h-screen ${pageBg} ${textPrimary} antialiased`}>
      <LandingNavbar userId={userId} />
      <main>
        <HeroSection userId={userId} authCtaHref={authCtaHref} />
        <ProductDifferenceSection />
        <AirportModeSection />
        <JourneySection />
        <MemoriesSection />
        <SocialProofSection />
        <PricingSection authCtaHref={authCtaHref} hasProAccess={hasProAccess} userId={userId} />
        <FinalCtaSection userId={userId} authCtaHref={authCtaHref} />
      </main>
      <LandingFooter />
    </div>
  );
}
