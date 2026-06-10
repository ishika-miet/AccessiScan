import puppeteer from 'puppeteer';
import { AxePuppeteer } from '@axe-core/puppeteer';
import lighthouse from 'lighthouse';

// Helper to determine category from axe-core tags
function getCategoryFromTags(tags) {
  if (tags.some(t => t.includes('keyboard') || t.includes('focus'))) return 'Keyboard';
  if (tags.some(t => t.includes('color') || t.includes('contrast'))) return 'Contrast';
  if (tags.some(t => t.includes('aria'))) return 'ARIA';
  if (tags.some(t => t.includes('form') || t.includes('label'))) return 'Forms';
  if (tags.some(t => t.includes('nav') || t.includes('link') || t.includes('bypass'))) return 'Navigation';
  return 'Semantic';
}

export async function analyzeAccessibility(startUrl, deepScan = false) {
  const startTime = Date.now();
  let browser = null;
  const MAX_PAGES = deepScan ? 5 : 1; // Deep scan limits to 5 to avoid extreme timeouts
  const visitedUrls = new Set();
  const urlsToVisit = [startUrl];
  
  // Aggregated Results
  let totalElementsAnalyzed = 0;
  const allViolations = new Map(); // id -> violation
  let totalCritical = 0, totalSerious = 0, totalModerate = 0, totalMinor = 0;

  // Journey Graph Data
  const journeyGraph = {
    nodes: [],
    edges: []
  };
  
  const categoryCounts = {
    Contrast: 0,
    Keyboard: 0,
    ARIA: 0,
    Forms: 0,
    Navigation: 0,
    Semantic: 0
  };

  try {
    console.log(`Starting ${deepScan ? 'Deep' : 'Single'} Analysis for URL: ${startUrl}`);
    
    browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--remote-debugging-port=0']
    });

    const page = await browser.newPage();
    const baseUrlObj = new URL(startUrl);

    let pagesScanned = 0;

    while (urlsToVisit.length > 0 && pagesScanned < MAX_PAGES) {
      const currentUrl = urlsToVisit.shift();
      if (visitedUrls.has(currentUrl)) continue;
      
      visitedUrls.add(currentUrl);
      console.log(`Scanning [${pagesScanned + 1}/${MAX_PAGES}]: ${currentUrl}`);

      try {
        await page.goto(currentUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        
        // Count elements on page
        const elementCount = await page.evaluate(() => document.querySelectorAll('*').length);
        totalElementsAnalyzed += elementCount;

        // Grab DOM content for AI/Keyboard engines (only need the first page's DOM)
        if (pagesScanned === 0) {
          totalElementsAnalyzed += 0; // just a placeholder
          var initialDomContent = await page.content();
        }

        // Run Axe
        const results = await new AxePuppeteer(page).analyze();
        
        let pageIssuesCount = 0;

        // Process violations for this page
        for (const violation of results.violations) {
          const impact = violation.impact;
          const count = violation.nodes.length;
          
          if (impact === 'critical') totalCritical += count;
          if (impact === 'serious') totalSerious += count;
          if (impact === 'moderate') totalModerate += count;
          if (impact === 'minor') totalMinor += count;

          // Process Categories
          const category = getCategoryFromTags(violation.tags);
          categoryCounts[category] += count;

          // Merge into allViolations
          if (!allViolations.has(violation.id)) {
            allViolations.set(violation.id, {
              id: violation.id,
              impact: violation.impact,
              description: violation.description,
              help: violation.help,
              helpUrl: violation.helpUrl,
              tags: violation.tags,
              category: category,
              affectedElements: []
            });
          }
          
          const existing = allViolations.get(violation.id);
          
          // Extract deep DOM context for the very first node of this violation to save memory
          let domContext = null;
          if (violation.nodes.length > 0 && violation.nodes[0].target && violation.nodes[0].target.length > 0) {
            try {
              const selector = violation.nodes[0].target[0];
              domContext = await page.evaluate((sel) => {
                const el = document.querySelector(sel);
                if (!el) return null;
                
                // Truncate function
                const truncate = (str, max = 300) => str && str.length > max ? str.substring(0, max) + '...' : str;
                
                const styles = window.getComputedStyle(el);
                
                return {
                  parentHTML: el.parentElement ? truncate(el.parentElement.outerHTML) : null,
                  siblingHTML: el.nextElementSibling ? truncate(el.nextElementSibling.outerHTML) : null,
                  computedStyles: {
                    color: styles.color,
                    backgroundColor: styles.backgroundColor,
                    fontSize: styles.fontSize,
                    display: styles.display,
                    visibility: styles.visibility
                  }
                };
              }, selector);
            } catch (err) {
              console.error(`Failed to extract context for ${violation.id}:`, err.message);
            }
          }

          violation.nodes.forEach((node, idx) => {
            existing.affectedElements.push({
              page: currentUrl,
              html: node.html,
              target: node.target,
              // Only attach full context to the first instance to avoid bloating the payload
              domContext: idx === 0 ? domContext : null
            });
          });
          
          pageIssuesCount += count;
        }

        // Add node to journey graph
        const pageTitle = await page.title().catch(() => currentUrl);
        journeyGraph.nodes.push({
          id: currentUrl,
          url: currentUrl,
          title: pageTitle,
          issuesCount: pageIssuesCount
        });

        pagesScanned++;

        // Extract internal links if deep scan
        if (deepScan && pagesScanned < MAX_PAGES) {
          const links = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a[href]'))
              .map(a => a.href)
              .filter(href => href.startsWith('http'));
          });

          links.forEach(link => {
            try {
              const urlObj = new URL(link);
              // Only add internal links, ignore fragments
              if (urlObj.hostname === baseUrlObj.hostname && urlObj.pathname !== baseUrlObj.pathname) {
                const cleanUrl = urlObj.origin + urlObj.pathname;
                
                // Track edge for Journey Map
                // Avoid duplicate edges from same source to target
                if (!journeyGraph.edges.some(e => e.source === currentUrl && e.target === cleanUrl)) {
                  journeyGraph.edges.push({
                    source: currentUrl,
                    target: cleanUrl
                  });
                }

                if (!visitedUrls.has(cleanUrl) && !urlsToVisit.includes(cleanUrl)) {
                  urlsToVisit.push(cleanUrl);
                }
              }
            } catch (e) {
              // Ignore invalid URLs
            }
          });
        }
      } catch (err) {
        console.error(`Error scanning ${currentUrl}:`, err.message);
      }
    }

    const totalIssues = totalCritical + totalSerious + totalModerate + totalMinor;
    const weightedPenalty = (totalCritical * 10) + (totalSerious * 5) + (totalModerate * 2) + (totalMinor * 1);
    const score = Math.max(0, Math.min(100, Math.round(100 - (weightedPenalty / (totalIssues + 5)) * 5)));

    const durationSeconds = ((Date.now() - startTime) / 1000).toFixed(1);

    // Generate programmatic insights
    const insights = [];
    if (totalCritical > 0) {
      insights.push({ type: 'danger', text: `Critical Action Required: ${totalCritical} critical violations found, severely impacting accessibility.` });
    }
    if (categoryCounts.Keyboard > 0) {
      insights.push({ type: 'warning', text: `Keyboard Navigation: We detected ${categoryCounts.Keyboard} issues affecting keyboard-only users.` });
    }
    if (categoryCounts.Contrast > 0) {
      insights.push({ type: 'warning', text: `Color Contrast: ${categoryCounts.Contrast} elements fail WCAG contrast ratios, making text hard to read.` });
    }
    if (insights.length === 0) {
      insights.push({ type: 'success', text: "Excellent job! No major accessibility patterns are failing." });
    }

    // --- LIGHTHOUSE INTEGRATION ---
    let lighthouseData = null;
    try {
      console.log(`Running Lighthouse for: ${startUrl}`);
      const port = new URL(browser.wsEndpoint()).port;
      
      const lhOptions = {
        logLevel: 'error',
        output: 'json',
        onlyCategories: ['performance', 'seo', 'best-practices', 'accessibility', 'pwa'],
        port: port
      };
      
      const runnerResult = await lighthouse(startUrl, lhOptions);
      const lhr = runnerResult.lhr;
      
      lighthouseData = {
        performance: lhr.categories.performance?.score ? Math.round(lhr.categories.performance.score * 100) : 0,
        seo: lhr.categories.seo?.score ? Math.round(lhr.categories.seo.score * 100) : 0,
        bestPractices: lhr.categories['best-practices']?.score ? Math.round(lhr.categories['best-practices'].score * 100) : 0,
        accessibility: lhr.categories.accessibility?.score ? Math.round(lhr.categories.accessibility.score * 100) : 0,
        pwa: lhr.categories.pwa?.score ? Math.round(lhr.categories.pwa.score * 100) : 0,
        metrics: {
          lcp: lhr.audits['largest-contentful-paint']?.numericValue || 0,
          fcp: lhr.audits['first-contentful-paint']?.numericValue || 0,
          speedIndex: lhr.audits['speed-index']?.numericValue || 0,
          tti: lhr.audits['interactive']?.numericValue || 0,
          tbt: lhr.audits['total-blocking-time']?.numericValue || 0,
          cls: lhr.audits['cumulative-layout-shift']?.numericValue || 0
        },
        audits: {
          seo: Object.values(lhr.audits).filter(a => lhr.categories.seo?.auditRefs.some(ref => ref.id === a.id)),
          bestPractices: Object.values(lhr.audits).filter(a => lhr.categories['best-practices']?.auditRefs.some(ref => ref.id === a.id))
        }
      };
    } catch (lhError) {
      console.error('Lighthouse execution failed:', lhError);
    }

    return {
      score,
      totalIssues,
      pagesScanned,
      duration: durationSeconds,
      totalElementsAnalyzed,
      categorizedIssues: {
        critical: totalCritical,
        serious: totalSerious,
        moderate: totalModerate,
        minor: totalMinor
      },
      categoryScores: categoryCounts,
      insights,
      issues: Array.from(allViolations.values()),
      journeyGraph,
      lighthouse: lighthouseData,
      domContent: initialDomContent
    };

  } catch (error) {
    console.error('Error during accessibility analysis:', error);
    throw new Error('Failed to analyze the URL. Ensure the URL is valid and accessible.');
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
