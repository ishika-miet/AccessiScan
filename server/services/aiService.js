import dotenv from 'dotenv';

dotenv.config();

function generateFallbackRemediation(issues) {
  if (!issues || issues.length === 0) {
    return [];
  }

  const remediation = [];

  // Generate hardcoded mapping for common issues using the 9-field schema
  issues.forEach(issue => {
    const htmlSnippet = issue.affectedElements?.[0]?.html?.substring(0, 150) || "";
    const selector = issue.affectedElements?.[0]?.target?.[0] || "Unknown Element";
    
    if (issue.id === 'image-alt') {
      remediation.push({
        issueTitle: "Missing Image Alternative Text",
        severity: "High",
        selector: selector,
        currentCode: htmlSnippet || "<img src=\"banner.jpg\">",
        fixedCode: "<img src=\"banner.jpg\" alt=\"Descriptive text for this image\">",
        explanation: "Screen readers cannot understand images without descriptions. Adding an 'alt' attribute ensures visually impaired users know what the image represents.",
        affectedUsers: "Blind and low vision users relying on screen readers.",
        implementation: "Locate the <img> tag and add an 'alt' attribute describing the image context.",
        scoreImpact: "+5 Points"
      });
    } else if (issue.id === 'color-contrast') {
      remediation.push({
        issueTitle: "Insufficient Color Contrast",
        severity: "High",
        selector: selector,
        currentCode: htmlSnippet || "<div style=\"color: #999; background: #eee;\">Text</div>",
        fixedCode: "<div style=\"color: #333; background: #eee;\">Text</div>",
        explanation: "The text color is too similar to the background color, making it difficult or impossible to read.",
        affectedUsers: "Users with low vision or color blindness.",
        implementation: "Increase the contrast ratio to at least 4.5:1 for normal text using darker text colors or lighter backgrounds.",
        scoreImpact: "+4 Points"
      });
    } else if (issue.id === 'html-has-lang') {
      remediation.push({
        issueTitle: "Missing Document Language",
        severity: "Medium",
        selector: "html",
        currentCode: "<html>",
        fixedCode: "<html lang=\"en\">",
        explanation: "Without a language attribute, screen readers might use the wrong pronunciation rules for your content.",
        affectedUsers: "Users relying on text-to-speech tools and screen readers.",
        implementation: "Add the 'lang' attribute to your root <html> element with the appropriate language code.",
        scoreImpact: "+2 Points"
      });
    } else if (issue.id === 'button-name' || issue.id === 'link-name') {
      remediation.push({
        issueTitle: "Empty Button or Link Label",
        severity: "High",
        selector: selector,
        currentCode: htmlSnippet || "<button><i class=\"icon-menu\"></i></button>",
        fixedCode: "<button aria-label=\"Open menu\"><i class=\"icon-menu\"></i></button>",
        explanation: "This interactive element has no text, so screen readers will just say 'Button' without explaining what it does.",
        affectedUsers: "Screen reader users navigating by interactive elements.",
        implementation: "Add visible text inside the button, or provide an 'aria-label' attribute.",
        scoreImpact: "+4 Points"
      });
    } else {
      // Generic fallback for other issues
      remediation.push({
        issueTitle: `Accessibility Issue: ${issue.id}`,
        severity: issue.impact === 'critical' ? 'High' : (issue.impact === 'serious' ? 'Medium' : 'Low'),
        selector: selector,
        currentCode: htmlSnippet || "No snippet available",
        fixedCode: "<!-- Refer to WCAG guidelines for specific code fix -->",
        explanation: issue.description || "This element fails accessibility guidelines and requires remediation.",
        affectedUsers: "Users with various disabilities.",
        implementation: issue.help || "Review element structure and ARIA attributes.",
        scoreImpact: "+1 Point"
      });
    }
  });

  return remediation.slice(0, 10); // Limit to top 10 fixes
}

export async function generateRemediationEngine(issues) {
  // If no API key is provided, return graceful fallback instantly
  if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY === 'your_openrouter_api_key_here') {
    return generateFallbackRemediation(issues);
  }

  if (!issues || issues.length === 0) {
    return [];
  }

  // Sort by impact and take the top 10 unique issues
  const impactWeights = { critical: 4, serious: 3, moderate: 2, minor: 1 };
  
  const sortedIssues = [...issues].sort((a, b) => 
    impactWeights[b.impact] - impactWeights[a.impact]
  ).slice(0, 8); // Reduced to 8 to avoid token limits with large schemas

  const promptData = sortedIssues.map(issue => ({
    id: issue.id,
    impact: issue.impact,
    description: issue.description,
    help: issue.help,
    selector: issue.affectedElements?.[0]?.target?.[0] || "Unknown Element",
    html: issue.affectedElements?.[0]?.html?.substring(0, 150) || "No HTML provided",
    domContext: issue.affectedElements?.[0]?.domContext || null
  }));

  const systemPrompt = `You are a Senior Accessibility Engineer.
Analyze the provided accessibility violations and generate a JSON array of specific code fixes.
You MUST utilize the provided 'domContext' (parentHTML, siblingHTML, computedStyles) to infer the semantic purpose of the failing element. For example, if the parent is a <nav>, recommend navigation-specific aria-labels. If you have computed styles, reference color contrast numbers.
DO NOT use overly technical jargon. Explanations must be beginner-friendly.
You MUST return an array of objects matching EXACTLY this JSON structure:
[
  {
    "issueTitle": "A clear, concise title (e.g., 'Missing Image Alternative Text')",
    "severity": "Critical | High | Medium | Low",
    "selector": "The provided CSS selector",
    "currentCode": "The exact failing HTML snippet provided",
    "fixedCode": "The corrected HTML snippet. MUST BE VALID HTML.",
    "explanation": "A beginner-friendly explanation of why this matters.",
    "affectedUsers": "Who this impacts (e.g., 'Blind users relying on screen readers')",
    "implementation": "1-2 short sentences instructing the developer how to implement the fix. Mention the DOM context if relevant.",
    "scoreImpact": "+X Points (e.g., '+5 Points')"
  }
]
Return ONLY a valid JSON array. Do not wrap in markdown blocks.`;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3.1-8b-instruct:free",
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(promptData) }
        ],
        temperature: 0.2
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.statusText}`);
    }

    const jsonResponse = await response.json();
    const aiContent = jsonResponse.choices?.[0]?.message?.content;
    
    if (!aiContent) throw new Error("Empty response from OpenRouter");
    
    // Attempt to extract JSON if LLM wraps it in markdown despite instructions
    let jsonString = aiContent;
    if (jsonString.includes('```json')) {
      jsonString = jsonString.split('```json')[1].split('```')[0].trim();
    } else if (jsonString.includes('```')) {
      jsonString = jsonString.split('```')[1].split('```')[0].trim();
    }

    const parsedData = JSON.parse(jsonString);
    
    // Attach domContext back to the generated remediation objects
    if (Array.isArray(parsedData)) {
      return parsedData.map((fix, idx) => ({
        ...fix,
        domContext: promptData[idx]?.domContext || null
      }));
    }
    return [];

  } catch (error) {
    console.error("OpenRouter AI Error. Falling back to local engine:", error.message);
    // Fallback: run the hardcoded engine but pass the first element's domContext into the schema
    const fallbackRemediation = generateFallbackRemediation(issues);
    return fallbackRemediation.map((fix, idx) => ({
      ...fix,
      domContext: promptData[idx]?.domContext || null
    }));
  }
}

export function generateLighthouseSuggestions(lighthouseData) {
  if (!lighthouseData || !lighthouseData.audits) return [];
  
  const suggestions = [];
  
  // Extract failing Performance metrics
  const { metrics } = lighthouseData;
  if (metrics) {
    if (metrics.lcp > 2500) {
      suggestions.push({
        title: "Improve Largest Contentful Paint (LCP)",
        description: `LCP is ${((metrics.lcp)/1000).toFixed(1)}s (Goal: < 2.5s). Optimize the loading of your main hero image or text block. Consider preloading the LCP image or deferring non-critical JavaScript.`,
        category: "Performance",
        scoreImpact: "High",
        priority: "High"
      });
    }
    if (metrics.tbt > 200) {
      suggestions.push({
        title: "Reduce Total Blocking Time (TBT)",
        description: `TBT is ${Math.round(metrics.tbt)}ms (Goal: < 200ms). The main thread is blocked for too long, delaying interactivity. Minify JS, reduce third-party scripts, or break up long tasks.`,
        category: "Performance",
        scoreImpact: "High",
        priority: "High"
      });
    }
    if (metrics.cls > 0.1) {
      suggestions.push({
        title: "Fix Cumulative Layout Shift (CLS)",
        description: `CLS is ${metrics.cls.toFixed(2)} (Goal: < 0.1). Prevent elements from shifting while loading by adding explicit width and height attributes to images/videos, and reserving space for ads.`,
        category: "Performance",
        scoreImpact: "Medium",
        priority: "Medium"
      });
    }
  }

  // Extract failing SEO and Best Practices audits
  const allAudits = [...(lighthouseData.audits.seo || []), ...(lighthouseData.audits.bestPractices || [])];
  
  allAudits.forEach(audit => {
    // Only include failing audits (score < 1 or score === null with errors)
    if (audit.score !== null && audit.score < 1) {
      suggestions.push({
        title: audit.title,
        description: audit.description,
        category: lighthouseData.audits.seo?.find(a => a.id === audit.id) ? "SEO" : "Best Practices",
        scoreImpact: "Medium",
        priority: "Medium"
      });
    }
  });

  return suggestions.slice(0, 10);
}
