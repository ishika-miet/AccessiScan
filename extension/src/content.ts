// AccessiScan AI - DOM Adaptation Engine
// Injects real-time CSS accessibility improvements into the host webpage.

let activeModes = new Set<string>();

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'GET_DOM') {
    sendResponse({ dom: document.documentElement.outerHTML });
    return true;
  }
  
  if (request.action === 'TOGGLE_MODE') {
    const { mode, enabled } = request;
    if (enabled) {
      activeModes.add(mode);
    } else {
      activeModes.delete(mode);
    }
    applyAdaptations();
    sendResponse({ success: true, activeModes: Array.from(activeModes) });
  }

  if (request.action === 'GET_ACTIVE_MODES') {
    sendResponse({ activeModes: Array.from(activeModes) });
  }
});

function applyAdaptations() {
  const styles = {
    'high-contrast': `
      /* Targeted High Contrast Overrides */
      body, html { background-color: #ffffff !important; color: #000000 !important; }
      p, h1, h2, h3, h4, h5, h6, span, div { color: #000000 !important; }
      
      /* High Visibility Links */
      a { 
        color: #0000ee !important; 
        text-decoration: underline !important; 
        text-decoration-thickness: 2px !important;
        font-weight: bold !important; 
        background-color: #ffffcc !important; 
      }
      
      /* High Visibility Buttons */
      button, .btn, [role="button"] { 
        background-color: #000000 !important; 
        color: #ffffff !important; 
        border: 2px solid #000000 !important; 
        font-weight: bold !important;
      }
      
      /* Form Visibility */
      input, textarea, select { 
        border: 2px solid #000000 !important; 
        background-color: #ffffff !important; 
        color: #000000 !important; 
      }
    `,
    'large-text': `
      /* Large Text, Spacing, and Readability */
      html { font-size: 115% !important; }
      p, li, a, label, span, h1, h2, h3, h4, h5, h6, div {
        line-height: 1.6 !important;
        letter-spacing: 0.05em !important;
        word-spacing: 0.1em !important;
      }
    `,
    'keyboard': `
      /* Strong Focus Indicators */
      *:focus, *:focus-visible {
        outline: 4px solid #ff9900 !important;
        outline-offset: 2px !important;
        box-shadow: 0 0 0 4px rgba(255, 153, 0, 0.4) !important;
      }
    `,
    'reduced-motion': `
      /* Disable animations and transitions */
      *, *::before, *::after {
        animation-duration: 0.001ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.001ms !important;
        scroll-behavior: auto !important;
      }
    `,
    'dyslexia': `
      /* Dyslexia Friendly Mode */
      * {
        font-family: 'OpenDyslexic', 'Comic Sans MS', sans-serif !important;
        letter-spacing: 0.1em !important;
        word-spacing: 0.2em !important;
        line-height: 1.6 !important;
      }
    `,
    'reading-focus': `
      /* Reading Focus Mode */
      body {
        background-color: #f4f4f4 !important;
      }
      header, footer, nav, aside, .sidebar, [role="banner"], [role="contentinfo"], [role="navigation"], [role="complementary"] {
        opacity: 0.2 !important;
        filter: grayscale(100%) !important;
        pointer-events: none !important;
      }
      main, article, [role="main"] {
        background-color: #ffffff !important;
        border-radius: 8px !important;
        box-shadow: 0 4px 24px rgba(0,0,0,0.1) !important;
        position: relative !important;
        z-index: 10 !important;
      }
    `
  };

  // Remove existing injected styles
  Object.keys(styles).forEach(mode => {
    const existing = document.getElementById(`accessigen-${mode}`);
    if (existing) existing.remove();
  });

  // Inject active styles
  activeModes.forEach(mode => {
    if (styles[mode as keyof typeof styles]) {
      const styleEl = document.createElement('style');
      styleEl.id = `accessigen-${mode}`;
      styleEl.textContent = styles[mode as keyof typeof styles];
      document.head.appendChild(styleEl);
    }
  });
}
