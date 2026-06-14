const crypto = require("crypto");
const https = require("https");

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

let cachedToken = null;

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function normalizePrivateKey(value) {
  return String(value || "").replace(/\\n/g, "\n");
}

function parseServiceAccountJson(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return {
      clientEmail: parsed.client_email,
      privateKey: parsed.private_key,
    };
  } catch {
    return {};
  }
}

function getGoogleSheetsConfig(env = process.env) {
  const jsonConfig = parseServiceAccountJson(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const spreadsheetId = env.GOOGLE_SHEETS_ID || "";
  const clientEmail = env.GOOGLE_SERVICE_ACCOUNT_EMAIL || jsonConfig.clientEmail || "";
  const privateKey = normalizePrivateKey(env.GOOGLE_PRIVATE_KEY || jsonConfig.privateKey || "");

  const missing = [];
  if (!spreadsheetId) missing.push("GOOGLE_SHEETS_ID");
  if (!clientEmail) missing.push("GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!privateKey) missing.push("GOOGLE_PRIVATE_KEY or GOOGLE_SERVICE_ACCOUNT_JSON");

  return {
    spreadsheetId,
    clientEmail,
    privateKey,
    missing,
    configured: missing.length === 0,
  };
}

function createJwtAssertion(config, now = Math.floor(Date.now() / 1000)) {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({
    iss: config.clientEmail,
    scope: SHEETS_SCOPE,
    aud: TOKEN_URL,
    exp: now + 3600,
    iat: now,
  }));
  const unsigned = `${header}.${claims}`;
  const signature = crypto
    .sign("RSA-SHA256", Buffer.from(unsigned), config.privateKey)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${unsigned}.${signature}`;
}

function requestJson(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request({
      method: options.method || "GET",
      hostname: parsed.hostname,
      path: `${parsed.pathname}${parsed.search}`,
      headers: options.headers || {},
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        const data = text ? JSON.parse(text) : {};
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
          return;
        }

        const message = data.error_description || data.error?.message || data.error || `HTTP ${res.statusCode}`;
        reject(new Error(message));
      });
    });

    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function getAccessToken(config = getGoogleSheetsConfig()) {
  if (!config.configured) {
    throw new Error(`Google Sheets is not configured: ${config.missing.join(", ")}`);
  }

  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.accessToken;
  }

  const assertion = createJwtAssertion(config);
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  }).toString();

  const response = await requestJson(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(body),
    },
  }, body);

  cachedToken = {
    accessToken: response.access_token,
    expiresAt: Date.now() + Number(response.expires_in || 3600) * 1000,
  };
  return cachedToken.accessToken;
}

async function sheetsRequest(path, options = {}, body = null, config = getGoogleSheetsConfig()) {
  const token = await getAccessToken(config);
  const jsonBody = body ? JSON.stringify(body) : null;
  return requestJson(`https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(jsonBody ? {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(jsonBody),
      } : {}),
    },
  }, jsonBody);
}

async function clearValues(range, config = getGoogleSheetsConfig()) {
  const encodedRange = encodeURIComponent(range);
  return sheetsRequest(`/values/${encodedRange}:clear`, { method: "POST" }, {}, config);
}

async function updateValues(range, values, config = getGoogleSheetsConfig()) {
  const encodedRange = encodeURIComponent(range);
  return sheetsRequest(`/values/${encodedRange}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
  }, { values }, config);
}

async function getValues(range, config = getGoogleSheetsConfig()) {
  const encodedRange = encodeURIComponent(range);
  return sheetsRequest(`/values/${encodedRange}`, { method: "GET" }, null, config);
}

module.exports = {
  SHEETS_SCOPE,
  base64url,
  clearValues,
  createJwtAssertion,
  getAccessToken,
  getGoogleSheetsConfig,
  getValues,
  normalizePrivateKey,
  updateValues,
};
