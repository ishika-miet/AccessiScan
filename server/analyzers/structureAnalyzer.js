import puppeteer from 'puppeteer';

export async function extractAccessibilityStructure(url) {
  console.log(`Extracting accessibility structure for URL: ${url}`);
  
  let browser = null;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    
    // Set a modern viewport
    await page.setViewport({ width: 1280, height: 800 });
    
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    const structure = await page.evaluate(() => {
      // Helper to safely get text content
      const getText = (el) => {
        let text = el.getAttribute('aria-label') || el.innerText || el.textContent || '';
        return text.trim().substring(0, 100); // Truncate for sanity
      };

      // 1. Extract Headings
      const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(el => ({
        tag: el.tagName.toLowerCase(),
        text: getText(el)
      })).filter(h => h.text.length > 0);

      // 2. Extract Landmarks
      const landmarks = Array.from(document.querySelectorAll('header, nav, main, footer, aside, section[aria-labelledby], section[aria-label]')).map(el => {
        let role = el.tagName.toLowerCase();
        if (role === 'section') role = 'region';
        const ariaRole = el.getAttribute('role');
        return {
          role: ariaRole || role,
          label: el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || null
        };
      });

      // 3. Extract Interactive Elements (Buttons & Links)
      const interactive = Array.from(document.querySelectorAll('button, a[href], input[type="button"], input[type="submit"]')).map(el => {
        const tag = el.tagName.toLowerCase();
        let type = tag;
        if (tag === 'input') type = `input[${el.getAttribute('type')}]`;
        
        let text = getText(el);
        if (!text && tag === 'input') text = el.getAttribute('value') || '';
        if (!text && tag === 'a') text = el.getAttribute('title') || 'Empty Link';

        return {
          type,
          text: text || 'Unlabeled Element',
          href: tag === 'a' ? el.getAttribute('href') : null
        };
      }).slice(0, 50); // Limit to top 50 to prevent massive payloads

      // 4. Extract Images
      const images = Array.from(document.querySelectorAll('img, svg')).map(el => {
        const tag = el.tagName.toLowerCase();
        let alt = el.getAttribute('alt');
        
        if (tag === 'svg') {
          const titleEl = el.querySelector('title');
          if (titleEl) alt = titleEl.textContent;
          else alt = el.getAttribute('aria-label') || 'SVG Image (No title)';
        }

        return {
          tag,
          alt: alt !== null ? alt : 'Missing Alt Text',
          src: tag === 'img' ? (el.getAttribute('src') || '').substring(0, 50) + '...' : null
        };
      }).slice(0, 30); // Limit to 30

      return {
        headings,
        landmarks,
        interactive,
        images
      };
    });

    return structure;
  } catch (error) {
    console.error('Error in structure extraction:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
