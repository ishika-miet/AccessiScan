import * as cheerio from 'cheerio';

/**
 * Extracts structured accessibility features from raw DOM content
 */
export function extractFeaturesFromDom(domContent) {
  const $ = cheerio.load(domContent);
  
  // 1. Extract Headings
  const headings = [];
  $('h1, h2, h3, h4, h5, h6').each((_, el) => {
    headings.push({
      tag: el.tagName.toLowerCase(),
      text: $(el).text().trim().substring(0, 100)
    });
  });

  // 2. Extract Landmarks
  const landmarks = [];
  $('header, nav, main, footer, aside, section').each((_, el) => {
    let role = el.tagName.toLowerCase();
    if (role === 'section') role = 'region';
    const ariaRole = $(el).attr('role');
    const label = $(el).attr('aria-label') || $(el).attr('aria-labelledby') || null;
    
    // Only add sections if they have a label, otherwise they aren't landmarks
    if (role !== 'region' || label) {
      landmarks.push({
        role: ariaRole || role,
        label
      });
    }
  });

  // 3. Extract Interactive Elements (Buttons & Links)
  const interactiveElements = [];
  $('button, a[href], input').each((_, el) => {
    const tag = el.tagName.toLowerCase();
    let type = tag;
    if (tag === 'input') {
      const typeAttr = $(el).attr('type');
      if (typeAttr !== 'button' && typeAttr !== 'submit' && typeAttr !== 'text') return; // skip hidden/radio etc for summary
      type = `input[${typeAttr}]`;
    }
    
    let text = $(el).attr('aria-label') || $(el).text().trim();
    if (!text && tag === 'input') text = $(el).attr('value') || '';
    if (!text && tag === 'a') text = $(el).attr('title') || 'Empty Link';

    interactiveElements.push({
      type,
      text: text.substring(0, 100) || 'Unlabeled Element',
      href: tag === 'a' ? $(el).attr('href')?.substring(0,50) : null
    });
  });

  // 4. Extract Images
  const images = [];
  $('img, svg').each((_, el) => {
    const tag = el.tagName.toLowerCase();
    let alt = $(el).attr('alt');
    
    if (tag === 'svg') {
      const titleEl = $(el).find('title');
      if (titleEl.length > 0) alt = titleEl.text();
      else alt = $(el).attr('aria-label') || 'SVG Image (No title)';
    }

    images.push({
      tag,
      alt: alt !== undefined ? alt : 'Missing Alt Text',
      src: tag === 'img' ? ($(el).attr('src') || '').substring(0, 50) + '...' : null
    });
  });

  // 5. Extract Keyboard Features
  const focusableElements = $('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
  const skipLinkPresent = $('a[href^="#"]').length > 0;
  
  // Basic heuristic for focus indicators (usually need CSS, but we can check if outline: none is inline)
  const focusIndicatorIssues = $('[style*="outline: none"], [style*="outline: 0"]').length;

  const keyboardFeatures = {
    focusableElementsCount: focusableElements.length,
    skipLinkPresent,
    focusIndicatorIssues,
    keyboardReachabilityScore: focusableElements.length > 0 ? 100 - Math.min(focusIndicatorIssues * 5, 50) : 100
  };

  return {
    headings: headings.slice(0, 50),
    landmarks: landmarks.slice(0, 30),
    interactiveElements: interactiveElements.slice(0, 50),
    images: images.slice(0, 30),
    keyboardFeatures
  };
}

/**
 * Runs the Qwen 2.5 7B AI Accessibility Engine via Ollama
 */
export async function runQwenAnalysis(structuredSummary) {
  const systemPrompt = `You are an elite Accessibility Auditing Intelligence powered by Qwen. Your role is to analyze a structured summary of a webpage's DOM features, keyboard accessibility metrics, and Axe Core violations (if provided).

You must reason deeply about:
1. Screen Reader Usability: How easily can a blind user navigate this landmark and heading structure?
2. Keyboard Accessibility: Are interactive elements properly labeled for keyboard/switch control users? Are there skip links or focus indicator issues?
3. Cognitive Load & Complexity: Is the page bloated or logically ordered?

You must strictly return your response in the following JSON format without any markdown blocks, formatting, or conversational text. Output ONLY raw JSON:
{
  "aiScore": <Number between 0 and 100>,
  "confidence": <Number between 0 and 100>,
  "cognitiveLoad": "Low" | "Moderate" | "High",
  "visualComplexity": "Minimal" | "Standard" | "Complex",
  "intelligentRisks": [
     { "riskTitle": "...", "prediction": "...", "severity": "Critical" | "Serious" | "Moderate" | "Minor", "remediation": "..." }
  ],
  "executiveSummary": "...",
  "recommendations": ["..."]
}`;

  const userPrompt = `Please analyze the following webpage accessibility profile:
${JSON.stringify(structuredSummary, null, 2)}`;

  try {
    console.log("=== QWEN PAYLOAD ===");
    console.log(JSON.stringify(structuredSummary, null, 2));
    console.log("====================");

    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'qwen2.5:7b', // Primary model
        system: systemPrompt,
        prompt: userPrompt,
        stream: false,
        format: 'json',
        options: {
          temperature: 0.2, // Low temperature for consistent JSON
          top_p: 0.9
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    const data = await response.json();
    let resultJson = data.response;

    console.log("=== RAW QWEN RESPONSE ===");
    console.log(resultJson);
    console.log("=========================");
    
    // Parse the JSON safely (Robust Parser)
    try {
      // Sometimes Qwen adds markdown code blocks or explanatory text.
      // We will extract the first JSON object using Regex.
      let cleanJson = resultJson;
      const jsonMatch = resultJson.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanJson = jsonMatch[0];
      }
      
      const parsedData = JSON.parse(cleanJson);
      
      console.log("=== PARSED JSON ===");
      console.log(parsedData);
      console.log("===================");
      
      return parsedData;
    } catch (parseError) {
      console.error("Failed to parse Qwen JSON output. Raw output was:", resultJson);
      throw new Error("Invalid output format from Qwen Engine.");
    }
    
  } catch (error) {
    console.error('Error running Qwen AI analysis:', error);
    
    // Attempt fallback to 3b if 7b is not found or fails
    if (error.message.includes('model') && error.message.includes('not found')) {
      console.log('Qwen 2.5 7B not found, falling back to 3B...');
      // Implement fallback logic here if needed, or just throw for the user to pull the model
      throw new Error('Qwen 2.5 7B model is not installed in Ollama. Please run `ollama run qwen2.5:7b`');
    }
    
    throw error;
  }
}
