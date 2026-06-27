import test from "node:test";
import assert from "node:assert/strict";
import { analyzeTravelHabits, habitsLearningCopy } from "./analyzeTravelHabits";
import { buildTravelFitReport } from "./buildTravelFitReport";
import { createSampleGenome } from "@/lib/traveler/sampleGenome";

test("analyzeTravelHabits learns airline share from flights", () => {
  const habits = analyzeTravelHabits({
    userId: "u1",
    reservations: [
      { id: "1", type: "flight", provider: "Alaska Airlines", flightArrivalAirport: "HND" },
      { id: "2", type: "flight", provider: "Alaska Airlines", flightArrivalAirport: "SEA" },
      { id: "3", type: "flight", provider: "United", flightArrivalAirport: "FCO" },
    ],
    homeAirports: ["SNA", "LAX"],
  });
  assert.equal(habits.topAirlines[0]?.airlineCode, "AS");
  assert.ok(habits.topAirlines[0]!.share >= 60);
  assert.equal(habits.confidence, "low");
});

test("buildTravelFitReport recommends airline with hub fit", () => {
  const genome = createSampleGenome("u1");
  const report = buildTravelFitReport({
    userId: "u1",
    genome,
    reservations: [
      { id: "1", type: "flight", provider: "Alaska", flightArrivalAirport: "HND" },
      { id: "2", type: "hotel", provider: "Hyatt", title: "Hyatt Regency Seattle", location: "Seattle" },
    ],
  });
  assert.ok(report.airlineFit[0]?.program.includes("Alaska") || report.airlineFit[0]?.score > 50);
  assert.ok(report.learningMessage.length > 20);
  assert.ok(habitsLearningCopy(report.habits).includes("Kepi"));
});
