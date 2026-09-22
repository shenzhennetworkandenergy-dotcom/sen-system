import {
  businessCardFieldKeys,
  type BusinessCardFieldKey,
  type OcrLine,
  type ReviewedBusinessCard,
  type ReviewedBusinessCardField,
} from "./types.ts";

type Candidate = {
  value: string;
  confidence: number;
  sourceText: string;
  lineIndex: number;
};

const emailPattern = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/giu;
const websitePattern = /(?:https?:\/\/|www\.)[^\s,;]+/giu;
const phonePattern = /\+?\d[\d\s().-]{5,}\d/g;

const mobileLabel = /(mobile|cell|whats\s*app|মোবাইল|মুঠোফোন|手机|手機|移动电话)/iu;
const phoneLabel = /(phone|tel(?:ephone)?|ফোন|টেলিফোন|电话|電話|座机)/iu;
const designationPattern = new RegExp(
  [
    "manager",
    "director",
    "engineer",
    "officer",
    "executive",
    "sales",
    "marketing",
    "consultant",
    "president",
    "founder",
    "chairman",
    "proprietor",
    "ceo",
    "ব্যবস্থাপক",
    "পরিচালক",
    "প্রকৌশলী",
    "কর্মকর্তা",
    "বিক্রয়",
    "经理",
    "总监",
    "工程师",
    "主管",
    "主任",
    "销售",
    "董事长",
    "总经理",
  ].join("|"),
  "iu",
);
const companyPattern = new RegExp(
  [
    "\\bltd\\.?\\b",
    "\\blimited\\b",
    "\\binc\\.?\\b",
    "\\bllc\\b",
    "\\bcorporation\\b",
    "\\bcorp\\.?\\b",
    "\\bcompany\\b",
    "\\bengineering\\b",
    "\\btechnolog(?:y|ies)\\b",
    "\\bsolutions?\\b",
    "\\bgroup\\b",
    "লিমিটেড",
    "কোম্পানি",
    "ইঞ্জিনিয়ারিং",
    "প্রযুক্তি",
    "গ্রুপ",
    "有限公司",
    "公司",
    "集团",
    "科技",
    "企业",
    "实业",
  ].join("|"),
  "iu",
);
const addressPattern = /(?:\b(?:address|road|street|avenue|lane|floor|suite|building)\b|\b(?:rd|st|ave)\.?(?=\s|,|$)|c\/a|ঠিকানা|রোড|সড়ক|মতিঝিল|省|市|区|县|路|街|园|号)/iu;

const cityPatterns = [
  { pattern: /\bDhaka\b/iu, value: "Dhaka" },
  { pattern: /ঢাকা/u, value: "ঢাকা" },
  { pattern: /深圳(?:市)?/u, value: "深圳" },
  { pattern: /\bShenzhen\b/iu, value: "Shenzhen" },
  { pattern: /广州(?:市)?/u, value: "广州" },
  { pattern: /\bGuangzhou\b/iu, value: "Guangzhou" },
  { pattern: /上海(?:市)?/u, value: "上海" },
  { pattern: /\bShanghai\b/iu, value: "Shanghai" },
  { pattern: /北京(?:市)?/u, value: "北京" },
  { pattern: /\bBeijing\b/iu, value: "Beijing" },
] as const;

const countryPatterns = [
  { pattern: /\bBangladesh\b/iu, value: "Bangladesh" },
  { pattern: /বাংলাদেশ/u, value: "বাংলাদেশ" },
  { pattern: /中国/u, value: "中国" },
  { pattern: /\bChina\b/iu, value: "China" },
] as const;

function emptyField(): ReviewedBusinessCardField {
  return { value: "", confidence: null, status: "low", sourceText: "" };
}

export function emptyReviewedBusinessCard(): ReviewedBusinessCard {
  return Object.fromEntries(
    businessCardFieldKeys.map((key) => [key, emptyField()]),
  ) as ReviewedBusinessCard;
}

function normalizeLines(lines: OcrLine[]) {
  return lines
    .map((line, lineIndex) => ({
      text: String(line.text ?? "").normalize("NFKC").trim(),
      confidence: Math.max(0, Math.min(100, Number(line.confidence) || 0)),
      lineIndex,
    }))
    .filter((line) => line.text);
}

function cleanTerminalPunctuation(value: string) {
  return value.replace(/[\s,;:|]+$/u, "").trim();
}

function normalizePhoneDigits(value: string) {
  return value.replace(/[০-৯]/gu, (digit) =>
    String(digit.codePointAt(0)! - "০".codePointAt(0)!),
  );
}

function uniqueCandidates(candidates: Candidate[]) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = candidate.value.normalize("NFKC").toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function reviewedField(
  candidates: Candidate[],
  preferred?: Candidate,
): ReviewedBusinessCardField {
  const unique = uniqueCandidates(candidates);
  const selected = preferred ?? unique[0];
  if (!selected) return emptyField();
  return {
    value: selected.value,
    confidence: selected.confidence,
    status:
      unique.length > 1
        ? "ambiguous"
        : selected.confidence < 75
          ? "low"
          : "ok",
    sourceText: selected.sourceText,
  };
}

function labelledValue(text: string) {
  const parts = text.split(/[：:]/u);
  return parts.length > 1 ? parts.slice(1).join(":").trim() : text.trim();
}

function findNamedCandidate(
  lines: ReturnType<typeof normalizeLines>,
  patterns: ReadonlyArray<{ pattern: RegExp; value: string }>,
) {
  for (const line of lines) {
    for (const item of patterns) {
      if (item.pattern.test(line.text)) {
        return {
          value: item.value,
          confidence: line.confidence,
          sourceText: line.text,
          lineIndex: line.lineIndex,
        } satisfies Candidate;
      }
    }
  }
  return undefined;
}

export function parseBusinessCardOcr(lines: OcrLine[]): ReviewedBusinessCard {
  const normalizedLines = normalizeLines(lines);
  const classifiedLines = new Set<number>();
  const emails: Candidate[] = [];
  const websites: Candidate[] = [];
  const phones: Array<Candidate & { kind: "mobile" | "phone" | "unknown" }> = [];

  for (const line of normalizedLines) {
    const lineEmails = Array.from(line.text.matchAll(emailPattern), (match) => ({
      value: cleanTerminalPunctuation(match[0]),
      confidence: line.confidence,
      sourceText: line.text,
      lineIndex: line.lineIndex,
    }));
    if (lineEmails.length) {
      emails.push(...lineEmails);
      classifiedLines.add(line.lineIndex);
    }

    const textWithoutEmail = line.text.replace(emailPattern, " ");
    const lineWebsites = Array.from(
      textWithoutEmail.matchAll(websitePattern),
      (match) => ({
        value: cleanTerminalPunctuation(match[0]),
        confidence: line.confidence,
        sourceText: line.text,
        lineIndex: line.lineIndex,
      }),
    );
    if (lineWebsites.length) {
      websites.push(...lineWebsites);
      classifiedLines.add(line.lineIndex);
    }

    const phoneText = normalizePhoneDigits(line.text);
    const linePhones = Array.from(phoneText.matchAll(phonePattern), (match) => ({
      value: cleanTerminalPunctuation(match[0]),
      confidence: line.confidence,
      sourceText: line.text,
      lineIndex: line.lineIndex,
      kind: mobileLabel.test(line.text)
        ? ("mobile" as const)
        : phoneLabel.test(line.text)
          ? ("phone" as const)
          : ("unknown" as const),
    })).filter((candidate) => candidate.value.replace(/\D/g, "").length >= 7);
    if (linePhones.length) {
      phones.push(...linePhones);
      classifiedLines.add(line.lineIndex);
    }
  }

  const designationCandidates = normalizedLines
    .filter(
      (line) =>
        designationPattern.test(line.text) && !companyPattern.test(line.text),
    )
    .map((line) => ({
      value: labelledValue(line.text),
      confidence: line.confidence,
      sourceText: line.text,
      lineIndex: line.lineIndex,
    }));
  for (const candidate of designationCandidates) {
    classifiedLines.add(candidate.lineIndex);
  }

  const companyCandidates = normalizedLines
    .filter(
      (line) =>
        companyPattern.test(line.text) ||
        (line.lineIndex <= 1 &&
          /[A-Z]/u.test(line.text) &&
          line.text === line.text.toLocaleUpperCase() &&
          line.text.trim().split(/\s+/u).length >= 2),
    )
    .map((line) => ({
      value: labelledValue(line.text),
      confidence: line.confidence,
      sourceText: line.text,
      lineIndex: line.lineIndex,
    }));
  for (const candidate of companyCandidates) {
    classifiedLines.add(candidate.lineIndex);
  }

  const cityCandidate = findNamedCandidate(normalizedLines, cityPatterns);
  const countryCandidate = findNamedCandidate(normalizedLines, countryPatterns);
  const addressCandidates = normalizedLines
    .filter(
      (line) =>
        !emails.some((candidate) => candidate.lineIndex === line.lineIndex) &&
        !websites.some((candidate) => candidate.lineIndex === line.lineIndex) &&
        !phones.some((candidate) => candidate.lineIndex === line.lineIndex) &&
        (addressPattern.test(line.text) ||
          Boolean(cityCandidate?.lineIndex === line.lineIndex) ||
          Boolean(countryCandidate?.lineIndex === line.lineIndex)),
    )
    .map((line) => ({
      value: line.text,
      confidence: line.confidence,
      sourceText: line.text,
      lineIndex: line.lineIndex,
    }));
  for (const candidate of addressCandidates) {
    classifiedLines.add(candidate.lineIndex);
  }

  const nameCandidates = normalizedLines
    .filter((line) => !classifiedLines.has(line.lineIndex))
    .filter((line) => !/[\d@]/u.test(line.text))
    .filter((line) => line.text.length >= 2 && line.text.length <= 80)
    .map((line) => ({
      value: labelledValue(line.text),
      confidence: line.confidence,
      sourceText: line.text,
      lineIndex: line.lineIndex,
    }));

  const uniquePhones = uniqueCandidates(phones);
  const primaryPhone =
    uniquePhones.find(
      (candidate) =>
        phones.find((phone) => phone.value === candidate.value)?.kind === "mobile",
    ) ?? uniquePhones[0];
  const alternatePhone = uniquePhones.find(
    (candidate) => candidate.value !== primaryPhone?.value,
  );

  const result = emptyReviewedBusinessCard();
  const assignments: Partial<Record<BusinessCardFieldKey, ReviewedBusinessCardField>> = {
    companyName: reviewedField(companyCandidates),
    contactName: reviewedField(nameCandidates),
    designation: reviewedField(designationCandidates),
    mobileNumber: reviewedField(uniquePhones, primaryPhone),
    alternatePhone: reviewedField(
      alternatePhone ? [alternatePhone] : [],
      alternatePhone,
    ),
    emailAddress: reviewedField(emails),
    website: reviewedField(websites),
    fullAddress: reviewedField(
      addressCandidates,
      addressCandidates.find((candidate) => addressPattern.test(candidate.value)),
    ),
    city: reviewedField(cityCandidate ? [cityCandidate] : []),
    country: reviewedField(countryCandidate ? [countryCandidate] : []),
  };

  for (const key of businessCardFieldKeys) {
    result[key] = assignments[key] ?? emptyField();
  }
  return result;
}
