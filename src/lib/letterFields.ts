export type MissingFieldKey =
  | "name"
  | "address"
  | "account_number"
  | "member_id"
  | "date_of_service"
  | "provider_name";

export interface MissingField {
  key: MissingFieldKey;
  label: string;
  placeholder: string;
  multiline?: boolean;
}

export interface LetterFieldSources {
  name?: string;
  address?: string;
  account_number?: string;
  member_id?: string;
  provider_name?: string | null;
}

const FIELD_DEFS: Record<
  MissingFieldKey,
  { label: string; placeholder: string; multiline?: boolean; placeholderPatterns: string[] }
> = {
  name: {
    label: "Patient name",
    placeholder: "Jane Smith",
    placeholderPatterns: ["patient name", "your name", "name", "full name"],
  },
  address: {
    label: "Patient address",
    placeholder: "123 Main St\nApt 4B\nCity, ST 12345",
    multiline: true,
    placeholderPatterns: [
      "patient address",
      "your address",
      "address",
      "address line 1",
      "street address",
      "mailing address",
    ],
  },
  account_number: {
    label: "Account number",
    placeholder: "From the bill",
    placeholderPatterns: [
      "account number",
      "account #",
      "patient account number",
      "statement number",
    ],
  },
  member_id: {
    label: "Insurance member ID",
    placeholder: "XYZ123456789",
    placeholderPatterns: [
      "member id",
      "member number",
      "id number",
      "insurance id",
      "subscriber id",
    ],
  },
  date_of_service: {
    label: "Date of service",
    placeholder: "March 15, 2024",
    placeholderPatterns: ["date of service", "service date"],
  },
  provider_name: {
    label: "Provider or hospital name",
    placeholder: "Mountain View Medical Center",
    placeholderPatterns: ["provider name", "hospital name", "facility name", "doctor name"],
  },
};

function letterContainsPlaceholder(letter: string, patterns: string[]): boolean {
  const lower = letter.toLowerCase();
  return patterns.some((p) => lower.includes(`[${p}]`));
}

export function getMissingFields(
  letterContent: string,
  sources: LetterFieldSources
): MissingField[] {
  const missing: MissingField[] = [];

  const lower = letterContent.toLowerCase();

  // Patient name, address, account number — always required if the letter
  // references them. The LLM is instructed to emit [PATIENT NAME] etc., so
  // these almost always have a placeholder.
  for (const key of ["name", "address", "account_number"] as const) {
    const def = FIELD_DEFS[key];
    const hasPlaceholder = letterContainsPlaceholder(letterContent, def.placeholderPatterns);
    const value = sources[key]?.trim();
    if (hasPlaceholder && !value) {
      missing.push({ key, label: def.label, placeholder: def.placeholder, multiline: def.multiline });
    }
  }

  // Member ID — only ask if the letter actually references it.
  {
    const def = FIELD_DEFS.member_id;
    const hasPlaceholder = letterContainsPlaceholder(letterContent, def.placeholderPatterns);
    const value = sources.member_id?.trim();
    if (hasPlaceholder && !value) {
      missing.push({ key: "member_id", label: def.label, placeholder: def.placeholder });
    }
  }

  // Date of service — same approach. The API typically inlines this, but if
  // the LLM emitted a placeholder anyway, prompt for it.
  {
    const def = FIELD_DEFS.date_of_service;
    const hasPlaceholder = letterContainsPlaceholder(letterContent, def.placeholderPatterns);
    if (hasPlaceholder) {
      missing.push({ key: "date_of_service", label: def.label, placeholder: def.placeholder });
    }
  }

  // Provider name — placeholder check, plus the API's fallback string.
  {
    const def = FIELD_DEFS.provider_name;
    const hasPlaceholder = letterContainsPlaceholder(letterContent, def.placeholderPatterns);
    const fallbackInLetter = lower.includes("provider on file");
    const sourceMissing = !sources.provider_name?.trim();
    if (hasPlaceholder || (fallbackInLetter && sourceMissing)) {
      missing.push({ key: "provider_name", label: def.label, placeholder: def.placeholder });
    }
  }

  return missing;
}

export function buildSubstitutionMap(
  sources: LetterFieldSources & {
    phone?: string;
    email?: string;
    today: string;
    date_of_service?: string;
  }
): Record<string, string> {
  const name = sources.name?.trim() || "";
  const address = sources.address?.trim() || "";
  const phone = sources.phone?.trim() || "";
  const email = sources.email?.trim() || "";
  const memberId = sources.member_id?.trim() || "";
  const accountNumber = sources.account_number?.trim() || "";
  const providerName = sources.provider_name?.trim() || "";
  const dateOfService = sources.date_of_service?.trim() || "";
  const today = sources.today;

  return {
    "patient name": name,
    "your name": name,
    name: name,
    "full name": name,
    address: address,
    "address line 1": address,
    "street address": address,
    "mailing address": address,
    "patient address": address,
    "your address": address,
    phone: phone,
    "phone number": phone,
    telephone: phone,
    "contact phone": phone,
    email: email,
    "email address": email,
    "e-mail": email,
    "member id": memberId,
    "member number": memberId,
    "id number": memberId,
    "insurance id": memberId,
    "subscriber id": memberId,
    "account number": accountNumber,
    "account #": accountNumber,
    "patient account number": accountNumber,
    "statement number": accountNumber,
    "provider name": providerName,
    "hospital name": providerName,
    "facility name": providerName,
    "doctor name": providerName,
    "date of service": dateOfService,
    "service date": dateOfService,
    date: today,
    today: today,
    "today's date": today,
    "letter date": today,
    "current date": today,
  };
}

export function todayLongDate(): string {
  return new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// Contact/insurance placeholders that aren't on the bill and may be left blank.
// When empty, the whole line is dropped rather than printing "[Phone Number]".
const DROP_LINE_WHEN_EMPTY = new Set([
  "phone",
  "phone number",
  "telephone",
  "contact phone",
  "email",
  "email address",
  "e-mail",
  "member id",
  "member number",
  "id number",
  "insurance id",
  "subscriber id",
]);

// Fills [Bracket] placeholders in a letter from the known case/patient sources.
// Lines whose only content is an unfilled optional placeholder are removed so
// the rendered letter never ships with a stray "[Phone Number]" stub. This is
// the shared substitution used when embedding the dispute letter into the
// Evidentiary Package from the case page.
export function applyLetterSubstitutions(
  content: string,
  sources: LetterFieldSources & {
    phone?: string;
    email?: string;
    date_of_service?: string;
    today?: string;
  }
): string {
  const map = buildSubstitutionMap({
    name: sources.name,
    address: sources.address,
    phone: sources.phone,
    email: sources.email,
    member_id: sources.member_id,
    account_number: sources.account_number,
    provider_name: sources.provider_name ?? null,
    date_of_service: sources.date_of_service,
    today: sources.today ?? todayLongDate(),
  });

  const keptLines = content.split("\n").filter((line) => {
    for (const m of line.matchAll(/\[([^\[\]\n]{2,40})\]/g)) {
      const normalized = m[1].trim().toLowerCase();
      if (DROP_LINE_WHEN_EMPTY.has(normalized) && !map[normalized]) return false;
    }
    return true;
  });

  let result = keptLines.join("\n").replace(/\[([^\[\]\n]{2,40})\]/g, (match, key: string) => {
    const normalized = key.trim().toLowerCase();
    const replacement = map[normalized];
    if (replacement === undefined) return match;
    return replacement || match;
  });

  // The generate-letter API inlines "Provider on file" when the case row has no
  // provider name; swap it for the real name when the caller supplies one.
  const providerOverride = sources.provider_name?.trim();
  if (providerOverride && providerOverride !== "Provider on file") {
    result = result.replace(/Provider on file/g, providerOverride);
  }

  return result;
}

export function evidentiaryPackageFilename(caseShortId: string): string {
  return `evidentiary-package-${caseShortId}.pdf`;
}
