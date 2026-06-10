import puppeteer from 'puppeteer';

const BASE_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  
  :root {
    --primary: #3b82f6;
    --primary-dark: #2563eb;
    --danger: #ef4444;
    --warning: #f59e0b;
    --success: #10b981;
    --text-main: #18181b;
    --text-muted: #71717a;
    --bg-light: #f4f4f5;
    --border: #e4e4e7;
    --ai-primary: #8b5cf6;
    --ai-secondary: #c084fc;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }
  
  body {
    font-family: 'Inter', system-ui, sans-serif;
    color: var(--text-main);
    line-height: 1.5;
    padding: 40px 60px;
    background-color: #ffffff;
    font-size: 14px;
  }

  .header {
    border-bottom: 2px solid var(--border);
    padding-bottom: 20px;
    margin-bottom: 30px;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
  }

  .title {
    font-size: 32px;
    font-weight: 800;
    letter-spacing: -0.02em;
    margin-bottom: 8px;
  }
  
  .ai-title { color: var(--ai-primary); }
  .axe-title { color: var(--primary); }

  .subtitle {
    font-size: 14px;
    color: var(--text-muted);
    font-weight: 500;
  }

  .meta-info {
    text-align: right;
    font-size: 12px;
    color: var(--text-muted);
  }

  .executive-summary {
    display: flex;
    gap: 20px;
    margin-bottom: 40px;
  }

  .score-card {
    flex: 1;
    background: var(--bg-light);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 24px;
    text-align: center;
  }

  .score-card h3 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    margin-bottom: 12px;
  }

  .score-value {
    font-size: 48px;
    font-weight: 800;
    line-height: 1;
  }
  
  .score-good { color: var(--success); }
  .score-warn { color: var(--warning); }
  .score-poor { color: var(--danger); }

  .section { margin-bottom: 40px; page-break-inside: avoid; }
  .section-title {
    font-size: 20px;
    font-weight: 700;
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border);
    color: var(--text-main);
  }

  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }

  .stat-box {
    background: #fff;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
    border-left: 4px solid var(--primary);
  }
  
  .stat-box.critical { border-left-color: var(--danger); }
  .stat-box.serious { border-left-color: var(--warning); }
  .stat-box.moderate { border-left-color: #eab308; }
  .stat-box.minor { border-left-color: var(--primary); }

  .stat-box h4 {
    font-size: 11px;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 4px;
  }
  
  .stat-box .val { font-size: 24px; font-weight: 700; }

  /* Tables */
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; page-break-inside: auto; }
  tr { page-break-inside: avoid; page-break-after: auto; }
  th { background: var(--bg-light); padding: 12px; text-align: left; font-weight: 600; color: var(--text-muted); border-bottom: 2px solid var(--border); }
  td { padding: 12px; border-bottom: 1px solid var(--border); vertical-align: top; }

  .badge {
    display: inline-block;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
  }
  .badge-critical { background: #fee2e2; color: #b91c1c; }
  .badge-serious { background: #ffedd5; color: #c2410c; }
  .badge-moderate { background: #fef9c3; color: #a16207; }
  .badge-minor { background: #dbeafe; color: #1d4ed8; }

  .code-block {
    background: #1e1e1e;
    color: #d4d4d4;
    padding: 12px;
    border-radius: 6px;
    font-family: monospace;
    font-size: 10px;
    white-space: pre-wrap;
    word-wrap: break-word;
    margin-top: 8px;
  }

  .risk-card {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 16px;
    page-break-inside: avoid;
  }
  .risk-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }
  .risk-title { font-weight: 700; font-size: 16px; }
  
  .footer {
    margin-top: 50px;
    padding-top: 20px;
    border-top: 1px solid var(--border);
    text-align: center;
    font-size: 10px;
    color: var(--text-muted);
  }
`;

const getScoreClass = (score) => {
  if (score >= 90) return 'score-good';
  if (score >= 70) return 'score-warn';
  return 'score-poor';
};

const getBadgeClass = (severity) => {
  const s = String(severity).toLowerCase();
  if (s === 'critical') return 'badge-critical';
  if (s === 'serious') return 'badge-serious';
  if (s === 'moderate') return 'badge-moderate';
  return 'badge-minor';
};

export async function generateReportPdf(report) {
  let html = '';

  const reportDate = new Date(report.createdAt).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  if (report.engineType === 'ai') {
    html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>${BASE_STYLES}</style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title ai-title">AI Intelligence Report</div>
            <div class="subtitle">Target: ${report.target}</div>
          </div>
          <div class="meta-info">
            <div>Generated: ${reportDate}</div>
            <div>Duration: ${report.scanDuration}</div>
          </div>
        </div>

        <div class="executive-summary">
          <div class="score-card" style="border-top: 4px solid var(--ai-primary)">
            <h3>AI Acc. Score</h3>
            <div class="score-value ${getScoreClass(report.accessibilityScore)}">${report.accessibilityScore}</div>
            <div style="font-size: 12px; color: var(--text-muted); margin-top: 8px;">Confidence: ${report.aiData?.confidence || 0}%</div>
          </div>
          <div class="score-card">
            <h3>Visual Complexity</h3>
            <div class="score-value" style="font-size: 28px; padding-top: 10px; color: var(--text-main);">${report.aiData?.visualComplexity || 'N/A'}</div>
          </div>
          <div class="score-card">
            <h3>Cognitive Load</h3>
            <div class="score-value" style="font-size: 28px; padding-top: 10px; color: var(--text-main);">${report.aiData?.cognitiveLoad || 'N/A'}</div>
          </div>
          <div class="score-card">
            <h3>Readability Score</h3>
            <div class="score-value" style="font-size: 28px; padding-top: 10px; color: var(--text-main);">${report.aiData?.readabilityScore || 0}/100</div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Intelligent Risk Predictions</div>
          ${(report.aiData?.intelligentRisks || []).map(risk => `
            <div class="risk-card">
              <div class="risk-header">
                <div class="risk-title">${risk.riskTitle}</div>
                <div class="badge ${getBadgeClass(risk.severity)}">${risk.severity} Risk</div>
              </div>
              <div class="grid-2">
                <div style="background: #f8fafc; padding: 12px; border-radius: 6px;">
                  <h4 style="font-size: 10px; color: var(--text-muted); text-transform: uppercase; margin-bottom: 6px;">AI Prediction</h4>
                  <p style="font-size: 12px;">${risk.prediction}</p>
                </div>
                <div style="background: #fdf4ff; padding: 12px; border-radius: 6px; border: 1px solid #fae8ff;">
                  <h4 style="font-size: 10px; color: #a21caf; text-transform: uppercase; margin-bottom: 6px;">Remediation Strategy</h4>
                  <p style="font-size: 12px;">${risk.remediation}</p>
                </div>
              </div>
            </div>
          `).join('')}
          ${(!report.aiData?.intelligentRisks || report.aiData.intelligentRisks.length === 0) ? '<p>No significant risks detected.</p>' : ''}
        </div>

        <div class="footer">
          Generated by AccessiGen Advanced AI Intelligence Engine • Executive Summary
        </div>
      </body>
      </html>
    `;
  } else {
    // AXE CORE REPORT
    html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>${BASE_STYLES}</style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title axe-title">Accessibility Audit Report</div>
            <div class="subtitle">Target: ${report.target}</div>
          </div>
          <div class="meta-info">
            <div>Generated: ${reportDate}</div>
            <div>Elements Scanned: ${report.totalElementsAnalyzed || 'N/A'}</div>
          </div>
        </div>

        <div class="executive-summary">
          <div class="score-card" style="border-top: 4px solid var(--primary)">
            <h3>Overall Score</h3>
            <div class="score-value ${getScoreClass(report.accessibilityScore)}">${report.accessibilityScore}</div>
            <div style="font-size: 12px; font-weight: 700; margin-top: 8px;">Grade: ${report.accessibilityGrade}</div>
          </div>
          <div class="score-card">
            <h3>Total Violations</h3>
            <div class="score-value" style="font-size: 36px; padding-top: 5px; color: var(--text-main);">${report.totalIssues}</div>
          </div>

          ${report.keyboardData ? `
            <div class="score-card" style="border-top: 4px solid var(--warning)">
              <h3>Keyboard Score</h3>
              <div class="score-value ${getScoreClass(report.keyboardData.keyboardScore)}">${report.keyboardData.keyboardScore}</div>
            </div>
          ` : ''}
        </div>

        <div class="section">
          <div class="section-title">Severity Breakdown</div>
          <div class="grid-4">
            <div class="stat-box critical">
              <h4>Critical</h4>
              <div class="val">${report.categorizedIssues?.critical || 0}</div>
            </div>
            <div class="stat-box serious">
              <h4>Serious</h4>
              <div class="val">${report.categorizedIssues?.serious || 0}</div>
            </div>
            <div class="stat-box moderate">
              <h4>Moderate</h4>
              <div class="val">${report.categorizedIssues?.moderate || 0}</div>
            </div>
            <div class="stat-box minor">
              <h4>Minor</h4>
              <div class="val">${report.categorizedIssues?.minor || 0}</div>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Violation Log</div>
          <table>
            <thead>
              <tr>
                <th>Severity</th>
                <th>Issue ID</th>
                <th>Category</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              ${(report.issues || []).map(issue => `
                <tr>
                  <td><span class="badge ${getBadgeClass(issue.impact)}">${issue.impact}</span></td>
                  <td style="font-family: monospace; font-size: 11px;">${issue.id}</td>
                  <td style="text-transform: capitalize;">${(issue.category || '').replace(/-/g, ' ')}</td>
                  <td>
                    <strong>${issue.help}</strong><br/>
                    <span style="color: var(--text-muted); font-size: 11px;">${issue.description}</span>
                  </td>
                </tr>
              `).join('')}
              ${(!report.issues || report.issues.length === 0) ? '<tr><td colspan="4" style="text-align: center">No violations found.</td></tr>' : ''}
            </tbody>
          </table>
        </div>

        ${report.keyboardData && report.keyboardData.findings.length > 0 ? `
        <div class="section">
          <div class="section-title">Keyboard Accessibility Findings</div>
          <table>
            <thead>
              <tr>
                <th>Severity</th>
                <th>Finding Title</th>
                <th>Description</th>
                <th>Recommendation</th>
              </tr>
            </thead>
            <tbody>
              ${report.keyboardData.findings.map(finding => `
                <tr>
                  <td><span class="badge ${getBadgeClass(finding.severity)}">${finding.severity}</span></td>
                  <td style="font-weight: 600;">${finding.title}</td>
                  <td style="color: var(--text-muted);">${finding.description}</td>
                  <td>${finding.recommendation}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ` : ''}

        ${(report.remediation && report.remediation.length > 0) ? `
          <div class="section" style="page-break-before: always;">
            <div class="section-title">Actionable Remediation Code</div>
            ${report.remediation.map(fix => `
              <div class="risk-card">
                <div class="risk-header">
                  <div class="risk-title">${fix.issueTitle}</div>
                  <div class="badge ${getBadgeClass(fix.severity)}">${fix.severity} Priority</div>
                </div>
                <p style="font-size: 12px; margin-bottom: 12px;">${fix.explanation}</p>
                <div class="grid-2">
                  <div>
                    <h4 style="font-size: 10px; color: var(--danger); text-transform: uppercase;">Current Code</h4>
                    <div class="code-block">${(fix.currentCode || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
                  </div>
                  <div>
                    <h4 style="font-size: 10px; color: var(--success); text-transform: uppercase;">Fixed Code</h4>
                    <div class="code-block">${(fix.fixedCode || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <div class="footer">
          Generated by AccessiGen Axe Core Engine • Compliance Audit Report
        </div>
      </body>
      </html>
    `;
  }

  // Launch puppeteer to generate PDF
  let browser = null;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' }
    });
    
    await browser.close();
    return pdfBuffer;
  } catch (error) {
    if (browser) await browser.close();
    throw error;
  }
}
