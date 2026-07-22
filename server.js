require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Simple password protection ─────────────────────────────────────────────
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'momentum2026';

app.post('/api/auth', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: 'Wrong password' });
  }
});

// ── Generate dashboard package ─────────────────────────────────────────────
app.post('/api/generate', (req, res) => {
  const { password, config } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // Read templates
    let indexHtml = fs.readFileSync(path.join(__dirname, 'template-index.html'), 'utf8');
    let serverJs = fs.readFileSync(path.join(__dirname, 'template-server.js'), 'utf8');

    const {
      clientName, clientWebsite, clientInitials, brandColor,
      logoB64, agencyLabel, saEmail,
      ga4PropertyId, gscSiteUrl, wcProfileId,
      sheetId, sheetTab, supabaseUrl, redirectUri,
      useGA4, useGSC, useWC, useSheets, useDocs, useNP, useAdSpend
    } = config;

    const slug = clientName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const colorRgb = hexToRgb(brandColor);
    const colorRgbStr = colorRgb ? `${colorRgb.r},${colorRgb.g},${colorRgb.b}` : '58,143,212';

    // ── Swap index.html values ─────────────────────────────────────────────

    // Title
    indexHtml = indexHtml.replace(
      '<title>Penn Pain Physicians · Analytics by Momentum Digital</title>',
      `<title>${clientName} · Analytics by ${agencyLabel || 'Momentum Digital'}</title>`
    );

    // Brand color - all occurrences of #3a8fd4
    indexHtml = indexHtml.replace(/--green: #3a8fd4;/, `--green: ${brandColor};`);
    indexHtml = indexHtml.replace(/rgba\(58,143,212,0\.12\)/g, `rgba(${colorRgbStr},0.12)`);
    indexHtml = indexHtml.replace(/rgba\(58,143,212,0\.07\)/g, `rgba(${colorRgbStr},0.07)`);
    indexHtml = indexHtml.replace(/rgba\(58,143,212,0\.06\)/g, `rgba(${colorRgbStr},0.06)`);
    indexHtml = indexHtml.replace(/rgba\(58,143,212,0\.2\)/g, `rgba(${colorRgbStr},0.2)`);
    indexHtml = indexHtml.replace(/rgba\(58,143,212,0\.3\)/g, `rgba(${colorRgbStr},0.3)`);
    indexHtml = indexHtml.replace(/#3a8fd4/g, brandColor);

    // Logo
    if (logoB64) {
      // Replace the entire img tag with logo
      indexHtml = indexHtml.replace(
        /<img src="data:image\/webp;base64,[^"]*" alt="Momentum Digital" style="width:100%;max-width:160px;height:auto;display:block;filter:brightness\(0\) invert\(1\)">/,
        `<img src="${logoB64}" alt="${clientName}" style="max-height:36px;max-width:160px;height:auto;display:block;filter:brightness(0) invert(1)">`
      );
    }

    // Client name
    indexHtml = indexHtml.replace(/Penn Pain Physicians/g, clientName);

    // Client website
    indexHtml = indexHtml.replace(/https:\/\/pennpain\.com/g, clientWebsite || '#');
    indexHtml = indexHtml.replace(/pennpain\.com(?!\/search)/g, clientWebsite ? clientWebsite.replace(/https?:\/\//, '') : '');

    // GA4 Property ID
    indexHtml = indexHtml.replace(/GA4 · 486245473/g, useGA4 ? `GA4 · ${ga4PropertyId}` : '');
    indexHtml = indexHtml.replace(/486245473/g, ga4PropertyId || '');

    // GSC
    indexHtml = indexHtml.replace(/GSC · pennpain\.com/g, useGSC ? `GSC · ${gscSiteUrl}` : '');

    // Client initials (PP)
    indexHtml = indexHtml.replace(/\bPP\b/g, clientInitials || clientName.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase());

    // Agency label
    if (agencyLabel && agencyLabel !== 'Momentum Digital') {
      indexHtml = indexHtml.replace(/Managed by Momentum Digital/g, `Managed by ${agencyLabel}`);
      indexHtml = indexHtml.replace(/Momentum Digital/g, agencyLabel);
    }

    // COLORS array in JS
    indexHtml = indexHtml.replace(
      `const COLORS = ['#3a8fd4',`,
      `const COLORS = ['${brandColor}',`
    );

    // Remove sections if features disabled
    if (!useWC) {
      // Remove WhatConverts nav item
      indexHtml = indexHtml.replace(/nb-conversions[\s\S]*?<\/button>\s*\n\s*<div class="nav-section">Client/, '<div class="nav-section">Client');
    }

    if (!useDocs) {
      indexHtml = indexHtml.replace(/id="nav-documents"[\s\S]*?<\/button>\s*\n/, '');
    }

    // ── Swap server.js values ──────────────────────────────────────────────
    serverJs = serverJs.replace(
      `const GA4_PROPERTY = 'properties/486245473';`,
      `const GA4_PROPERTY = 'properties/${ga4PropertyId || ''}';`
    );
    serverJs = serverJs.replace(
      `const GSC_SITE = 'sc-domain:pennpain.com';`,
      `const GSC_SITE = '${gscSiteUrl || ''}';`
    );
    serverJs = serverJs.replace(
      `const WC_PROFILE = '148479';`,
      `const WC_PROFILE = '${wcProfileId || ''}';`
    );
    serverJs = serverJs.replace(
      `const SHEET_ID = '1cXnqHBu9OJXA-TIemxTAm8tkKNDOMbY8hWgWlpbi3P4';`,
      `const SHEET_ID = '${sheetId || ''}';`
    );
    serverJs = serverJs.replace(
      `const SHEET_TAB = 'dashboard_data';`,
      `const SHEET_TAB = '${sheetTab || 'dashboard_data'}';`
    );
    serverJs = serverJs.replace(/pennpain-secret/g, `${slug}-secret`);

    // Remove unused endpoints if features disabled
    if (!useWC) {
      serverJs = serverJs.replace(/\/\/ ── WhatConverts proxy[\s\S]*?(?=\/\/ ── WhatConverts NP|\/\/ ── Google Sheets|\/\/ ── Review Auth|const PORT)/, '');
    }
    if (!useNP) {
      serverJs = serverJs.replace(/\/\/ ── WhatConverts NP Appointments[\s\S]*?(?=\/\/ ── Google Sheets|\/\/ ── Review Auth|const PORT)/, '');
    }
    if (!useSheets) {
      serverJs = serverJs.replace(/\/\/ ── Google Sheets proxy[\s\S]*?(?=\/\/ ── Review Auth|const PORT)/, '');
    }
    if (!useDocs) {
      serverJs = serverJs.replace(/\/\/ ── Review Auth[\s\S]*?(?=const PORT)/, '');
      serverJs = serverJs.replace(/\/\/ ── Documents API[\s\S]*?(?=const PORT)/, '');
    }

    // ── Build package.json ─────────────────────────────────────────────────
    const deps = {
      "express": "^4.18.2",
      "axios": "^1.6.0",
      "google-auth-library": "^9.0.0",
      "dotenv": "^16.3.1"
    };
    if (useSheets) deps["googleapis"] = "^140.0.0";
    if (useDocs) {
      deps["@supabase/supabase-js"] = "^2.38.0";
      deps["cookie-parser"] = "^1.4.6";
      deps["jsonwebtoken"] = "^9.0.2";
    }

    const packageJson = JSON.stringify({
      name: `${slug}-dashboard`,
      version: "1.0.0",
      main: "server.js",
      scripts: { start: "node server.js" },
      dependencies: deps
    }, null, 2);

    // ── Build vercel.json ──────────────────────────────────────────────────
    const vercelJson = JSON.stringify({
      version: 2,
      builds: [{ src: "server.js", use: "@vercel/node" }],
      routes: [{ src: "/(.*)", dest: "server.js" }]
    }, null, 2);

    // ── Build .env.example ─────────────────────────────────────────────────
    let envExample = `# Google Service Account
GOOGLE_SERVICE_ACCOUNT_EMAIL=${saEmail || 'your-service-account@project.iam.gserviceaccount.com'}
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\nYOUR_KEY_HERE\\n-----END PRIVATE KEY-----\\n"
`;
    if (useWC) envExample += `\n# WhatConverts\nWHATCONVERTS_TOKEN=your_token_here\nWHATCONVERTS_SECRET=your_secret_here\n`;
    if (useSheets) envExample += `\n# Google Sheets\n# Sheet is already configured in server.js\n`;
    if (useDocs) {
      envExample += `\n# Supabase (Document Review)\nSUPABASE_URL=${supabaseUrl || 'https://xxxx.supabase.co'}\nSUPABASE_SERVICE_KEY=your_service_role_key\n\n# Google OAuth (Document Review)\nGOOGLE_CLIENT_ID=your_oauth_client_id\nGOOGLE_CLIENT_SECRET=your_oauth_client_secret\nREDIRECT_URI=${redirectUri || 'http://localhost:3000/auth/callback'}\nSESSION_SECRET=${slug}-secret-change-this\n`;
    }

    // ── Build README ───────────────────────────────────────────────────────
    const readme = `# ${clientName} Analytics Dashboard

Generated by Momentum Digital Dashboard Generator
Client: ${clientName} | ${clientWebsite || ''}

## Quick Start (local)

\`\`\`bash
npm install
node server.js
\`\`\`

Open: http://localhost:3000

## Environment Variables

Copy \`.env.example\` to \`.env\` and fill in the values.
oB will provide the actual credential values.

## Data Sources Configured
${useGA4 ? `- ✅ Google Analytics 4 (Property: ${ga4PropertyId})` : '- ❌ Google Analytics 4 (not enabled)'}
${useGSC ? `- ✅ Search Console (${gscSiteUrl})` : '- ❌ Search Console (not enabled)'}
${useWC ? `- ✅ WhatConverts (Profile: ${wcProfileId})` : '- ❌ WhatConverts (not enabled)'}
${useSheets ? `- ✅ Google Sheets (${sheetId} / ${sheetTab})` : '- ❌ Google Sheets (not enabled)'}
${useDocs ? '- ✅ Document Review Portal (Supabase)' : '- ❌ Document Review Portal (not enabled)'}

## Deploy to Vercel

1. Push to GitHub (public repo)
2. Import to vercel.com
3. Add environment variables from .env.example
4. Redeploy

---
Generated by Momentum Digital · needmomentum.com
`;

    // ── Return all files ───────────────────────────────────────────────────
    res.json({
      ok: true,
      slug,
      files: {
        'server.js': serverJs,
        'public/index.html': indexHtml,
        'package.json': packageJson,
        'vercel.json': vercelJson,
        '.env.example': envExample,
        'README.md': readme
      }
    });

  } catch (e) {
    console.error('Generate error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
}

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`\n✅ Client Generator running at http://localhost:${PORT}\n`));
module.exports = app;
