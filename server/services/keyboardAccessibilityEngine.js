import * as cheerio from 'cheerio';

export function analyzeKeyboardAccessibility(domContent) {
  const $ = cheerio.load(domContent);
  const findings = [];
  let score = 100;

  // 1. Focusable Elements
  const focusableElements = $('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
  const count = focusableElements.length;

  // 2. Tab Navigation Complexity
  let tabComplexity = 'Low';
  if (count > 100) tabComplexity = 'High';
  else if (count > 50) tabComplexity = 'Moderate';

  if (tabComplexity === 'High') {
    score -= 10;
    findings.push({
      title: 'High Tab Navigation Complexity',
      severity: 'Moderate',
      description: `Detected ${count} focusable elements. This may cause fatigue for keyboard users trying to navigate the page.`,
      recommendation: 'Consider grouping controls, implementing skip links, or hiding non-essential interactive elements from the tab sequence.'
    });
  }

  // 3. Skip Links
  const skipLinkPresent = $('a[href^="#"]').length > 0;
  if (!skipLinkPresent && count > 20) {
    score -= 15;
    findings.push({
      title: 'Missing Skip Link',
      severity: 'Serious',
      description: 'No "Skip to Content" or internal anchor link found on a page with many interactive elements.',
      recommendation: 'Add a visually hidden (but focusable) skip link at the very top of the DOM targeting the main content region.'
    });
  }

  // 4. Focus Indicators
  const elementsWithNoOutline = $('[style*="outline: none"], [style*="outline: 0"], [style*="outline:none"], [style*="outline:0"]');
  const focusIndicatorIssues = elementsWithNoOutline.length;
  if (focusIndicatorIssues > 0) {
    score -= Math.min(focusIndicatorIssues * 5, 20);
    findings.push({
      title: 'Hidden Focus Indicators',
      severity: 'Critical',
      description: `Found ${focusIndicatorIssues} elements explicitly hiding focus outlines via inline styles.`,
      recommendation: 'Remove "outline: none" or ensure a custom :focus-visible style is provided.'
    });
  }

  // 5. Tab Order Analysis & Positive Tabindex
  const positiveTabIndex = $('[tabindex]').filter((_, el) => {
    const ti = parseInt($(el).attr('tabindex'), 10);
    return !isNaN(ti) && ti > 0;
  });

  if (positiveTabIndex.length > 0) {
    score -= 15;
    findings.push({
      title: 'Positive Tabindex Usage',
      severity: 'Serious',
      description: `Found ${positiveTabIndex.length} elements with a tabindex > 0. This disrupts the natural reading order and creates tab order inconsistencies.`,
      recommendation: 'Remove positive tabindex values. Use document source order to control tab navigation.'
    });
  }

  // 6. Focus Trap Risk
  const hiddenInteractive = $('[style*="display: none"], [style*="visibility: hidden"]').find('a[href], button, input, select, textarea').not('[tabindex="-1"]');
  let focusTrapRisk = 'Low';
  if (hiddenInteractive.length > 0) {
    focusTrapRisk = 'High';
    score -= 20;
    findings.push({
      title: 'Hidden Focusable Elements',
      severity: 'Critical',
      description: `Detected ${hiddenInteractive.length} focusable elements inside visually hidden containers. This creates focus traps for screen reader and keyboard users.`,
      recommendation: 'Add tabindex="-1" to interactive elements inside hidden containers (e.g., closed modals, off-canvas menus) or use the "inert" attribute.'
    });
  }

  // 7. Landmark Navigation Support
  const hasMain = $('main, [role="main"]').length > 0;
  const hasNav = $('nav, [role="navigation"]').length > 0;
  let landmarkNavigation = 'Good';
  
  if (!hasMain) {
    landmarkNavigation = 'Poor';
    score -= 10;
    findings.push({
      title: 'Missing Main Landmark',
      severity: 'Moderate',
      description: 'No <main> or role="main" element found. Keyboard users cannot quickly jump to the primary content.',
      recommendation: 'Wrap the primary content of the page in a <main> tag.'
    });
  }

  // Ensure score is bounded
  score = Math.max(0, Math.min(100, score));

  return {
    keyboardScore: score,
    focusableElements: count,
    skipLinkPresent,
    focusIndicatorIssues,
    tabComplexity,
    focusTrapRisk,
    landmarkNavigation,
    findings
  };
}
