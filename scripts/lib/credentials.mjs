// Shared credential loading for the audit / verification scripts.
//
// Credentials never live in the repository. They come from the environment and
// the script exits with actionable instructions when something is missing.

const REQUIRED = {
  E2E_EMAIL: "the account used to sign in during audits (e.g. an owner account)",
  E2E_PASSWORD: "that account's password",
};

const OPTIONAL = {
  E2E_BASE_URL: "frontend base URL (default: http://127.0.0.1:3000)",
  E2E_API_URL: "backend API base URL for direct probes (default: http://127.0.0.1:8000)",
};

const DEFAULTS = {
  baseUrl: process.env.E2E_BASE_URL || "http://127.0.0.1:3000",
  apiUrl: process.env.E2E_API_URL || "http://127.0.0.1:8000",
};

function missing(names) {
  return names.filter((name) => !process.env[name] || process.env[name].trim() === "");
}

function format(name, why) {
  return `  ${name.padEnd(14)} ${why}`;
}

export function requireCredentials() {
  const missingRequired = missing(Object.keys(REQUIRED));

  if (missingRequired.length > 0) {
    const lines = [
      "",
      "Missing required test credentials.",
      "",
      "Set them in the environment; they are never read from the repository:",
      "",
      ...missingRequired.map((name) => format(name, REQUIRED[name])),
      "",
      "Optional overrides:",
      ...Object.entries(OPTIONAL).map(([name, why]) => format(name, why)),
      "",
      "Example (PowerShell):",
      '  $env:E2E_EMAIL="owner@example.com"; $env:E2E_PASSWORD="..."; node scripts/ui-audit.mjs',
      "",
      "Example (bash):",
      '  E2E_EMAIL=owner@example.com E2E_PASSWORD="..." node scripts/ui-audit.mjs',
      "",
    ];
    throw new Error(lines.join("\n"));
  }

  return {
    email: process.env.E2E_EMAIL,
    password: process.env.E2E_PASSWORD,
    baseUrl: DEFAULTS.baseUrl,
    apiUrl: DEFAULTS.apiUrl,
  };
}

// Top-level scripts call this instead of requireCredentials(): it prints the
// instructions and exits with a non-zero code rather than an unhandled throw.
export function credentialsOrExit() {
  try {
    return requireCredentials();
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}

// Run a script body only after credentials validate, so a missing variable
// produces instructions rather than an obscure login failure.
export async function withCredentials(main) {
  let credentials;
  try {
    credentials = requireCredentials();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
    return;
  }
  await main(credentials);
}