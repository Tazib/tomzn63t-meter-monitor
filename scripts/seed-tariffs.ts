// Seeds the BERC LT-A residential tariff (order effective June 2026). Safe to re-run.
// Rates can be edited later on the Tariffs page; add a new version when BERC changes them.
import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../src/db";

const PLAN = {
  name: "BERC LT-A Residential",
  description: "Domestic low-tension tariff, same for DESCO, DPDC, BPDB, NESCO, WZPDCL and REB.",
};

const VERSION = {
  effectiveFrom: "2026-06-01",
  lifelineMaxKwh: "50",
  lifelineRate: "4.63",
  demandChargePerKw: "42",
  vatPercent: "5",
};

// [from, to, Tk/kWh]; to = null means no upper limit.
const SLABS: [number, number | null, number][] = [
  [0, 75, 5.26],
  [75, 200, 8.5],
  [200, 300, 9.1],
  [300, 400, 9.62],
  [400, 600, 15.01],
  [600, null, 17.35],
];

async function main() {
  let [plan] = await db.select().from(schema.tariffPlans).where(eq(schema.tariffPlans.name, PLAN.name));
  if (!plan) [plan] = await db.insert(schema.tariffPlans).values(PLAN).returning();

  const [existing] = await db
    .select()
    .from(schema.tariffVersions)
    .where(and(eq(schema.tariffVersions.planId, plan.id), eq(schema.tariffVersions.effectiveFrom, VERSION.effectiveFrom)));
  if (existing) {
    console.log(`${PLAN.name} (${VERSION.effectiveFrom}) already exists.`);
    return;
  }

  await db.transaction(async (tx) => {
    const [version] = await tx.insert(schema.tariffVersions).values({ planId: plan.id, ...VERSION }).returning();
    await tx.insert(schema.tariffSlabs).values(
      SLABS.map(([from, to, rate]) => ({
        versionId: version.id,
        fromKwh: String(from),
        toKwh: to === null ? null : String(to),
        rate: String(rate),
      })),
    );
  });
  console.log(`Created ${PLAN.name} effective ${VERSION.effectiveFrom}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
