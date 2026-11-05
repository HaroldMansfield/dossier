import { describe, expect, it } from "vitest";

import { checkAts, mentions } from "./ats-check";
import type { ResumeContent } from "./resume-content";
import { BUILT_IN_THEMES } from "./themes";

const theme = (id: string) => BUILT_IN_THEMES.find((entry) => entry.id === id)!;

const content: ResumeContent = {
  name: "Jane Doe",
  headline: "Identity Engineer",
  photo: null,
  contacts: ["jane@example.com", "+1 555 010 0000", "Troy, United States", "linkedin.com/in/janedoe"],
  summary: "Identity Engineer with 10 years of Okta and Active Directory experience.",
  experience: [
    {
      id: "a",
      role: "Identity Engineer",
      company: "Northwind",
      descriptor: "",
      dates: "Sep 2022 – Present",
      bullets: ["Cut onboarding time by 40% using Okta workflows.", "Managed 500 users across Active Directory.", "Wrote runbooks for the support team."],
      skills: ["Okta", "Active Directory"],
    },
  ],
  projects: [],
  education: [{ id: "e", degree: "CompTIA Security+", school: "CompTIA", dates: "2021", notes: "" }],
  publications: [],
  skills: "Identity: Okta, Active Directory",
  languages: "",
  references: [],
};

const report = (overrides: Partial<Parameters<typeof checkAts>[0]> = {}) =>
  checkAts({ content, theme: theme("ats"), pages: 1, keywords: ["Okta", "Active Directory", "CyberArk"], ...overrides });

describe("checkAts", () => {
  it("scores the ATS theme on a clean resume well", () => {
    const result = report({ keywords: ["Okta", "Active Directory"] });
    expect(result.categories.map((entry) => entry.id)).toEqual(["integrity", "layout", "contact", "headings", "keywords", "metrics"]);
    expect(result.max).toBe(100);
    expect(result.percent).toBeGreaterThanOrEqual(90);
  });

  it("marks a sidebar theme down on layout and fonts", () => {
    const result = report({ theme: theme("studio") });
    const layout = result.categories.find((entry) => entry.id === "layout")!;
    expect(layout.items[0].status).toBe("fail");
    expect(result.categories[0].items[1].status).toBe("fail");
    expect(result.score).toBeLessThan(report().score);
  });

  it("honours a layout that overrides the theme's own", () => {
    const result = report({ theme: theme("modern"), layout: "SINGLE" });
    expect(result.categories.find((entry) => entry.id === "layout")!.items[0].status).toBe("pass");
  });

  it("flags a photo, a missing phone and a credential in the name", () => {
    const result = report({ content: { ...content, photo: "data:image/png;base64,AAAA", contacts: ["jane@example.com"], name: "Jane Doe, MBA" } });
    const byId = Object.fromEntries(result.categories.map((entry) => [entry.id, entry]));
    expect(byId.layout.items[3].status).not.toBe("pass");
    expect(byId.contact.items.map((item) => item.status)).toEqual(["fail", "pass", "fail", "warn", "warn"]);
  });

  it("leaves keywords out of the total without a posting", () => {
    const result = checkAts({ content, theme: theme("ats"), pages: 1 });
    const keywords = result.categories.find((entry) => entry.id === "keywords")!;
    expect(keywords.max).toBe(0);
    expect(result.max).toBe(75);
  });

  it("lists posting terms that are missing", () => {
    const result = report();
    const keywords = result.categories.find((entry) => entry.id === "keywords")!;
    expect(keywords.items[0].label).toBe("2 of 3 posting terms appear");
    expect(keywords.items[0].detail).toContain("CyberArk");
  });

  it("wants most bullets to carry a number", () => {
    const result = report();
    const metrics = result.categories.find((entry) => entry.id === "metrics")!;
    expect(metrics.items[0].label).toBe("2 of 3 bullets have a number");
    expect(metrics.score).toBe(15);
    const bare = report({ content: { ...content, experience: [{ ...content.experience[0], bullets: ["Did things.", "Helped people."] }] } });
    expect(bare.categories.find((entry) => entry.id === "metrics")!.score).toBe(0);
  });

  it("flags roles without a month, and a current role that isn't first", () => {
    const role = content.experience[0];
    const result = report({
      content: { ...content, experience: [{ ...role, id: "old", dates: "2019 – 2021" }, { ...role, id: "now", dates: "Jan 2022 – Present" }] },
    });
    const headings = result.categories.find((entry) => entry.id === "headings")!;
    expect(headings.items[1].status).toBe("fail");
    expect(headings.items[2].status).toBe("warn");
  });

  it("gives advice on length and repeated skill lists", () => {
    const long = ["a", "b", "c", "d", "e", "f", "g"];
    const result = report({
      pages: 4,
      content: { ...content, experience: [{ ...content.experience[0], skills: long }, { ...content.experience[0], id: "b", skills: long }] },
    });
    expect(result.advice.join(" ")).toMatch(/4 pages/);
    expect(result.advice.join(" ")).toMatch(/2 roles list more than six skills/);
  });
});

describe("mentions", () => {
  it("matches whole words, ignoring case", () => {
    expect(mentions("I wrote Python code", "python")).toBe(true);
    expect(mentions("JavaScript", "Java")).toBe(false);
    expect(mentions("Okta, CyberArk", "CyberArk")).toBe(true);
    expect(mentions("C++ and C#", "C++")).toBe(true);
    expect(mentions("anything", "")).toBe(false);
  });
});
