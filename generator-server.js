require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'momentum2026';

// ── Auth ───────────────────────────────────────────────────────────────────
app.post('/api/auth', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) res.json({ ok: true });
  else res.status(401).json({ error: 'Wrong password' });
});

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
      sheetId, sheetTab, sheetColumns,      // sheetColumns = [{key,label,color,type}]
      qualifiedLabel,                        // e.g. "NP Appointments", "Booked Demos"
      supabaseUrl, redirectUri,
      useGA4, useGSC, useWC, useSheets, useDocs, useQualified, useAdSpend, useGMB, useDashboardLogin
    } = config;

    const slug     = toSlug(clientName);
    const colorRgb = hexToRgb(brandColor);
    const rgbStr   = colorRgb ? `${colorRgb.r},${colorRgb.g},${colorRgb.b}` : '58,143,212';
    const initials = clientInitials || clientName.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    const qlabel   = qualifiedLabel || 'Qualified Leads';

    // ── index.html swaps ──────────────────────────────────────────────────
    indexHtml = indexHtml.replace(/%%AGENCY_LABEL%%/g, agencyLabel || 'Momentum Digital');
    indexHtml = indexHtml.replace(/%%CLIENT_NAME%%/g, clientName);

    // Title
    indexHtml = indexHtml.replace(
      '<title>Penn Pain· Analytics by Momentum Digital</title>',
      `<title>${clientName} · Analytics by ${agencyLabel || 'Momentum Digital'}</title>`
    );

    // Brand color
    indexHtml = indexHtml.replace(/--green: #3a8fd4;/, `--green: ${brandColor};`);
    indexHtml = indexHtml.replace(/rgba\(58,143,212,0\.12\)/g, `rgba(${rgbStr},0.12)`);
    indexHtml = indexHtml.replace(/rgba\(58,143,212,0\.07\)/g, `rgba(${rgbStr},0.07)`);
    indexHtml = indexHtml.replace(/rgba\(58,143,212,0\.06\)/g, `rgba(${rgbStr},0.06)`);
    indexHtml = indexHtml.replace(/rgba\(58,143,212,0\.2\)/g,  `rgba(${rgbStr},0.2)`);
    indexHtml = indexHtml.replace(/rgba\(58,143,212,0\.3\)/g,  `rgba(${rgbStr},0.3)`);
    indexHtml = indexHtml.replace(/#3a8fd4/g, brandColor);

    // Logo
    if (logoB64) {
      indexHtml = indexHtml.replace(
        /<img src="data:image\/webp;base64,[^"]*" alt="Momentum Digital"[^>]*>/,
        `<img src="${logoB64}" alt="${clientName}" style="max-height:36px;max-width:160px;height:auto;display:block;filter:brightness(0) invert(1)">`
      );
    }

    // Client name, website, initials
    indexHtml = indexHtml.replace(/Penn Pain Physicians/g, clientName);
    indexHtml = indexHtml.replace(/Penn Pain·/g, clientName + '·');
    indexHtml = indexHtml.replace(/PennPain(?!\.com)/g, initials);
    indexHtml = indexHtml.replace(/https:\/\/pennpain\.com/g, clientWebsite || '#');
    indexHtml = indexHtml.replace(/pennpain\.com(?!\/search)/g, clientWebsite ? clientWebsite.replace(/https?:\/\//, '') : '');
    indexHtml = indexHtml.replace(/GA4 · 486245473/g, useGA4 ? `GA4 · ${ga4PropertyId}` : '');
    indexHtml = indexHtml.replace(/GSC · pennpain\.com/g, useGSC ? `GSC · ${gscSiteUrl}` : '');

    // Agency label
    if (agencyLabel && agencyLabel !== 'Momentum Digital') {
      indexHtml = indexHtml.replace(/Momentum Digital/g, agencyLabel);
    }

    // GA4 property ID
    if (ga4PropertyId) indexHtml = indexHtml.replace(/486245473/g, ga4PropertyId);

    // Qualified leads label
    indexHtml = indexHtml.replace(/%%QUALIFIED_LABEL%%/g, qlabel);

    // Colors array
    indexHtml = indexHtml.replace(
      "const COLORS = ['#3a8fd4',",
      `const COLORS = ['${brandColor}',`
    );

    // ── Sheet KPI cards (dynamic) ─────────────────────────────────────────
    if (useSheets && sheetColumns && sheetColumns.length > 0) {
      // Build KPI cards HTML for each sheet column
      const kpiCardsHtml = `<div style="display:grid;grid-template-columns:repeat(${Math.min(sheetColumns.length, 4)},1fr);gap:12px;margin-bottom:1.5rem">\n` +
        sheetColumns.map(col => `          <div class="chart-card" style="padding:1rem;border-color:${col.color}33">
            <div style="font-size:10px;color:var(--muted);font-family:var(--font-mono);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px">${col.label}</div>
            <div style="font-family:var(--font-display);font-size:32px;font-weight:700;color:${col.color};letter-spacing:-0.5px" id="sheet-kpi-${col.key}">–</div>
            <div style="font-size:11px;color:var(--muted);font-family:var(--font-mono);margin-top:4px">from sheet · latest</div>
          </div>`).join('\n') +
        '\n        </div>';

      indexHtml = indexHtml.replace('        %%SHEET_KPI_CARDS%%', kpiCardsHtml);

      // Build JS to populate each card
      const kpiJs = sheetColumns.map(col =>
        `    const el_${col.key} = document.getElementById('sheet-kpi-${col.key}');\n` +
        `    if (el_${col.key}) el_${col.key}.textContent = adSpend.latest ? ` +
        `(${col.type === 'currency' ? `'$' + (adSpend.latest['${col.key}'] || 0).toLocaleString()` : `fmt(adSpend.latest['${col.key}'] || 0)`}) : '–';`
      ).join('\n');

      indexHtml = indexHtml.replace('    %%SHEET_KPI_JS%%', kpiJs);
    } else {
      indexHtml = indexHtml.replace('        %%SHEET_KPI_CARDS%%', '');
      indexHtml = indexHtml.replace('    %%SHEET_KPI_JS%%', '');
    }

    // Remove unused sections if features disabled
    if (!useWC) {
      // Hide conversions nav badge
      indexHtml = indexHtml.replace('<span class="nav-badge" id="nb-conversions">–</span>', '');
    }
    if (!useDocs) {
      indexHtml = indexHtml.replace(/id="nav-documents"[\s\S]*?<\/button>\s*\n/, '');
    }
    // GMB
    if (useGMB) {
      indexHtml = indexHtml.replace('%%GMB_NAV%%', `<button class="nav-item" onclick="showSection('gmb',this)" id="nav-gmb">
      <svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 1C5.2 1 3 3.2 3 6c0 3.9 5 9 5 9s5-5.1 5-9c0-2.8-2.2-5-5-5zm0 6.8C6.8 7.8 5.8 6.8 5.8 5.6S6.8 3.5 8 3.5s2.2 1 2.2 2.2S9.2 7.8 8 7.8z"/></svg>
      Google Business
    </button>`);
      indexHtml = indexHtml.replace('%%GMB_SECTION%%', `<div id="sec-gmb" style="display:none">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem;padding:1rem 1.25rem;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);animation:fadeUp 0.3s ease both">
          <div style="display:flex;align-items:center;gap:14px">
            <div style="width:42px;height:42px;border-radius:10px;background:rgba(66,133,244,0.12);display:flex;align-items:center;justify-content:center;font-size:20px">📍</div>
            <div><div style="font-size:15px;font-weight:600;letter-spacing:-0.2px">Google Business Profile</div>
            <div style="font-size:11px;color:var(--muted);font-family:var(--font-mono);margin-top:3px">${clientName} · Both Locations Combined</div></div>
          </div>
          <span class="pill" style="background:rgba(66,133,244,0.12);color:#4285f4">Agency Analytics</span>
        </div>
        <div class="section-label">Performance</div>
        <div class="stats-grid" style="margin-bottom:1.5rem">
          <div class="chart-card" style="padding:1.25rem"><div style="font-size:10.5px;font-weight:500;color:var(--muted);letter-spacing:0.06em;text-transform:uppercase;font-family:var(--font-mono);margin-bottom:10px">Impressions</div><div style="font-family:var(--font-display);font-size:28px;font-weight:600;letter-spacing:-0.3px;color:#4285f4" id="gmb-impressions">–</div><div style="font-size:11px;color:var(--muted);font-family:var(--font-mono);margin-top:6px">Search + Maps views</div></div>
          <div class="chart-card" style="padding:1.25rem"><div style="font-size:10.5px;font-weight:500;color:var(--muted);letter-spacing:0.06em;text-transform:uppercase;font-family:var(--font-mono);margin-bottom:10px">Interactions</div><div style="font-family:var(--font-display);font-size:28px;font-weight:600;letter-spacing:-0.3px;color:var(--green)" id="gmb-interactions">–</div><div style="font-size:11px;color:var(--muted);font-family:var(--font-mono);margin-top:6px">Total profile actions</div></div>
          <div class="chart-card" style="padding:1.25rem"><div style="font-size:10.5px;font-weight:500;color:var(--muted);letter-spacing:0.06em;text-transform:uppercase;font-family:var(--font-mono);margin-bottom:10px">Calls</div><div style="font-family:var(--font-display);font-size:28px;font-weight:600;letter-spacing:-0.3px;color:var(--green)" id="gmb-calls">–</div><div style="font-size:11px;color:var(--muted);font-family:var(--font-mono);margin-top:6px">Phone call clicks</div></div>
          <div class="chart-card" style="padding:1.25rem"><div style="font-size:10.5px;font-weight:500;color:var(--muted);letter-spacing:0.06em;text-transform:uppercase;font-family:var(--font-mono);margin-bottom:10px">Direction Requests</div><div style="font-family:var(--font-display);font-size:28px;font-weight:600;letter-spacing:-0.3px;color:var(--amber)" id="gmb-directions">–</div><div style="font-size:11px;color:var(--muted);font-family:var(--font-mono);margin-top:6px">Get directions clicks</div></div>
          <div class="chart-card" style="padding:1.25rem"><div style="font-size:10.5px;font-weight:500;color:var(--muted);letter-spacing:0.06em;text-transform:uppercase;font-family:var(--font-mono);margin-bottom:10px">Website Clicks</div><div style="font-family:var(--font-display);font-size:28px;font-weight:600;letter-spacing:-0.3px;color:#4285f4" id="gmb-website-clicks">–</div><div style="font-size:11px;color:var(--muted);font-family:var(--font-mono);margin-top:6px">Visit website clicks</div></div>
        </div>
        <div class="chart-row-2" style="margin-bottom:1.5rem">
          <div class="chart-card"><div class="section-header"><div><div class="section-title">Search vs Maps</div><div class="section-sub">Impressions by platform</div></div><span class="pill" style="background:rgba(66,133,244,0.12);color:#4285f4">GBP</span></div><div id="gmbSearchMapsLegend" class="legend-row" style="margin-bottom:8px"></div><div style="position:relative;height:200px"><canvas id="gmbSearchMapsChart"></canvas></div></div>
          <div class="chart-card"><div class="section-header"><div><div class="section-title">Mobile vs Desktop</div><div class="section-sub">Impressions by device</div></div><span class="pill" style="background:rgba(66,133,244,0.12);color:#4285f4">GBP</span></div><div id="gmbDeviceLegend" class="legend-row" style="margin-bottom:8px"></div><div style="position:relative;height:200px"><canvas id="gmbDeviceChart"></canvas></div></div>
        </div>
        <div class="chart-card" style="margin-bottom:1.5rem"><div class="section-header"><div><div class="section-title">Impressions Over Time</div><div class="section-sub">Daily GBP profile views</div></div><span class="pill" style="background:rgba(66,133,244,0.12);color:#4285f4">GBP</span></div><div class="legend-row" style="margin-bottom:8px"><div class="legend-item"><div class="legend-swatch" style="background:#4285f4"></div>Impressions</div><div class="legend-item"><div class="legend-swatch" style="background:var(--green)"></div>Interactions</div></div><div style="position:relative;height:220px"><canvas id="gmbImpressionsChart"></canvas></div></div>
        <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 14px;font-size:12px;color:var(--muted);font-family:var(--font-mono);margin-bottom:1.5rem">💡 Data from Agency Analytics Google Sheets add-on · Refresh sheet to update</div>
      </div>`);
      indexHtml = indexHtml.replace('%%GMB_FETCH%%', `fetch(\`/api/gmb?start_date=\${start}&end_date=\${end}\`).then(r=>r.json()).catch(()=>({rows:[],totals:{}}))`);
    } else {
      indexHtml = indexHtml.replace('%%GMB_NAV%%', '');
      indexHtml = indexHtml.replace('%%GMB_SECTION%%', '');
      indexHtml = indexHtml.replace('%%GMB_FETCH%%', `Promise.resolve({rows:[],totals:{}})`);
    }

    if (!useQualified) {
      // Remove NP/qualified section by removing section header and cards
      indexHtml = indexHtml.replace(
        /<!-- NP Appointments section -->[\s\S]*?<div style="height:1px;background:var\(--border\)/,
        '<div style="height:1px;background:var(--border)'
      );
    }

    // ── server.js swaps ───────────────────────────────────────────────────
    serverJs = serverJs.replace("'properties/486245473'", `'properties/${ga4PropertyId || ''}'`);
    serverJs = serverJs.replace("'sc-domain:pennpain.com'", `'${gscSiteUrl || ''}'`);
    serverJs = serverJs.replace("'148479'", `'${wcProfileId || ''}'`);
    serverJs = serverJs.replace(
      "'1cXnqHBu9OJXA-TIemxTAm8tkKNDOMbY8hWgWlpbi3P4'",
      `'${sheetId || ''}'`
    );
    serverJs = serverJs.replace("'dashboard_data'", `'${sheetTab || 'dashboard_data'}'`);
    serverJs = serverJs.replace(/pennpain-secret/g, `${slug}-secret`);

    // Inject SHEET_COLUMNS config
    const colsJson = JSON.stringify(
      (sheetColumns || []).map(c => ({ key: c.key, label: c.label, color: c.color, type: c.type || 'number' }))
    );
    serverJs = serverJs.replace('%%SHEET_COLUMNS%%', colsJson);
    serverJs = serverJs.replace('%%QUALIFIED_LABEL%%', qlabel);
    serverJs = serverJs.replace(/%%SLUG%%/g, slug);
    serverJs = serverJs.replace(/%%AGENCY_LABEL%%/g, agencyLabel || 'Momentum Digital');

    // Remove unused endpoints
    if (!useWC) {
      serverJs = serverJs.replace(/\/\/ ── WhatConverts proxy[\s\S]*?(?=\/\/ ── WhatConverts NP|\/\/ ── Google Sheets|\/\/ ── Review Auth|const PORT)/, '');
    }
    // GMB
    if (useGMB) {
      indexHtml = indexHtml.replace('%%GMB_NAV%%', `<button class="nav-item" onclick="showSection('gmb',this)" id="nav-gmb">
      <svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 1C5.2 1 3 3.2 3 6c0 3.9 5 9 5 9s5-5.1 5-9c0-2.8-2.2-5-5-5zm0 6.8C6.8 7.8 5.8 6.8 5.8 5.6S6.8 3.5 8 3.5s2.2 1 2.2 2.2S9.2 7.8 8 7.8z"/></svg>
      Google Business
    </button>`);
      indexHtml = indexHtml.replace('%%GMB_SECTION%%', `<div id="sec-gmb" style="display:none">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem;padding:1rem 1.25rem;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);animation:fadeUp 0.3s ease both">
          <div style="display:flex;align-items:center;gap:14px">
            <div style="width:42px;height:42px;border-radius:10px;background:rgba(66,133,244,0.12);display:flex;align-items:center;justify-content:center;font-size:20px">📍</div>
            <div><div style="font-size:15px;font-weight:600;letter-spacing:-0.2px">Google Business Profile</div>
            <div style="font-size:11px;color:var(--muted);font-family:var(--font-mono);margin-top:3px">${clientName} · Both Locations Combined</div></div>
          </div>
          <span class="pill" style="background:rgba(66,133,244,0.12);color:#4285f4">Agency Analytics</span>
        </div>
        <div class="section-label">Performance</div>
        <div class="stats-grid" style="margin-bottom:1.5rem">
          <div class="chart-card" style="padding:1.25rem"><div style="font-size:10.5px;font-weight:500;color:var(--muted);letter-spacing:0.06em;text-transform:uppercase;font-family:var(--font-mono);margin-bottom:10px">Impressions</div><div style="font-family:var(--font-display);font-size:28px;font-weight:600;letter-spacing:-0.3px;color:#4285f4" id="gmb-impressions">–</div><div style="font-size:11px;color:var(--muted);font-family:var(--font-mono);margin-top:6px">Search + Maps views</div></div>
          <div class="chart-card" style="padding:1.25rem"><div style="font-size:10.5px;font-weight:500;color:var(--muted);letter-spacing:0.06em;text-transform:uppercase;font-family:var(--font-mono);margin-bottom:10px">Interactions</div><div style="font-family:var(--font-display);font-size:28px;font-weight:600;letter-spacing:-0.3px;color:var(--green)" id="gmb-interactions">–</div><div style="font-size:11px;color:var(--muted);font-family:var(--font-mono);margin-top:6px">Total profile actions</div></div>
          <div class="chart-card" style="padding:1.25rem"><div style="font-size:10.5px;font-weight:500;color:var(--muted);letter-spacing:0.06em;text-transform:uppercase;font-family:var(--font-mono);margin-bottom:10px">Calls</div><div style="font-family:var(--font-display);font-size:28px;font-weight:600;letter-spacing:-0.3px;color:var(--green)" id="gmb-calls">–</div><div style="font-size:11px;color:var(--muted);font-family:var(--font-mono);margin-top:6px">Phone call clicks</div></div>
          <div class="chart-card" style="padding:1.25rem"><div style="font-size:10.5px;font-weight:500;color:var(--muted);letter-spacing:0.06em;text-transform:uppercase;font-family:var(--font-mono);margin-bottom:10px">Direction Requests</div><div style="font-family:var(--font-display);font-size:28px;font-weight:600;letter-spacing:-0.3px;color:var(--amber)" id="gmb-directions">–</div><div style="font-size:11px;color:var(--muted);font-family:var(--font-mono);margin-top:6px">Get directions clicks</div></div>
          <div class="chart-card" style="padding:1.25rem"><div style="font-size:10.5px;font-weight:500;color:var(--muted);letter-spacing:0.06em;text-transform:uppercase;font-family:var(--font-mono);margin-bottom:10px">Website Clicks</div><div style="font-family:var(--font-display);font-size:28px;font-weight:600;letter-spacing:-0.3px;color:#4285f4" id="gmb-website-clicks">–</div><div style="font-size:11px;color:var(--muted);font-family:var(--font-mono);margin-top:6px">Visit website clicks</div></div>
        </div>
        <div class="chart-row-2" style="margin-bottom:1.5rem">
          <div class="chart-card"><div class="section-header"><div><div class="section-title">Search vs Maps</div><div class="section-sub">Impressions by platform</div></div><span class="pill" style="background:rgba(66,133,244,0.12);color:#4285f4">GBP</span></div><div id="gmbSearchMapsLegend" class="legend-row" style="margin-bottom:8px"></div><div style="position:relative;height:200px"><canvas id="gmbSearchMapsChart"></canvas></div></div>
          <div class="chart-card"><div class="section-header"><div><div class="section-title">Mobile vs Desktop</div><div class="section-sub">Impressions by device</div></div><span class="pill" style="background:rgba(66,133,244,0.12);color:#4285f4">GBP</span></div><div id="gmbDeviceLegend" class="legend-row" style="margin-bottom:8px"></div><div style="position:relative;height:200px"><canvas id="gmbDeviceChart"></canvas></div></div>
        </div>
        <div class="chart-card" style="margin-bottom:1.5rem"><div class="section-header"><div><div class="section-title">Impressions Over Time</div><div class="section-sub">Daily GBP profile views</div></div><span class="pill" style="background:rgba(66,133,244,0.12);color:#4285f4">GBP</span></div><div class="legend-row" style="margin-bottom:8px"><div class="legend-item"><div class="legend-swatch" style="background:#4285f4"></div>Impressions</div><div class="legend-item"><div class="legend-swatch" style="background:var(--green)"></div>Interactions</div></div><div style="position:relative;height:220px"><canvas id="gmbImpressionsChart"></canvas></div></div>
        <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 14px;font-size:12px;color:var(--muted);font-family:var(--font-mono);margin-bottom:1.5rem">💡 Data from Agency Analytics Google Sheets add-on · Refresh sheet to update</div>
      </div>`);
      indexHtml = indexHtml.replace('%%GMB_FETCH%%', `fetch(\`/api/gmb?start_date=\${start}&end_date=\${end}\`).then(r=>r.json()).catch(()=>({rows:[],totals:{}}))`);
    } else {
      indexHtml = indexHtml.replace('%%GMB_NAV%%', '');
      indexHtml = indexHtml.replace('%%GMB_SECTION%%', '');
      indexHtml = indexHtml.replace('%%GMB_FETCH%%', `Promise.resolve({rows:[],totals:{}})`);
    }

    if (!useQualified) {
      serverJs = serverJs.replace(/\/\/ ── WhatConverts NP Appointments[\s\S]*?(?=\/\/ ── Google Sheets|\/\/ ── Review Auth|const PORT)/, '');
    }
    if (!useSheets) {
      serverJs = serverJs.replace(/\/\/ ── Google Sheets proxy[\s\S]*?(?=\/\/ ── Review Auth|const PORT)/, '');
    }
    if (!useDocs) {
      serverJs = serverJs.replace(/\/\/ ── Review Auth[\s\S]*?(?=const PORT)/, '');
      serverJs = serverJs.replace(/\/\/ ── Documents API[\s\S]*?(?=const PORT)/, '');
    }

    // Update console log
    serverJs = serverJs.replace(
      'PennPain Dashboard running',
      `${clientName} Dashboard running`
    );

    // ── package.json ──────────────────────────────────────────────────────
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

    // ── vercel.json ───────────────────────────────────────────────────────
    const vercelJson = JSON.stringify({
      version: 2,
      builds: [{ src: "server.js", use: "@vercel/node" }],
      routes: [{ src: "/(.*)", dest: "server.js" }]
    }, null, 2);

    // ── .env.example ──────────────────────────────────────────────────────
    let envExample = `# ${clientName} Dashboard — Environment Variables\n# Ask oB for the actual values\n\n`;
    envExample += `# Google Service Account (same for all clients)\nGOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@project.iam.gserviceaccount.com\nGOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\nYOUR_KEY_HERE\\n-----END PRIVATE KEY-----\\n"\n`;
    if (useWC) envExample += `\n# WhatConverts\nWHATCONVERTS_TOKEN=your_token\nWHATCONVERTS_SECRET=your_secret\n`;
    if (useDocs) {
      envExample += `\n# Supabase\nSUPABASE_URL=${supabaseUrl || 'https://xxxx.supabase.co'}\nSUPABASE_SERVICE_KEY=your_service_key\n`;
      envExample += `\n# Google OAuth\nGOOGLE_CLIENT_ID=your_client_id\nGOOGLE_CLIENT_SECRET=your_client_secret\nREDIRECT_URI=${redirectUri || 'http://localhost:3000/auth/callback'}\nSESSION_SECRET=${slug}-change-this\n`;
    } else {
      envExample += `\nSESSION_SECRET=${slug}-change-this\n`;
    }

    // ── README ────────────────────────────────────────────────────────────
    const colsTable = (sheetColumns || []).map((c, i) =>
      `| ${String.fromCharCode(66 + i)} | ${c.label} | ${c.type} |`
    ).join('\n');

    const readme = `# ${clientName} Analytics Dashboard

Generated by Momentum Digital Dashboard Generator

## Quick Start

\`\`\`bash
npm install
node server.js
\`\`\`

Open: http://localhost:3000

## Setup

1. Ask oB to create your \`.env\` file using the generator
2. Place \`.env\` in this folder (same level as server.js)
3. Run \`npm install\` then \`node server.js\`

## Data Sources
${useGA4 ? `- ✅ Google Analytics 4 (Property: ${ga4PropertyId})` : '- ❌ GA4 not enabled'}
${useGSC ? `- ✅ Search Console (${gscSiteUrl})` : '- ❌ GSC not enabled'}
${useWC ? `- ✅ WhatConverts (Profile: ${wcProfileId})` : '- ❌ WhatConverts not enabled'}
${useSheets ? `- ✅ Google Sheets (${sheetId} / ${sheetTab})` : '- ❌ Google Sheets not enabled'}
${useDocs ? '- ✅ Document Review Portal' : '- ❌ Document Review not enabled'}

${useSheets && sheetColumns?.length ? `## Google Sheet Column Structure

| Column | Label | Type |
|--------|-------|------|
| A | Date | text |
${colsTable}

Melissa adds one row per week. Row 2 is always the current week (overwrite each week).
` : ''}

---
Generated by Momentum Digital · needmomentum.com

${useDashboardLogin ? `## Dashboard Login
Email/password login enabled. Add users to the \`dashboard_users\` table in Supabase:
\`\`\`sql
INSERT INTO dashboard_users (email, name, role, password_hash) VALUES
('user@email.com', 'Name', 'viewer', 'bcrypt_hash_here');
\`\`\`
Use bcryptjs to generate password hashes.` : ''}
`;

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
    console.error('Generate error:', e.message, e.stack);
    res.status(500).json({ error: e.message });
  }
});

function toSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function hexToRgb(hex) {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return r ? { r: parseInt(r[1],16), g: parseInt(r[2],16), b: parseInt(r[3],16) } : null;
}

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`\n✅ Generator running at http://localhost:${PORT}\n`));
module.exports = app;
