/** Dev smoke test: document reconciliation catches mismatched totals. */
import { reconcileRentRoll, reconcileT12 } from "../../src/lib/reconciliation";
import type { RentRoll, T12 } from "../../src/lib/extraction";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`OK: ${message}`);
}

const cleanRentRoll: RentRoll = {
  as_of_date: "2025-01-01",
  units: [
    { unit: "101", unit_type: "1BR", sqft: 650, tenant: "A", monthly_rent: 1000, lease_end: null, occupied: true },
    { unit: "102", unit_type: "1BR", sqft: 650, tenant: "B", monthly_rent: 1000, lease_end: null, occupied: true },
  ],
  totals: {
    unit_count: 2,
    occupied_count: 2,
    monthly_scheduled_rent: 2000,
    occupancy_rate: 1,
  },
  notes: null,
};

const badRentRoll: RentRoll = {
  ...cleanRentRoll,
  totals: { ...cleanRentRoll.totals, monthly_scheduled_rent: 5000 },
};

const cleanT12: T12 = {
  period_start: "2024-01-01",
  period_end: "2024-12-31",
  income: {
    gross_potential_rent: 120000,
    vacancy_loss: 6000,
    other_income: 2000,
    effective_gross_income: 116000,
  },
  expenses: {
    taxes: 10000,
    insurance: 5000,
    utilities: 3000,
    repairs_maintenance: 4000,
    management: 6000,
    other: 2000,
    total_operating_expenses: 30000,
  },
  net_operating_income: 86000,
  notes: null,
};

const badT12: T12 = {
  ...cleanT12,
  net_operating_income: 50000,
};

const rrClean = reconcileRentRoll(cleanRentRoll);
assert(rrClean.ok, "clean rent roll passes");

const rrBad = reconcileRentRoll(badRentRoll);
assert(!rrBad.ok, "mismatched rent roll fails");
assert(rrBad.issues.length > 0, "mismatched rent roll reports issues");

const t12Clean = reconcileT12(cleanT12);
assert(t12Clean.ok, "clean T-12 passes");

const t12Bad = reconcileT12(badT12);
assert(!t12Bad.ok, "mismatched T-12 fails");
assert(t12Bad.issues.length > 0, "mismatched T-12 reports issues");

console.log("All reconciliation smoke checks passed");
process.exit(0);
