// Native fetch is available in Node 22
// Note: native fetch is available in Node 18+

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

const dummySummary = {
  headings: [ { tag: 'h1', text: 'Test Page' } ],
  landmarks: [],
  interactiveElements: [ { type: 'button', text: 'Click me' } ],
  images: [],
  keyboardFeatures: { focusableElementsCount: 1, skipLinkPresent: false, focusIndicatorIssues: 0, keyboardReachabilityScore: 100 }
};

async function runTest() {
  console.log("Sending payload to Qwen...");
  try {
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen2.5:7b',
        system: systemPrompt,
        prompt: `Please analyze the following webpage accessibility profile:\n${JSON.stringify(dummySummary, null, 2)}`,
        stream: false,
        format: 'json',
        options: { temperature: 0.2, top_p: 0.9 }
      })
    });

    const data = await response.json();
    console.log("=== RAW QWEN RESPONSE ===");
    console.log(data.response);
    console.log("=========================");
    
    // Test parsing
    try {
      JSON.parse(data.response);
      console.log("JSON Parse: SUCCESS");
    } catch(e) {
      console.log("JSON Parse: FAILED");
      console.log("Error:", e.message);
    }
  } catch(e) {
    console.error("Connection error:", e);
  }
}

runTest();
