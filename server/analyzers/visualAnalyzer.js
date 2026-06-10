import sharp from 'sharp';
import fs from 'fs';

export async function analyzeImageVisuals(filePath) {
  try {
    const startTime = Date.now();
    
    // Get image stats and metadata using sharp
    const image = sharp(filePath);
    const metadata = await image.metadata();
    const stats = await image.stats();

    // Extract channel standard deviations (proxy for contrast/detail)
    const stdDevs = stats.channels.map(ch => ch.stdev);
    const avgStdDev = stdDevs.reduce((a, b) => a + b, 0) / stdDevs.length;
    
    // Calculate a rough "contrast/clarity" score (0-100) based on stdDev
    // Typical stdDev ranges from 30 (dull/blurry) to 80 (sharp/high contrast)
    let clarityScore = Math.max(0, Math.min(100, (avgStdDev - 20) * 1.5));

    const issues = [];
    let critical = 0, serious = 0, moderate = 0, minor = 0;

    // Simulate Visual Accessibility Checks based on real image stats
    
    // 1. Contrast Check
    if (avgStdDev < 40) {
      issues.push({
        id: 'visual-low-contrast',
        impact: 'critical',
        category: 'Contrast',
        description: 'The overall image contrast is extremely low, making it difficult for visually impaired users to read content.',
        help: 'Ensure text has a minimum contrast ratio of 4.5:1 against its background.',
        tags: ['wcag2aa', 'cat.color'],
        affectedElements: [{ target: ['Image-wide'], html: 'Global Image Region' }]
      });
      critical++;
    } else if (avgStdDev < 55) {
      issues.push({
        id: 'visual-moderate-contrast',
        impact: 'moderate',
        category: 'Contrast',
        description: 'Some regions appear to have borderline contrast ratios.',
        help: 'Review text overlaying images for contrast compliance.',
        tags: ['wcag2aa', 'cat.color'],
        affectedElements: [{ target: ['Image-wide'], html: 'Global Image Region' }]
      });
      moderate++;
    }

    // 2. Luminance/Brightness Check
    const avgLuminance = stats.channels.map(ch => ch.mean).reduce((a, b) => a + b, 0) / stats.channels.length;
    if (avgLuminance > 220) {
      issues.push({
        id: 'visual-overexposure',
        impact: 'serious',
        category: 'Brightness',
        description: 'The image is very bright/overexposed, which can cause glare and readability issues.',
        help: 'Reduce stark white backgrounds or lower exposure levels.',
        tags: ['wcag21a', 'cat.sensory'],
        affectedElements: [{ target: ['Bright Areas'], html: 'High Luminance Regions' }]
      });
      serious++;
    } else if (avgLuminance < 30) {
      issues.push({
        id: 'visual-underexposure',
        impact: 'serious',
        category: 'Brightness',
        description: 'The image is too dark, obscuring details for users with low vision.',
        help: 'Increase overall brightness and element visibility.',
        tags: ['wcag21a', 'cat.sensory'],
        affectedElements: [{ target: ['Dark Areas'], html: 'Low Luminance Regions' }]
      });
      serious++;
    }

    // 3. Image Dimensions / Tiny Text Approximation
    if (metadata.width < 800) {
      issues.push({
        id: 'visual-tiny-content',
        impact: 'minor',
        category: 'Readability',
        description: 'The image resolution is low. Embedded text may be too small or pixelated to read.',
        help: 'Provide high-resolution assets or use SVG for text-heavy graphics.',
        tags: ['wcag144', 'cat.text'],
        affectedElements: [{ target: ['Image Wrapper'], html: `${metadata.width}x${metadata.height}px` }]
      });
      minor++;
    }

    // Clean up temporary file
    try {
      fs.unlinkSync(filePath);
    } catch (e) {
      console.error('Failed to clean up uploaded file:', e.message);
    }

    const totalIssues = critical + serious + moderate + minor;
    const weightedPenalty = (critical * 10) + (serious * 5) + (moderate * 2) + (minor * 1);
    
    // Normalize score
    const score = Math.max(0, Math.min(100, Math.round(100 - (weightedPenalty / (totalIssues + 2)) * 5)));
    
    const durationSeconds = ((Date.now() - startTime) / 1000).toFixed(1);

    const insights = [];
    if (critical > 0) insights.push({ type: 'danger', text: 'Critical contrast issues detected in the uploaded image.' });
    if (issues.length === 0) insights.push({ type: 'success', text: 'The visual analytics indicate healthy contrast and readability levels.' });

    return {
      score,
      totalIssues,
      pagesScanned: 1,
      duration: durationSeconds,
      totalElementsAnalyzed: 1, // Treat image as 1 master element
      categorizedIssues: { critical, serious, moderate, minor },
      categoryScores: {
        Contrast: critical + moderate,
        Brightness: serious,
        Readability: minor
      },
      insights,
      issues
    };

  } catch (error) {
    console.error('Error during image analysis:', error);
    // Cleanup if possible
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (e) {}
    }
    throw new Error('Failed to process image. Ensure the file is a valid image format.');
  }
}
