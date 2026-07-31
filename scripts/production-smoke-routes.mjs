import assert from "node:assert/strict";

const baseUrl = (process.env.SMOKE_BASE_URL || "http://localhost:3002").replace(/\/$/, "");

const publicChecks = [
  ["/", "Engineering the systems"],
  ["/products", "Products"],
  ["/products?category=networking", "Networking"],
  ["/about", "About"],
  ["/contact", "Contact"],
  ["/solutions", "Solutions"],
  ["/request-quote/general", "quote"],
  ["/login", "Login"],
  ["/register", "Create"],
  ["/privacy", "Privacy"],
  ["/terms", "Terms"],
  ["/robots.txt", "Sitemap"],
  ["/sitemap.xml", "<urlset"],
  ["/manifest.webmanifest", "SEN"],
];

for (const [path, expectedText] of publicChecks) {
  const response = await fetch(`${baseUrl}${path}`, {
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  assert.equal(response.status, 200, `${path} returned ${response.status}`);
  const body = await response.text();
  assert.ok(
    body.toLowerCase().includes(expectedText.toLowerCase()),
    `${path} is missing expected content: ${expectedText}`,
  );
}

for (const path of ["/favicon.ico", "/icon.png", "/apple-icon.png"]) {
  const response = await fetch(`${baseUrl}${path}`, {
    signal: AbortSignal.timeout(20_000),
  });
  assert.equal(response.status, 200, `${path} returned ${response.status}`);
  assert.match(response.headers.get("content-type") ?? "", /^image\//);
}

const productSearch = await fetch(
  `${baseUrl}/api/products/search?q=740&limit=6`,
  { signal: AbortSignal.timeout(20_000) },
);
assert.equal(productSearch.status, 200, "Product search API is unavailable.");
const productPayload = await productSearch.json();
const productResults = Array.isArray(productPayload)
  ? productPayload
  : productPayload.products ?? productPayload.results ?? [];
assert.ok(productResults.length >= 1, "Product search returned no 740 matches.");
assert.ok(
  productResults.some((product) => String(product.name ?? product.title ?? "").includes("740")),
  "Product search did not return a title containing 740.",
);

for (const path of ["/admin", "/profile", "/account"]) {
  const response = await fetch(`${baseUrl}${path}`, {
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
  });
  assert.ok(
    [200, 302, 303, 307, 308].includes(response.status),
    `${path} returned unexpected authentication status ${response.status}`,
  );
  if (response.status !== 200) {
    assert.match(response.headers.get("location") ?? "", /\/login/);
  }
}

console.log(
  `Production route smoke passed at ${baseUrl}: ${publicChecks.length} pages, 3 image assets, product search, and authentication boundaries.`,
);
