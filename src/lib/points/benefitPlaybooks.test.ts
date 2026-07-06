import test from "node:test";
import assert from "node:assert/strict";
import {
  applyEnrollmentToPlaybook,
  filterPlaybooksByEnrollment,
  getBenefitPlaybook,
  playbooksForCard,
} from "@/lib/points/benefitPlaybooks";

test("playbooksForCard returns Amex lounge playbooks", () => {
  const playbooks = playbooksForCard("amex-platinum");
  assert.ok(playbooks.some((entry) => entry.id === "amex-centurion-lounge"));
  assert.ok(playbooks.some((entry) => entry.id === "amex-priority-pass"));
});

test("filterPlaybooksByEnrollment hides Priority Pass when not enrolled", () => {
  const playbooks = playbooksForCard("amex-platinum");
  const filtered = filterPlaybooksByEnrollment(playbooks, { priorityPassEnrolled: false });
  assert.equal(filtered.some((entry) => entry.id === "amex-priority-pass"), false);
  assert.ok(filtered.some((entry) => entry.id === "amex-centurion-lounge"));
});

test("getBenefitPlaybook returns steps for Centurion", () => {
  const playbook = getBenefitPlaybook("amex-centurion-lounge");
  assert.ok(playbook?.steps.some((step) => step.toLowerCase().includes("amex app")));
});

test("applyEnrollmentToPlaybook returns enrollment steps when Priority Pass not enrolled", () => {
  const playbook = getBenefitPlaybook("amex-priority-pass");
  const applied = applyEnrollmentToPlaybook(playbook, { priorityPassEnrolled: false });
  assert.equal(applied.enrollmentRequired, true);
  assert.ok(applied.entrySteps?.some((step) => step.toLowerCase().includes("priority pass")));
});

test("applyEnrollmentToPlaybook returns full steps when enrolled", () => {
  const playbook = getBenefitPlaybook("amex-priority-pass");
  const applied = applyEnrollmentToPlaybook(playbook, { priorityPassEnrolled: true });
  assert.equal(applied.enrollmentRequired, false);
  assert.ok(applied.entrySteps?.some((step) => step.toLowerCase().includes("qr")));
});
