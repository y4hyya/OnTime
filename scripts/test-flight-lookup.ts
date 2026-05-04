import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

function defaultUtcTomorrow(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const iata = process.argv[2];
  const date = process.argv[3] ?? defaultUtcTomorrow();

  if (!iata) {
    console.error(
      "Usage: pnpm tsx scripts/test-flight-lookup.ts <iata> [YYYY-MM-DD]",
    );
    console.error("Example: pnpm tsx scripts/test-flight-lookup.ts LH1234");
    process.exit(1);
  }

  const { getFlight } = await import("../src/lib/flights/cache");

  console.log(`Looking up ${iata} on ${date}...`);
  const result = await getFlight(iata, date);

  if (!result) {
    console.log("No flight found.");
    process.exit(0);
  }

  console.log(`source: ${result.source}`);
  console.log(JSON.stringify(result.data, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
