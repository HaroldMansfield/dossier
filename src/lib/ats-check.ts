import { DateStyle, HeaderStyle, ThemeFont, ThemeLayout } from "@/generated/prisma/enums";
import type { ResumeContent } from "@/lib/resume-content";
import type { ThemeData } from "@/lib/themes";

// An applicant-tracking check for a resume, after the six-category rubric in
// "Master ATS Resume Scoring Rubric" (100 points): technical integrity 15,
// layout 20, contact details 10, headings and dates 15, keywords 25, metrics 15.
// It looks at what the resume says and how its theme lays it out; it never
// calls a model. The keyword category needs a list of terms from a job
// posting. Without one it isn't scored, and the total is out of the rest.

export type AtsStatus = "pass" | "warn" | "fail";

export type AtsItem = { status: AtsStatus; label: string; detail?: string };

export type AtsCategory = {
  id: "integrity" | "layout" | "contact" | "headings" | "keywords" | "metrics";
  title: string;
  /** Points earned and available; both 0 when the category couldn't be scored. */
  score: number;
  max: number;
  items: AtsItem[];
};

export type AtsReport = {
  categories: AtsCategory[];
  /** Points earned out of the categories that were scored. */
  score: number;
  max: number;
  /** `score` as a percentage of `max`. */
  percent: number;
  /** Things worth knowing that don't change the score. */
  advice: string[];
};

/** Fonts the guides name as safe, and the bundled stand-ins for them. */
export const ATS_SAFE_FONTS: ReadonlySet<ThemeFont> = new Set([
  ThemeFont.ARIMO,
  ThemeFont.CARLITO,
  ThemeFont.GELASIO,
  ThemeFont.CALADEA,
  ThemeFont.GARAMOND,
]);

const STANDARD_HEADINGS = /^(work experience|professional experience|experience|employment( history)?|education|skills|core competencies|professional summary|summary|profile)$/i;
/** "Sep 2024", "September 2024" or "09/2024" at the start of a range. */
const READABLE_START = /^(?:[A-Za-z]{3,9}\.?\s\d{4}|\d{2}\/\d{4})\b/;
const HAS_METRIC = /\d|%|\$/;

const earned = (items: AtsItem[], points: number[]) =>
  items.reduce((sum, item, index) => sum + (item.status === "pass" ? points[index] : item.status === "warn" ? points[index] / 2 : 0), 0);

function category(id: AtsCategory["id"], title: string, items: AtsItem[], points: number[]): AtsCategory {
  return { id, title, items, score: Math.round(earned(items, points) * 10) / 10, max: points.reduce((a, b) => a + b, 0) };
}

const pass = (condition: boolean, label: string, detail?: string, warn = false): AtsItem => ({
  status: condition ? "pass" : warn ? "warn" : "fail",
  label,
  detail: condition ? undefined : detail,
});

/** Whole-word, case-insensitive: "Python" is in "I wrote Python code", "Java" is not in "JavaScript". */
export function mentions(text: string, term: string): boolean {
  const escaped = term.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!escaped) return false;
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu").test(text);
}

export type AtsInput = {
  content: ResumeContent;
  theme: ThemeData;
  /** The layout the document is drawn in, when it isn't the theme's own. */
  layout?: ThemeLayout;
  /** Pages the PDF will have. */
  pages: number;
  /** The most pages the user wants, or null. */
  maxPages?: number | null;
  /** The posting's required terms, e.g. "Okta", "identity and access management". */
  keywords?: string[];
};

export function checkAts({ content, theme, layout = theme.layout, pages, maxPages = null, keywords }: AtsInput): AtsReport {
  const advice: string[] = [];

  // 1. Technical integrity (15): Dossier always prints a text PDF; the font is what can differ.
  const integrity = category(
    "integrity",
    "Technical integrity",
    [
      pass(true, "Text PDF, selectable, no images of text"),
      pass(
        ATS_SAFE_FONTS.has(theme.bodyFont) && ATS_SAFE_FONTS.has(theme.headFont),
        "Web-safe fonts",
        "Use Arial (Arimo), Calibri (Carlito), Georgia (Gelasio), Cambria (Caladea) or Garamond.",
        ATS_SAFE_FONTS.has(theme.bodyFont),
      ),
    ],
    [10, 5],
  );

  // 2. Layout (20)
  const layoutCategory = category(
    "layout",
    "Layout",
    [
      pass(layout === ThemeLayout.SINGLE, "Single column", "Sidebars and side headings can scramble the reading order."),
      pass(theme.headerStyle === HeaderStyle.PLAIN, "Plain header, no banner", "A banner can hide text from a parser.", true),
      pass(theme.dateStyle === DateStyle.INLINE, "Dates on the title line", "Timeline dates sit apart from their roles.", true),
      pass(!content.photo, "No photo", "A photo is an image a parser can't read, and it can take the contact line with it.", true),
    ],
    [10, 3, 3, 4],
  );

  // 3. Contact details (10)
  const digits = (value: string) => value.replace(/\D/g, "").length;
  const hasEmail = content.contacts.some((item) => /\S+@\S+\.\S+/.test(item));
  const hasPhone = content.contacts.some((item) => !/@/.test(item) && digits(item) >= 7 && /^[\d+()\s.\-]+$/.test(item));
  const hasLocation = content.contacts.some((item) => /^[^@/]+,\s*\S+/.test(item) && !/\d{4,}/.test(item) && !/\./.test(item));
  const hasLinkedIn = content.contacts.some((item) => /linkedin\.com/i.test(item));
  const contact = category(
    "contact",
    "Contact details",
    [
      pass(!/[,|(]|\b(?:MBA|PhD|CPA|PMP|MD)\b/.test(content.name) && !/\+/.test(content.name), "Name alone on the first line", "Leave credentials out of the name."),
      pass(hasEmail, "Email", "Add an email address in Basics."),
      pass(hasPhone, "Phone", "Add a phone number in Basics."),
      pass(hasLocation, "City and country", "Add a city in Basics.", true),
      pass(hasLinkedIn, "LinkedIn", "Add your LinkedIn address in Basics.", true),
    ],
    [2, 3, 2, 1, 2],
  );

  // 4. Headings and dates (15)
  const headings = [
    content.summary && "Profile",
    content.experience.length > 0 && "Experience",
    content.education.length > 0 && "Education",
    content.skills && "Skills",
  ].filter(Boolean) as string[];
  const undated = content.experience.filter((role) => !READABLE_START.test(role.dates));
  const currentFirst = content.experience.length < 2 || /present|current/i.test(content.experience[0].dates) || !content.experience.some((role) => /present|current/i.test(role.dates));
  const headingsCategory = category(
    "headings",
    "Headings and dates",
    [
      pass(headings.every((heading) => STANDARD_HEADINGS.test(heading)) && content.experience.length > 0, "Standard section headings", "Use Experience, Education and Skills."),
      pass(
        undated.length === 0 && content.experience.length > 0,
        "Every role has a month and year",
        undated.length ? `Missing from: ${undated.map((role) => role.role || role.company).join(", ")}.` : "Add a role.",
      ),
      pass(currentFirst, "Current role comes first", "Move your current role to the top in Profile → Experience.", true),
      pass(content.education.length > 0, "Education section", "Add your certifications or education: parsers look for the section.", true),
    ],
    [4, 6, 3, 2],
  );

  // 5. Keywords (25): scored only against a posting's terms.
  const body = [content.headline, content.summary, ...content.experience.flatMap((role) => [role.role, role.company, ...role.bullets])].join("\n");
  const everything = [body, content.skills, ...content.experience.flatMap((role) => role.skills)].join("\n");
  const wanted = [...new Set((keywords ?? []).map((term) => term.trim()).filter(Boolean))];
  let keywordCategory: AtsCategory;
  if (wanted.length === 0) {
    keywordCategory = { id: "keywords", title: "Keywords", score: 0, max: 0, items: [{ status: "warn", label: "Not scored", detail: "Needs a job posting: open an application to match its required terms." }] };
  } else {
    const found = wanted.filter((term) => mentions(everything, term));
    const top = `${content.headline}\n${content.summary}\n${content.skills}`;
    const inTop = wanted.filter((term) => mentions(top, term));
    const missing = wanted.filter((term) => !mentions(everything, term));
    const share = found.length / wanted.length;
    keywordCategory = {
      id: "keywords",
      title: "Keywords",
      max: 25,
      score: Math.round((Math.min(1, share / 0.8) * 15 + Math.min(1, inTop.length / Math.min(5, wanted.length)) * 10) * 10) / 10,
      items: [
        pass(share >= 0.8, `${found.length} of ${wanted.length} posting terms appear`, missing.length ? `Missing: ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? "…" : ""}` : undefined, share >= 0.5),
        pass(inTop.length >= Math.min(5, wanted.length), "Main terms are in the summary or skills", "Name the posting's top skills in your summary.", inTop.length > 0),
      ],
    };
    // Terms used only in the skills list, never in a bullet, carry less weight.
    const onlyListed = found.filter((term) => !mentions(body, term));
    if (onlyListed.length) advice.push(`Only in a skills list, never in a bullet: ${onlyListed.slice(0, 6).join(", ")}. Show them in use.`);
  }

  // 6. Metrics (15): at least 60% of experience bullets carry a number, %, or $.
  const bullets = content.experience.flatMap((role) => role.bullets);
  const withMetric = bullets.filter((bullet) => HAS_METRIC.test(bullet)).length;
  const share = bullets.length ? withMetric / bullets.length : 0;
  const metrics: AtsCategory = {
    id: "metrics",
    title: "Metrics",
    max: 15,
    score: Math.round(Math.min(1, share / 0.6) * 15 * 10) / 10,
    items: [
      pass(share >= 0.6, `${withMetric} of ${bullets.length} bullets have a number`, "Aim for 60%: add figures, percentages or amounts where you honestly have them.", share >= 0.3),
    ],
  };

  const categories = [integrity, layoutCategory, contact, headingsCategory, keywordCategory, metrics];
  const score = Math.round(categories.reduce((sum, entry) => sum + entry.score, 0) * 10) / 10;
  const max = categories.reduce((sum, entry) => sum + entry.max, 0);

  // Worth knowing, not scored.
  const limit = maxPages ?? 2;
  if (pages > limit) advice.push(`The resume runs ${pages} pages. Most guides say two at most.`);
  const repeated = content.experience.filter((role) => role.skills.length > 6).length;
  if (repeated > 1) advice.push(`${repeated} roles list more than six skills each. Long repeated lists read as keyword stuffing and add pages.`);
  if (content.headline && content.summary && !mentions(content.summary, content.headline.split(/[|/,]/)[0].trim())) {
    advice.push("Your headline's job title doesn't appear in the summary. Use the same title in both.");
  }

  return { categories, score, max, percent: max ? Math.round((score / max) * 100) : 0, advice };
}
