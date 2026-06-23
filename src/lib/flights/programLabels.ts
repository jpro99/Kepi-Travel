import type { LoyaltyProgram } from "./types";

// Pure, dependency-free — safe to import from client components.
// cppValuations.ts re-exports labelFor from here so server code has one source of truth too.
const PROGRAM_LABELS: Partial<Record<LoyaltyProgram, string>> = {
  chase_ur: "Chase UR",
  amex_mr: "Amex MR",
  capitalone: "Capital One",
  citi_typ: "Citi TYP",
  united: "United",
  american: "American",
  delta: "Delta",
  alaska: "Alaska",
  aeroplan: "Aeroplan",
  flyingblue: "Flying Blue",
  avios_ba: "BA Avios",
  lifemiles: "LifeMiles",
  singapore_krisflyer: "Singapore",
};

export function labelFor(program: LoyaltyProgram): string {
  return PROGRAM_LABELS[program] ?? program;
}
