/** York onboarding smoke test: comps, savings score, millage, appeal window. */
process.loadEnvFile();

async function main() {
  const { getPool } = await import("../../src/lib/db");
  const { computeSavingsScore } = await import("../../src/lib/savings");
  const { getCountyAdapter } = await import("../../src/lib/counties/registry");
  const pool = getPool();

  const adapter = getCountyAdapter("York");
  const win = await adapter.appealWindow();
  console.log("appeal window:", win);
  const clr = await adapter.clr();
  console.log("clr:", clr);

  // A residential parcel with sqft data and a likely gap (recent high sale vs assessed)
  const { rows: res } = await pool.query(
    `select p.parid, p.full_address, p.muni_desc, p.school_desc, p.county_total
     from parcels p
     join sales s on s.parid = p.parid and s.is_valid_sale
     where p.county = 'York' and p.class = 'R' and p.finished_living_area > 1000
       and s.sale_date > '2021-06-01' and s.sale_price > p.county_total / 0.4
     limit 1`
  );
  console.log("\nresidential subject:", res[0]);
  const score = await computeSavingsScore(res[0].parid, { refresh: true });
  console.log("res score:", {
    fmv: score?.estimated_fmv, current: score?.current_assessed,
    implied: score?.implied_assessed, savings: score?.estimated_annual_savings,
    millage: score?.millage, method: score?.comp_result.method,
    comps: score?.comp_result.comps.length, prob: score?.probability,
  });
  console.log("narrative:", score?.comp_result.narrative);

  // A commercial parcel
  const { rows: com } = await pool.query(
    `select p.parid, p.full_address, p.muni_desc, p.county_total
     from parcels p
     join sales s on s.parid = p.parid and s.is_valid_sale
     where p.county = 'York' and p.class = 'C' and p.finished_living_area > 2000
       and s.sale_date > '2021-06-01' and s.sale_price > p.county_total / 0.4
     limit 1`
  );
  console.log("\ncommercial subject:", com[0]);
  const cscore = await computeSavingsScore(com[0].parid, { refresh: true });
  console.log("com score:", {
    fmv: cscore?.estimated_fmv, current: cscore?.current_assessed,
    implied: cscore?.implied_assessed, savings: cscore?.estimated_annual_savings,
    millage: cscore?.millage, method: cscore?.comp_result.method,
    comps: cscore?.comp_result.comps.length, valuation: cscore?.valuation?.selected,
  });

  // Millage lookup sanity for a two-school-district township
  const mills = await adapter.millageTable({
    municipality: "NEWBERRY TWP", schoolDistrict: "West Shore", taxYear: 2026,
  });
  console.log("\nNewberry Twp / West Shore mills:", mills);

  // Allegheny regression: unchanged behavior
  const { rows: alle } = await pool.query(
    `select parid from parcels where county = 'Allegheny' and class = 'R'
       and finished_living_area > 1000 limit 1`
  );
  const ascore = await computeSavingsScore(alle[0].parid, { refresh: true });
  console.log("\nallegheny regression:", {
    parid: alle[0].parid, fmv: ascore?.estimated_fmv,
    comps: ascore?.comp_result.comps.length, millage: ascore?.millage,
  });

  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
