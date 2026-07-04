import { int, num, parseDate, str } from "./lib";
import { parcelVector, toVectorLiteral } from "../../src/lib/embeddings";

export const DATASTORE_RESOURCE_ID = "65855e14-549e-4992-b5be-d629afc676fa";

export const PARCEL_COLUMNS = [
  "parid", "house_num", "fraction", "address", "unit", "city", "state", "zip",
  "muni_code", "muni_desc", "school_code", "school_desc", "neigh_code",
  "neigh_desc", "tax_code", "class", "class_desc", "use_code", "use_desc",
  "lot_area", "homestead", "county_building", "county_land", "county_total",
  "local_total", "fair_market_building", "fair_market_land",
  "fair_market_total", "style_desc", "stories", "year_built", "exterior_desc",
  "roof_desc", "basement_desc", "grade", "grade_desc", "condition",
  "condition_desc", "total_rooms", "bedrooms", "full_baths", "half_baths",
  "heating_cooling_desc", "fireplaces", "basement_garage",
  "finished_living_area", "tax_year", "as_of_date", "embedding",
];

export type ParcelRecord = Record<string, unknown>;

export function parcelRow(r: ParcelRecord): unknown[] | null {
  const parid = str(r.PARID);
  if (!parid) return null;
  const card = int(r.CARDNUMBER);
  if (card != null && card > 1) return null;

  const characteristics = {
    finished_living_area: num(r.FINISHEDLIVINGAREA),
    lot_area: num(r.LOTAREA),
    bedrooms: int(r.BEDROOMS),
    full_baths: int(r.FULLBATHS),
    half_baths: int(r.HALFBATHS),
    total_rooms: int(r.TOTALROOMS),
    year_built: int(r.YEARBLT),
    stories: num(r.STORIES),
    fireplaces: int(r.FIREPLACES),
    basement_garage: int(r.BSMTGARAGE),
    condition: str(r.CONDITION),
    grade: str(r.GRADE),
    county_total: num(r.COUNTYTOTAL),
  };

  return [
    parid,
    str(r.PROPERTYHOUSENUM), str(r.PROPERTYFRACTION), str(r.PROPERTYADDRESS),
    str(r.PROPERTYUNIT), str(r.PROPERTYCITY), str(r.PROPERTYSTATE),
    str(r.PROPERTYZIP),
    str(r.MUNICODE), str(r.MUNIDESC), str(r.SCHOOLCODE), str(r.SCHOOLDESC),
    str(r.NEIGHCODE), str(r.NEIGHDESC), str(r.TAXCODE),
    str(r.CLASS), str(r.CLASSDESC), str(r.USECODE), str(r.USEDESC),
    num(r.LOTAREA),
    str(r.HOMESTEADFLAG) === "HOM",
    num(r.COUNTYBUILDING), num(r.COUNTYLAND), num(r.COUNTYTOTAL),
    num(r.LOCALTOTAL),
    num(r.FAIRMARKETBUILDING), num(r.FAIRMARKETLAND), num(r.FAIRMARKETTOTAL),
    str(r.STYLEDESC), num(r.STORIES), int(r.YEARBLT), str(r.EXTFINISH_DESC),
    str(r.ROOFDESC), str(r.BASEMENTDESC), str(r.GRADE), str(r.GRADEDESC),
    str(r.CONDITION), str(r.CONDITIONDESC), int(r.TOTALROOMS),
    int(r.BEDROOMS), int(r.FULLBATHS), int(r.HALFBATHS),
    str(r.HEATINGCOOLINGDESC), int(r.FIREPLACES), int(r.BSMTGARAGE),
    num(r.FINISHEDLIVINGAREA), int(r.TAXYEAR), parseDate(r.ASOFDATE),
    toVectorLiteral(parcelVector(characteristics)),
  ];
}

export function saleRows(r: ParcelRecord): unknown[][] {
  const parid = str(r.PARID);
  if (!parid) return [];
  const rows: unknown[][] = [];

  const saleDate = parseDate(r.SALEDATE);
  const salePrice = num(r.SALEPRICE);
  if (saleDate && salePrice != null) {
    const desc = (str(r.SALEDESC) ?? "").toUpperCase();
    rows.push([parid, saleDate, salePrice, str(r.SALECODE), str(r.SALEDESC),
      desc.includes("VALID")]);
  }
  for (const [d, p] of [
    [r.PREVSALEDATE, r.PREVSALEPRICE],
    [r.PREVSALEDATE2, r.PREVSALEPRICE2],
  ]) {
    const date = parseDate(d);
    const price = num(p);
    if (date && price != null) {
      rows.push([parid, date, price, null, "PRIOR SALE", price >= 10000]);
    }
  }
  return rows;
}

export function hasValidSale(r: ParcelRecord): boolean {
  const saleDate = parseDate(r.SALEDATE);
  const salePrice = num(r.SALEPRICE);
  if (!saleDate || salePrice == null) return false;
  const desc = (str(r.SALEDESC) ?? "").toUpperCase();
  return desc.includes("VALID");
}

export function recordParid(r: ParcelRecord): string | null {
  return str(r.PARID);
}
