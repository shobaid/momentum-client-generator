const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

require('dotenv').config();

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'momentum2024';

// ── Auth ───────────────────────────────────────────────────────────────────
app.post('/api/auth', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) res.json({ ok: true });
  else res.status(401).json({ error: 'Wrong password' });
});

// ─ Helpers ────────────────────────────────────────────────────────────────
function toSlug(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
}

// ── Generate ───────────────────────────────────────────────────────────────
app.post('/api/generate', (req, res) => {
  const { password, config } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });

  try {
    let indexHtml = fs.readFileSync(path.join(__dirname, 'template-index.html'), 'utf8');
    let serverJs  = fs.readFileSync(path.join(__dirname, 'template-server.js'), 'utf8');

    const {
      clientName, clientWebsite, clientInitials, brandColor, logoB64, agencyLabel,
      ga4PropertyId, gscSiteUrl, wcProfileId,
      sheetId, sheetTab, sheetColumns,
      qualifiedLabel,
      supabaseUrl, supabaseKey,
      useGA4, useGSC, useWC, useSheets, useDocs, useQualified, useAdSpend,
      useGMB, useDashboardLogin, gmbTab, gmbSheetId, dashUsers
    } = config;

    const slug     = toSlug(clientName);
    const colorRgb = hexToRgb(brandColor);
    const rgbStr   = colorRgb ? `${colorRgb.r},${colorRgb.g},${colorRgb.b}` : '58,143,212';
    const initials = clientInitials || clientName.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    const qlabel   = qualifiedLabel || 'Qualified Leads';
    const agency   = agencyLabel || 'Momentum Digital';

    // ── index.html swaps ──────────────────────────────────────────────────
    indexHtml = indexHtml.replace('<title>Penn Pain· Analytics by Momentum Digital</title>', `<title>${clientName} · Analytics by ${agency}</title>`);
    indexHtml = indexHtml.replace(/--green: #3a8fd4;/, `--green: ${brandColor};`);
    indexHtml = indexHtml.replace(/--green2: rgba\(58,143,212,0\.12\);/, `--green2: rgba(${rgbStr},0.12);`);
    indexHtml = indexHtml.replace(/%%CLIENT_NAME%%/g, clientName);
    indexHtml = indexHtml.replace(/%%AGENCY_LABEL%%/g, agency);
    indexHtml = indexHtml.replace(/%%CLIENT_INITIALS%%/g, initials);
    
    if (logoB64) {
      indexHtml = indexHtml.replace(/<div class="logo-mark">.*?<\/div>/s, `<img src="${logoB64}" style="width:32px;height:32px;border-radius:9px;object-fit:cover">`);
    } else {
      indexHtml = indexHtml.replace(/%%CLIENT_INITIALS%%/g, initials);
    }

    // Feature visibility swaps
    const toggleSection = (id, show) => {
      if (!show) indexHtml = indexHtml.replace(new RegExp(`<div class="feature-row"[\\s\\S]*?id="tog-${id}"[\\s\\S]*?</div>\\s*<div class="sub-fields"[\\s\\S]*?id="sub-${id}"[\\s\\S]*?</div>`, 'm'), '');
    };
    if (!useGA4) toggleSection('ga4', false);
    if (!useGSC) toggleSection('gsc', false);
    if (!useWC) toggleSection('wc', false);
    if (!useSheets) toggleSection('sheets', false);
    if (!useQualified) toggleSection('qualified', false);
    if (!useGMB) toggleSection('gmb', false);
    if (!useDashboardLogin) toggleSection('dashLogin', false);
    if (!useDocs) toggleSection('docs', false);

    // ─ server.js swaps ───────────────────────────────────────────────────
    serverJs = serverJs.replace("'properties/486245473'", `'properties/${ga4PropertyId || ''}'`);
    serverJs = serverJs.replace("'sc-domain:pennpain.com'", `'${gscSiteUrl || ''}'`);
    serverJs = serverJs.replace("'148479'", `'${wcProfileId || ''}'`);
    serverJs = serverJs.replace("'1cXnqHBu9OJXA-TIemxTAm8tkKNDOMbY8hWgWlpbi3P4'", `'${sheetId || ''}'`);
    serverJs = serverJs.replace("'dashboard_data'", `'${sheetTab || 'dashboard_data'}'`);
    serverJs = serverJs.replace(/%%SLUG%%/g, slug);
    
    const gmbTabName = gmbTab || 'gmb_data';
    serverJs = serverJs.replace("'gmb_data'", `'${gmbTabName}'`);
    indexHtml = indexHtml.replace(/gmb_data sheet tab/g, `${gmbTabName} sheet tab`);
    
    if (gmbSheetId) {
      serverJs = serverJs.replace("range: 'gmb_data!A:J'", `spreadsheetId: '${gmbSheetId}',\n      range: '${gmbTabName}!A:J'`);
      serverJs = serverJs.replace("const GMB_SHEET_ID = SHEET_ID;", `const GMB_SHEET_ID = '${gmbSheetId}';`);
    } else {
      serverJs = serverJs.replace("const GMB_SHEET_ID = SHEET_ID;", '');
      serverJs = serverJs.replace("spreadsheetId: GMB_SHEET_ID,", `spreadsheetId: SHEET_ID,`);
    }

    serverJs = serverJs.replace(/%%AGENCY_LABEL%%/g, agency);
    serverJs = serverJs.replace(/%%CLIENT_NAME%%/g, clientName);
    serverJs = serverJs.replace(/%%QUALIFIED_LABEL%%/g, qlabel);

    // Inject SHEET_COLUMNS config (Now uses custom mapped columns)
    const finalColsJson = JSON.stringify(sheetColumns || []);
    serverJs = serverJs.replace('%%SHEET_COLUMNS%%', finalColsJson);

    // Remove unused endpoints
    if (!useWC) serverJs = serverJs.replace(/\/\/ ─ WhatConverts proxy[\s\S]*?(?=\/\/ ── WhatConverts NP|\/\/ ── Google Sheets|\/\/ ── Google Business|\/\/ ── Dashboard Auth|\/\/ ── Review Auth|const PORT)/, '');
    if (!useQualified) serverJs = serverJs.replace(/\/\/ ── WhatConverts NP Appointments[\s\S]*?(?=\/\/ ── Google Sheets|\/\/ ── Google Business|\/\/ ── Dashboard Auth|\/\/ ── Review Auth|const PORT)/, '');
    if (!useSheets) serverJs = serverJs.replace(/\/\/ ── Google Sheets[\s\S]*?(?=\/\/ ── Google Business|\/\/ ── Dashboard Auth|\/\/ ── Review Auth|const PORT)/, '');
    if (!useGMB) serverJs = serverJs.replace(/\/\/ ── Google Business Profile[\s\S]*?(?=\/\/ ── Dashboard Auth|\/\/ ─ Review Auth|const PORT)/, '');
    if (!useDashboardLogin) serverJs = serverJs.replace(/\/\/ ── Dashboard Auth[\s\S]*?(?=\/\/ ── Review Auth|const PORT)/, '');
    if (!useDocs) {
      serverJs = serverJs.replace(/\/\/ ── Review Auth[\s\S]*?(?=const PORT)/, '');
      serverJs = serverJs.replace(/\/\/ ── Documents API[\s\S]*?(?=const PORT)/, '');
    }

    serverJs = serverJs.replace('PennPain Dashboard running', `${clientName} Dashboard running`);

    // ── Strip unused requires ─────────────────────────────────────────────
    const needsSupabase = useDocs || useDashboardLogin;
    const needsJwt = useDocs || useDashboardLogin;
    const needsCookieParser = useDocs || useDashboardLogin;
    const needsBcrypt = useDashboardLogin;
    const needsGoogleapis = useSheets || useGMB;
    const needsCrypto = useDocs;

    if (!needsSupabase) {
      serverJs = serverJs.replace("const { createClient } = require('@supabase/supabase-js');\n", '');
      serverJs = serverJs.replace(/const supabase = createClient\([\s\S]*?\);\n/, '');
    }
    if (!needsBcrypt) serverJs = serverJs.replace("const bcrypt = require('bcryptjs');\n", '');
    if (!needsJwt) serverJs = serverJs.replace("const jwt = require('jsonwebtoken');\n", '');
    if (!needsCookieParser) {
      serverJs = serverJs.replace("const cookieParser = require('cookie-parser');\n", '');
      serverJs = serverJs.replace("app.use(cookieParser());\n", '');
    }
    if (!needsGoogleapis) serverJs = serverJs.replace("const { google } = require('googleapis');\n", '');
    if (!needsCrypto) serverJs = serverJs.replace("const crypto = require('crypto');\n", '');

    // ── package.json ──────────────────────────────────────────────────────
    const deps = {
      "express": "^4.18.2",
      "axios": "^1.6.0",
      "google-auth-library": "^9.0.0",
      "dotenv": "^16.3.1"
    };
    if (needsGoogleapis) deps["googleapis"] = "^140.0.0";
    if (needsJwt) deps["jsonwebtoken"] = "^9.0.2";
    if (needsCookieParser) deps["cookie-parser"] = "^1.4.6";
    if (needsSupabase) deps["@supabase/supabase-js"] = "^2.38.0";
    if (needsBcrypt) deps["bcryptjs"] = "^2.4.3";

    const packageJson = JSON.stringify({
      name: `${slug}-dashboard`,
      version: "1.0.0",
      main: "server.js",
      scripts: { start: "node server.js" },
      dependencies: deps
    }, null, 2);

    // ── vercel.json ───────────────────────────────────────────────────────
    const vercelJson = JSON.stringify({
      version: 2,
      builds: [{ src: "server.js", use: "@vercel/node" }],
      routes: [{ src: "/(.*)", dest: "server.js" }]
    }, null, 2);

    // ─ .env.example ─────────────────────────────────────────────────────
    let envExample = `# ${clientName} Dashboard — Environment Variables\n\n`;
    envExample += `# Google Service Account\nGOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@project.iam.gserviceaccount.com\nGOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\nYOUR_KEY_HERE\\n-----END PRIVATE KEY-----\\n"\n`;
    if (useWC) envExample += `\n# WhatConverts\nWHATCONVERTS_TOKEN=your_token\nWHATCONVERTS_SECRET=your_secret\n`;
    
    if (needsSupabase) {
      envExample += `\n# Supabase (Used for Dashboard Login & Document Review)\nSUPABASE_URL=${supabaseUrl || 'https://xxxx.supabase.co'}\nSUPABASE_SERVICE_KEY=${supabaseKey || 'your_service_key_here'}\n`;
    }
    
    envExample += `\nSESSION_SECRET=${slug}-change-this-to-random-string\n`;

    // ── Supabase SQL ──────────────────────────────────────────────────────
    let supabaseSql = `-- ${clientName} Dashboard — Supabase Setup\n-- Run this in the Supabase SQL Editor\n\n`;

    if (useDashboardLogin || useDocs) {
      const userInserts = (dashUsers || []).map(u => {
        const hash = bcrypt.hashSync(u.password, 10);
        const name = (u.name || u.email).replace(/'/g, "''");
        const email = u.email.replace(/'/g, "''");
        return `('${email}', '${name}', '${u.role || 'viewer'}', '${hash}')`;
      }).join(',\n  ');

      const userSql = userInserts
        ? `\n-- Initial users\nINSERT INTO dashboard_users (email, name, role, password_hash) VALUES\n  ${userInserts};\n`
        : `\n-- Add users:\n-- INSERT INTO dashboard_users (email, name, role, password_hash) VALUES\n-- ('user@email.com', 'Name', 'viewer', bcrypt_hash_here);\n`;

      supabaseSql += `-- Dashboard Users & Reviewers (email/password login via Supabase)\nCREATE TABLE IF NOT EXISTS dashboard_users (\n  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,\n  email TEXT UNIQUE NOT NULL,\n  password_hash TEXT NOT NULL,\n  name TEXT,\n  role TEXT DEFAULT 'viewer',\n  created_at TIMESTAMPTZ DEFAULT NOW()\n);\nALTER TABLE dashboard_users ENABLE ROW LEVEL SECURITY;\nCREATE POLICY "service_role_all" ON dashboard_users FOR ALL USING (true);\nGRANT ALL ON dashboard_users TO service_role;\n${userSql}\n`;
    }

    if (useDocs) {
      supabaseSql += `-- Document Review Portal Tables\nCREATE TABLE documents (\n  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,\n  title TEXT NOT NULL,\n  google_doc_url TEXT NOT NULL,\n  description TEXT,\n  status TEXT DEFAULT 'pending',\n  created_by TEXT NOT NULL,\n  created_at TIMESTAMPTZ DEFAULT NOW(),\n  updated_at TIMESTAMPTZ DEFAULT NOW()\n);\nCREATE TABLE comments (\n  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,\n  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,\n  author_email TEXT NOT NULL,\n  author_name TEXT,\n  body TEXT NOT NULL,\n  created_at TIMESTAMPTZ DEFAULT NOW()\n);\nALTER TABLE documents ENABLE ROW LEVEL SECURITY;\nALTER TABLE comments ENABLE ROW LEVEL SECURITY;\nCREATE POLICY "service_role_all" ON documents FOR ALL USING (true);\nCREATE POLICY "service_role_all" ON comments FOR ALL USING (true);\nGRANT ALL ON documents TO service_role;\nGRANT ALL ON comments TO service_role;\n\n`;
    }

    // ── Sheet structure guide ─────────────────────────────────────────────
    let sheetGuide = '';
    if (useSheets && sheetColumns?.length) {
      const colRows = sheetColumns.map(c => `| ${c.column_letter} | ${c.sheet_header} | ${c.label} | ${c.type} |`).join('\n');
      sheetGuide = `\n## Google Sheet Structure (${sheetTab})\n\n| Col Letter | Sheet Header Name | Dashboard Metric | Data Type |\n|------------|-------------------|------------------|-----------|\n| A | Date (e.g. 8/1-8/6) | Date Label | text |\n| B | Week Start | Week Start | date |\n| C | Week End | Week End | date |\n${colRows}\n\nNewest row at top (row 2). Dashboard filters by Week End date.\n`;
    }

    if (useGMB) {
      sheetGuide += `\n## Google Business Profile Sheet (gmb_data tab)\n\nExport from Agency Analytics Google Sheets add-on:\n- Integration: Google Business Profile\n- View: Location Analytics\n- Dimension: Date\n- Metrics: Impressions, Interactions, Website Clicks, Call Clicks, Direction Requests, all Impression breakdowns\n- Row Limit: All\n`;
    }

    // ─ README ────────────────────────────────────────────────────────────
    const readme = `# ${clientName} Analytics Dashboard\n\nGenerated by ${agency} Dashboard Generator\n\n## Quick Start\n\n\`\`\`bash\nnpm install\nnode server.js\n\`\`\`\n\nOpen: http://localhost:3000\n\n## Vercel Deployment\n\n1. Push this folder to a new GitHub repo\n2. Import repo in Vercel — Framework: **Other**\n3. Add all environment variables from \`.env.example\`\n4. Deploy\n\n## Data Sources\n${useGA4 ? `- ✅ Google Analytics 4 (Property: ${ga4PropertyId})` : '- ❌ GA4 not enabled'}\n${useGSC ? `- ✅ Search Console (${gscSiteUrl})` : '- ❌ GSC not enabled'}\n${useWC ? `- ✅ WhatConverts (Profile: ${wcProfileId})` : '- ❌ WhatConverts not enabled'}\n${useSheets ? `- ✅ Google Sheets (Tab: ${sheetTab})` : '-  Google Sheets not enabled'}\n${useGMB ? '- ✅ Google Business Profile (via Sheets gmb_data tab)' : '- ❌ GBP not enabled'}\n${useDocs ? '- ✅ Document Review Portal (Supabase Auth)' : '- ❌ Document Review not enabled'}\n${useDashboardLogin ? '- ✅ Dashboard Login (email/password)' : '- ❌ No dashboard login (public)'}\n${sheetGuide}\n## Service Account Access\n\nGrant \`GOOGLE_SERVICE_ACCOUNT_EMAIL\` access to:\n- GA4: Admin → Account Access Management → Viewer\n- GSC: Settings → Users and permissions → Full\n- Google Sheet: Share → Viewer\n\n---\nGenerated by ${agency} · ${new Date().toLocaleDateString()}\n`;

    const gitignore = `# Environment & secrets\n.env\nprivate-key.pem\n*-service-account*.json\nnode_modules/\nlayout.json\n`;

    res.json({
      ok: true,
      slug,
      files: {
        'server.js': serverJs,
        'public/index.html': indexHtml,
        'package.json': packageJson,
        'vercel.json': vercelJson,
        '.env.example': envExample,
        '.gitignore': gitignore,
        'supabase-setup.sql': (useDashboardLogin || useDocs) ? supabaseSql : null,
        'README.md': readme
      }
    });

  } catch (e) {
    console.error('Generate error:', e.message, e.stack);
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Momentum Generator running on port ${PORT}`));