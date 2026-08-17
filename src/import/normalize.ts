// Stage A — normalize a bank-export merchant description.

/**
 * Payment-processor and channel prefixes that carry no merchant identity.
 * Kept as an editable config array (not inlined per-merchant) so entries can be
 * added without touching the algorithm.
 */
export const PROCESSOR_PREFIXES: string[] = [
  "SQ *",
  "SQ*",
  "TST*",
  "TST *",
  "PAYPAL *",
  "PAYPAL*",
  "PP*",
  "PP *",
  "WEB PMT",
  "POS DEBIT",
  "DEBIT CRD PUR",
  "RECURRING PMT",
  "AUTOPAY",
  "ACH DEBIT",
  "CHECKCARD",
];

const TRAILING_PHONE = /\s*\+?\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\s*$/;
const TRAILING_REF = /\s*#?\d{4,}\s*$/;
const TRAILING_URL = /\s+(?:WWW\.\S+|\S+\.COM|\S+\.CO|\S+\.NET)\s*$/;

/**
 * Normalize a raw description to a comparable merchant key.
 *
 * Note on ordering: the phone-number strip runs BEFORE the reference-number
 * strip. The build spec listed them the other way round, but a trailing phone
 * number ends in 4 digits, so the reference pattern would bite off only its
 * last block and leave "MERCHANT 555-123-" behind.
 */
export function normalizeDescription(raw: string): string {
  let s = raw.toUpperCase().replace(/\s+/g, " ").trim();

  // Strip processor/channel prefixes (repeatedly — files sometimes stack them).
  let strippedPrefix = true;
  while (strippedPrefix) {
    strippedPrefix = false;
    for (const prefix of PROCESSOR_PREFIXES) {
      if (s.startsWith(prefix)) {
        s = s.slice(prefix.length).trim();
        strippedPrefix = true;
      }
    }
  }

  s = s.replace(TRAILING_PHONE, "");
  s = s.replace(TRAILING_REF, "");
  s = s.replace(TRAILING_URL, "");

  // Drop punctuation that varies between exports, keep alphanumerics + spaces.
  s = s.replace(/[*#]+/g, " ").replace(/[^A-Z0-9 &.'-]/g, " ");

  return s.replace(/\s+/g, " ").trim();
}

/** Stage F — a human-readable default name, e.g. `NETFLIX.COM` -> `Netflix.com`. */
export function titleCaseMerchant(normalized: string): string {
  const words = normalized.toLowerCase().split(" ").filter(Boolean);
  return words
    .map((w) => {
      // Keep short all-caps-looking tokens uppercase (e.g. "NYC", "LLC" -> "LLC").
      if (w.length <= 3 && /^[a-z]+$/.test(w) && ACRONYMS.has(w)) {
        return w.toUpperCase();
      }
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

const ACRONYMS = new Set(["llc", "inc", "usa", "nyc", "uk", "hbo", "aws", "att"]);
