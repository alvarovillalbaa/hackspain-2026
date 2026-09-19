import type { CompanyRef } from "../types";

/** Curated demo portfolio — maps to plausible COMP_ ids from the dataset. */
export const DEMO_COMPANIES: CompanyRef[] = [
  {
    company_id: "COMP_0001",
    group_id: "GROUP_0001",
    name: "Norte Distribución S.L.",
    country: "ES",
    currency: "EUR",
    n_companies_in_group: 3,
  },
  {
    company_id: "COMP_0047",
    group_id: "GROUP_0012",
    name: "Alba Manufacturas",
    country: "ES",
    currency: "EUR",
    n_companies_in_group: 2,
  },
  {
    company_id: "COMP_0203",
    group_id: "GROUP_0044",
    name: "Costa Retail Group",
    country: "ES",
    currency: "EUR",
    n_companies_in_group: 5,
  },
  {
    company_id: "COMP_0556",
    group_id: "GROUP_0088",
    name: "Nordic Events AB",
    country: "SE",
    currency: "SEK",
    n_companies_in_group: 1,
  },
  {
    company_id: "COMP_0742",
    group_id: "GROUP_0110",
    name: "Iberia Logistics Holding",
    country: "ES",
    currency: "EUR",
    n_companies_in_group: 4,
  },
  {
    company_id: "COMP_0915",
    group_id: "GROUP_0140",
    name: "Mediterránea Services",
    country: "ES",
    currency: "EUR",
    n_companies_in_group: 2,
  },
  {
    company_id: "COMP_1008",
    group_id: "GROUP_0160",
    name: "Capital Fintech Ops",
    country: "ES",
    currency: "EUR",
    n_companies_in_group: 1,
  },
  {
    company_id: "COMP_1068",
    group_id: "GROUP_0175",
    name: "Sabadell Comercio",
    country: "ES",
    currency: "EUR",
    n_companies_in_group: 3,
  },
];

/** Extra companies available for "import" picker. */
export const IMPORTABLE_COMPANIES: CompanyRef[] = [
  {
    company_id: "COMP_0218",
    group_id: "GROUP_0113",
    name: "Grupo 113 — Filial A",
    country: null,
    currency: "EUR",
    n_companies_in_group: 2,
  },
  {
    company_id: "COMP_0600",
    group_id: "GROUP_0113",
    name: "Grupo 113 — Filial B",
    country: "ES",
    currency: "EUR",
    n_companies_in_group: 2,
  },
  {
    company_id: "COMP_1198",
    group_id: "GROUP_0200",
    name: "Santander Empresas Demo",
    country: "ES",
    currency: "EUR",
    n_companies_in_group: 1,
  },
  {
    company_id: "COMP_0194",
    group_id: "GROUP_0033",
    name: "Pymes Servicios Unidos",
    country: "ES",
    currency: "EUR",
    n_companies_in_group: 2,
  },
];
