import { test, expect } from "@playwright/test";

/**
 * Workspace UX guarantees.
 *
 * These tests protect the product experience rather than individual features:
 * navigation is grouped and complete, the guided workflow is understandable,
 * the tool library explains itself, and no workspace page overflows sideways or
 * throws console errors at common screen sizes.
 */

const WORKSPACE_ROUTES = [
  "/dashboard",
  "/dashboard/data-sources",
  "/dashboard/refinery",
  "/dashboard/tools",
  "/dashboard/analytics",
  "/dashboard/visualization",
  "/dashboard/intelligence",
  "/dashboard/commerce",
  "/dashboard/products",
  "/dashboard/suppliers",
  "/dashboard/integrations",
  "/dashboard/channels",
  "/dashboard/workflows",
  "/dashboard/services",
  "/dashboard/reports",
  "/dashboard/billing",
  "/dashboard/settings",
];

const NAV_SECTIONS = ["Workspace", "Data operations", "Product management", "Intelligence", "Account"];

/**
 * The workspace is a client-rendered shell that reads its session from
 * localStorage. Tests that are not about signing in reuse a real session
 * created once per worker, so they exercise the actual authenticated product.
 */
const credentials = {
  email: process.env.E2E_EMAIL || "rivu-smoke-1107@example.com",
  password: process.env.E2E_PASSWORD || "SmokeTest123",
};

test.beforeEach(async ({ page, baseURL }) => {
  const api = process.env.E2E_API_URL || "http://127.0.0.1:8000/api/v1";

  // Reuse an existing session when the caller already provided one.
  const existing = await page
    .goto(baseURL + "/dashboard")
    .then(() => page.evaluate(() => localStorage.getItem("rivu_access_token")))
    .catch(() => null);
  if (existing) return;

  const response = await page.request.post(api + "/auth/login", {
    data: credentials,
    failOnStatusCode: false,
  });

  if (response.status() === 401) {
    test.skip(true, `No workspace account available (${credentials.email}). Set E2E_EMAIL/E2E_PASSWORD.`);
    return;
  }
  expect(response.ok(), "workspace sign-in should succeed for UX tests").toBe(true);

  const body = await response.json();
  await page.addInitScript(
    ([access, refresh, user, org]) => {
      localStorage.setItem("rivu_access_token", access);
      localStorage.setItem("rivu_refresh_token", refresh);
      localStorage.setItem("rivu_user", user);
      localStorage.setItem("rivu_org", org);
    },
    [
      body.tokens.access_token,
      body.tokens.refresh_token,
      JSON.stringify(body.user),
      JSON.stringify(body.organization),
    ] as const
  );
});

test.describe("workspace shell", () => {
  test("navigation is grouped by area of work", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator("nav[aria-label='Main']")).toBeVisible();

    const nav = page.locator("nav[aria-label='Main']");
    for (const section of NAV_SECTIONS) {
      await expect(nav.getByText(section, { exact: true })).toBeVisible();
    }
  });

  test("every workspace route is reachable from navigation", async ({ page }) => {
    await page.goto("/dashboard");
    const nav = page.locator("nav[aria-label='Main']");
    const hrefs = await nav.locator("a").evaluateAll((links) => links.map((link) => link.getAttribute("href")));

    // Nav entries may be nested under nested routes (for example /dashboard/tools
    // covers /dashboard/tools/compare), so compare by prefix rather than equality.
    for (const route of WORKSPACE_ROUTES) {
      const covered = hrefs.some((href) => href === route || route.startsWith((href as string) + "/"));
      expect(covered, `${route} should be reachable from the sidebar (found ${hrefs.join(", ")})`).toBe(true);
    }
  });

  test("navigation labels avoid unexplained technical jargon", async ({ page }) => {
    await page.goto("/dashboard");
    const labels = await page
      .locator("nav[aria-label='Main'] a span")
      .allTextContents();

    for (const banned of ["Ingestion", "Profiling", "Immutable", "Schema Intelligence", "Job Pipeline", "Channel Sync"]) {
      expect(labels.some((label) => label.includes(banned)), `unexpected jargon in navigation: ${banned}`).toBe(false);
    }
  });

  test("the sidebar collapses behind a menu button on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard");

    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.locator("nav[aria-label='Main']")).toBeVisible();
    await page.getByRole("link", { name: "Upload data" }).click();
    await expect(page).toHaveURL(/\/dashboard\/data-sources$/);
  });
});

test.describe("layout integrity at common screen sizes", () => {
  for (const viewport of [
    { name: "wide", width: 1920, height: 1080 },
    { name: "laptop", width: 1366, height: 768 },
    { name: "tablet", width: 834, height: 1112 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test(`workspace pages do not overflow sideways @ ${viewport.name}`, async ({ page }) => {
      for (const route of WORKSPACE_ROUTES) {
        await page.goto(route);
        await expect(page.locator("main")).toBeVisible();

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        );
        expect(overflow, `${route} overflows horizontally at ${viewport.name}`).toBeLessThanOrEqual(0);
      }
    });

    test(`workspace pages render without console errors @ ${viewport.name}`, async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error" && !message.text().includes("GSI_LOGGER")) errors.push(message.text());
      });
      page.on("pageerror", (error) => errors.push(error.message));

      for (const route of WORKSPACE_ROUTES) {
        await page.goto(route);
        await page.waitForTimeout(1200);
      }

      expect(errors, `console errors on ${viewport.name}`).toEqual([]);
    });
  }
});

test.describe("overview", () => {
  test("leads with upload and recent work", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Upload your data" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Continue where you left off" })).toBeVisible();
  });

  test("explains that the original file is never changed", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText(/never changed/i).first()).toBeVisible();
  });
});

test.describe("upload page", () => {
  test("states the accepted formats and the size limit", async ({ page }) => {
    await page.goto("/dashboard/data-sources");
    await expect(page.getByRole("heading", { name: "Upload data" })).toBeVisible();
    await expect(page.getByText(/CSV, Excel, JSON or Parquet/i).first()).toBeVisible();
    await expect(page.getByText(/up to 500 MB per file/i)).toBeVisible();
  });

  test("accepts a file input for real uploads", async ({ page }) => {
    await page.goto("/dashboard/data-sources");
    await expect(page.locator("input[type='file']")).toBeAttached();
  });
});

test.describe("guided cleaning workflow", () => {
  test("shows the five plain-language steps", async ({ page }) => {
    await page.goto("/dashboard/refinery");
    for (const step of ["Upload", "Understand", "Clean", "Review", "Export"]) {
      await expect(page.getByRole("tab", { name: new RegExp(step) })).toBeVisible();
    }
  });

  test("explains each step in business language", async ({ page }) => {
    await page.goto("/dashboard/refinery");
    await expect(page.getByText(/Follow the five steps/i)).toBeVisible();
  });
});

test.describe("tool library", () => {
  test("groups tools into categories with plain-language explanations", async ({ page }) => {
    await page.goto("/dashboard/tools");
    await expect(page.getByRole("heading", { name: "What would you like to fix?" })).toBeVisible();

    for (const category of ["Cleaning", "Duplicate detection", "Validation", "Formatting"]) {
      await expect(page.getByRole("button", { name: category, exact: true })).toBeVisible();
    }
  });

  test("search filters the tool list", async ({ page }) => {
    await page.goto("/dashboard/tools");
    const search = page.getByRole("textbox", { name: "Search tools" });
    await search.fill("duplicate");

    await expect(page.getByRole("heading", { name: "Find duplicate records" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Export and convert" })).toHaveCount(0);
  });

  test("a category chip narrows the list and shows an empty state for nonsense", async ({ page }) => {
    await page.goto("/dashboard/tools");

    await page.getByRole("button", { name: "Formatting", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Export and convert" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Find duplicate records" })).toHaveCount(0);

    await page.getByRole("textbox", { name: "Search tools" }).fill("zzzz-nothing");
    await expect(page.getByText("No tools match that search")).toBeVisible();
    await page.getByRole("button", { name: "Clear search" }).click();
    await expect(page.getByRole("heading", { name: "Find duplicate records" })).toBeVisible();
  });

  test("labels tools honestly instead of implying every tool is a separate page", async ({ page }) => {
    await page.goto("/dashboard/tools");
    await expect(page.getByText("Ready to use").first()).toBeVisible();
  });
});

test.describe("suppliers", () => {
  test("explains what a supplier is and offers a clear add action", async ({ page }) => {
    await page.goto("/dashboard/suppliers");
    await expect(page.getByRole("heading", { name: "Suppliers", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add supplier" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sending them a catalogue" })).toBeVisible();
  });

  test("the add supplier dialog validates required fields", async ({ page }) => {
    await page.goto("/dashboard/suppliers");
    await page.getByRole("button", { name: "Add supplier" }).click();

    const dialog = page.getByRole("dialog", { name: "Add a supplier" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Save supplier" }).click();
    await expect(dialog).toBeVisible();

    await dialog.getByLabel("Company name").fill("Playwright Supplier");
    await dialog.getByLabel("Short code").fill("PW-TEST");
    await expect(dialog.getByRole("button", { name: "Save supplier" })).toBeEnabled();
  });
});

test.describe("services", () => {
  test("separates project requests from questions and explains what happens next", async ({ page }) => {
    await page.goto("/dashboard/services");
    await expect(page.getByRole("heading", { name: "Request a custom solution" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ask a question" })).toBeVisible();
    await expect(page.getByText("What happens next").first()).toBeVisible();
  });
});

test.describe("reports", () => {
  test("offers plain-language downloads per file", async ({ page }) => {
    await page.goto("/dashboard/reports");
    await expect(page.getByRole("heading", { name: "Reports you can download" })).toBeVisible();
    await expect(page.getByText("PDF · Executive PDF · JSON")).toBeVisible();
  });
});

test.describe("processing activity", () => {
  test("describes what runs automatically instead of exposing job internals", async ({ page }) => {
    await page.goto("/dashboard/workflows");
    await expect(page.getByText("What runs automatically")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Processing activity" })).toBeVisible();
  });
});