import express from 'express';
import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
const router = express.Router();

import { analyzeAccessibility } from '../analyzers/accessibilityAnalyzer.js';
import { analyzeImageVisuals } from '../analyzers/visualAnalyzer.js';
import { generateRemediationEngine, generateLighthouseSuggestions } from '../services/aiService.js';
import { runQwenAnalysis, extractFeaturesFromDom } from '../services/qwenAccessibilityEngine.js';
import { analyzeKeyboardAccessibility } from '../services/keyboardAccessibilityEngine.js';
import { generateReportPdf } from '../services/pdfGenerator.js';
import ScanReport from '../models/ScanReport.js';
import { extractAccessibilityStructure } from '../analyzers/structureAnalyzer.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import multer from 'multer';

const upload = multer({ dest: 'uploads/' });

// Helper to determine Grade
const getGrade = (score) => {
  if (score >= 95) return 'A+';
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
};

// Analyze Route
router.post('/analyze', optionalAuth, async (req, res) => {
  const { url, deepScan, source = 'web' } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required.' });
  }

  try {
    new URL(url);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid URL format.' });
  }

  try {
    const results = await analyzeAccessibility(url, deepScan === true);
    
    // Generate AI Remediation
    const remediation = await generateRemediationEngine(results.issues);
    const lighthouseRemediation = generateLighthouseSuggestions(results.lighthouse);
    
    // Run Keyboard Accessibility Engine
    const keyboardData = results.domContent ? analyzeKeyboardAccessibility(results.domContent) : null;
    
    // Clean up DOM content to avoid bloated responses
    delete results.domContent;
    
    // Save to DB only if user is logged in
    // Save to DB only if user is logged in
    let reportId = null;
    if (req.user) {
      const report = new ScanReport({
        scanType: 'url',
        target: url,
        userId: req.user.userId,
        source: source,
        accessibilityScore: results.score,
        accessibilityGrade: getGrade(results.score),
        totalIssues: results.totalIssues,
        pagesScanned: results.pagesScanned,
        scanDuration: results.duration,
        totalElementsAnalyzed: results.totalElementsAnalyzed,
        categorizedIssues: results.categorizedIssues,
        categoryScores: results.categoryScores,
        insights: results.insights,
        issues: results.issues,
        remediation: remediation,
        journeyGraph: results.journeyGraph,
        lighthouse: results.lighthouse,
        lighthouseRemediation: lighthouseRemediation,
        keyboardData: keyboardData
      });
      await report.save();
      reportId = report._id;
    }
    
    // Attach DB ID (if saved) and Keyboard Data to response
    res.json({ ...results, remediation, lighthouseRemediation, keyboardData, _id: reportId });
  } catch (error) {
    console.error('Analysis endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

// AI Model Analyze Route (Bypasses Axe Core)
router.post('/analyze-ai', optionalAuth, async (req, res) => {
  const { url, domContent: providedDom, source = 'web' } = req.body;

  if (!url && !providedDom) {
    return res.status(400).json({ error: 'URL is required.' });
  }

  try {
    if (url) new URL(url);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid URL format.' });
  }

  let browser = null;
  let domContent = providedDom;
  let axeFindings = null;
  
  try {
    if (!domContent) {
      browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox', '--disable-setuid-sandbox'] });
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      domContent = await page.content();
      await browser.close();
      browser = null;

      // If we have a URL, we can run Axe Core for findings
      console.log('Running Axe Core pass for AI feature extraction...');
      try {
        const axeResults = await analyzeAccessibility(url, false);
        axeFindings = axeResults.issues;
      } catch (e) {
        console.warn('Failed to extract Axe findings for AI context, continuing without them:', e);
      }
    }

    const startTime = Date.now();
    
    // Extract features from DOM
    console.log('Extracting accessibility features from DOM...');
    const domFeatures = extractFeaturesFromDom(domContent);
    const keyboardData = analyzeKeyboardAccessibility(domContent);
    
    // Construct the structured summary
    const structuredSummary = {
      axeCoreFindings: axeFindings,
      keyboardData: keyboardData,
      domStructure: domFeatures
    };

    console.log('Running Qwen Analysis via Ollama...');
    const aiData = await runQwenAnalysis(structuredSummary);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2) + 's';

    let reportId = null;
    if (req.user) {
      const report = new ScanReport({
        engineType: 'ai',
        scanType: 'url',
        target: url || 'Extension Active Tab',
        userId: req.user.userId,
        source: source,
        accessibilityScore: aiData.aiScore,
        accessibilityGrade: getGrade(aiData.aiScore),
        totalIssues: aiData.intelligentRisks.length,
        pagesScanned: 1,
        scanDuration: duration,
        aiData: aiData
      });
      await report.save();
      reportId = report._id;
    }

    res.json({ aiData, duration, _id: reportId });
  } catch (error) {
    console.error('AI Analysis endpoint error:', error);
    if (browser) await browser.close();
    res.status(500).json({ error: error.message });
  }
});

// Analyze Image Route
router.post('/analyze-image', optionalAuth, upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Image file is required.' });
  }

  try {
    const results = await analyzeImageVisuals(req.file.path);
    
    // Generate AI Remediation
    const remediation = await generateRemediationEngine(results.issues);
    
    // Save to DB only if user is logged in
    let reportId = null;
    if (req.user) {
      const report = new ScanReport({
        scanType: 'image',
        target: req.file.originalname,
        userId: req.user.userId,
        accessibilityScore: results.score,
        accessibilityGrade: getGrade(results.score),
        totalIssues: results.totalIssues,
        pagesScanned: results.pagesScanned,
        scanDuration: results.duration,
        totalElementsAnalyzed: results.totalElementsAnalyzed,
        categorizedIssues: results.categorizedIssues,
        categoryScores: results.categoryScores,
        insights: results.insights,
        issues: results.issues,
        remediation: remediation
      });
      await report.save();
      reportId = report._id;
    }
    
    res.json({ ...results, remediation, _id: reportId });
  } catch (error) {
    console.error('Image analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- NEW DB-DRIVEN ENDPOINTS ---

// Get all reports
router.get('/reports', requireAuth, async (req, res) => {
  try {
    const reports = await ScanReport.find({ userId: req.user.userId }).sort({ createdAt: -1 });
    res.json(reports);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single report
router.get('/reports/:id', requireAuth, async (req, res) => {
  try {
    const report = await ScanReport.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!report) return res.status(404).json({ error: 'Report not found' });
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete report
router.delete('/reports/:id', requireAuth, async (req, res) => {
  try {
    await ScanReport.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
    res.json({ message: 'Report deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Download PDF Report
router.get('/reports/:id/download', requireAuth, async (req, res) => {
  try {
    const report = await ScanReport.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!report) return res.status(404).json({ error: 'Report not found' });
    
    const pdfBuffer = await generateReportPdf(report);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="AccessiGen-Report-${report._id}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('PDF Generation Error:', error);
    res.status(500).json({ error: 'Failed to generate PDF report.' });
  }
});

// Get dashboard stats
router.get('/dashboard/stats', requireAuth, async (req, res) => {
  try {
    const totalScans = await ScanReport.countDocuments({ userId: req.user.userId });
    if (totalScans === 0) {
      return res.json({ totalScans: 0, averageScore: 0, recentScans: [], trends: [] });
    }

    const reports = await ScanReport.find({ userId: req.user.userId }).sort({ createdAt: -1 });
    
    const avgScore = reports.reduce((acc, r) => acc + r.accessibilityScore, 0) / totalScans;
    let validLhCount = 0;
    const lhSums = reports.reduce((acc, r) => {
      if (r.lighthouse && r.lighthouse.performance !== undefined) {
        validLhCount++;
        acc.performance += r.lighthouse.performance;
        acc.seo += r.lighthouse.seo;
        acc.bestPractices += r.lighthouse.bestPractices;
      }
      return acc;
    }, { performance: 0, seo: 0, bestPractices: 0 });
    
    const averagePerformance = validLhCount > 0 ? lhSums.performance / validLhCount : 0;
    const averageSeo = validLhCount > 0 ? lhSums.seo / validLhCount : 0;
    const averageBestPractices = validLhCount > 0 ? lhSums.bestPractices / validLhCount : 0;

    const recentScans = reports.slice(0, 5);
    
    // Group trends by day (last 7 days logic simplified)
    const trends = reports.slice(0, 7).reverse().map(r => ({
      name: new Date(r.createdAt).toLocaleDateString('en-US', { weekday: 'short' }),
      score: r.accessibilityScore,
      issues: r.totalIssues
    }));

    res.json({
      totalScans,
      averageScore: Math.round(avgScore),
      averagePerformance: Math.round(averagePerformance),
      averageSeo: Math.round(averageSeo),
      averageBestPractices: Math.round(averageBestPractices),
      recentScans,
      trends
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Report Route
router.get('/report', (req, res) => {
  res.json({ message: 'Report route works' });
});

// AI Suggestions Route
router.post('/ai-suggestions', (req, res) => {
  res.json({ message: 'AI Suggestions route works' });
});

// Simulations Structure Route
router.post('/simulations/structure', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });
  
  try {
    const structure = await extractAccessibilityStructure(url);
    res.json(structure);
  } catch (error) {
    console.error('Structure extraction error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Screenshot Simulation Route
router.post('/simulations/screenshot', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  let browser = null;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    // Set a standard desktop viewport
    await page.setViewport({ width: 1280, height: 800 });
    
    // Navigate and wait for network idle to ensure dynamic content loads
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Capture full page screenshot
    const screenshotBuffer = await page.screenshot({ fullPage: true, encoding: 'base64' });
    
    res.json({ screenshotBase64: screenshotBuffer });
  } catch (error) {
    console.error('Screenshot capture error:', error);
    res.status(500).json({ error: 'Failed to capture screenshot' });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});



// Test Route (Required)
router.get('/test', (req, res) => {
  res.json({ message: 'Backend connected successfully' });
});

export default router;
