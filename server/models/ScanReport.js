import mongoose from 'mongoose';

const scanReportSchema = new mongoose.Schema({
  scanType: {
    type: String,
    required: true,
    enum: ['url', 'image']
  },
  target: {
    type: String,
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // Null if anonymous scan
  },
  source: {
    type: String,
    enum: ['web', 'extension'],
    default: 'web'
  },
  engineType: {
    type: String,
    enum: ['axe', 'ai'],
    default: 'axe'
  },
  aiData: {
    confidence: Number,
    readabilityScore: Number,
    visualComplexity: String,
    cognitiveLoad: String,
    intelligentRisks: [{
      riskTitle: String,
      prediction: String,
      severity: String,
      remediation: String
    }]
  },
  keyboardData: {
    keyboardScore: Number,
    focusableElements: Number,
    skipLinkPresent: Boolean,
    focusIndicatorIssues: Number,
    tabComplexity: String,
    focusTrapRisk: String,
    landmarkNavigation: String,
    findings: [{
      title: String,
      severity: String,
      description: String,
      recommendation: String
    }]
  },
  accessibilityScore: {
    type: Number,
    required: true
  },
  accessibilityGrade: {
    type: String,
    required: true
  },
  totalIssues: {
    type: Number,
    required: true
  },
  pagesScanned: {
    type: Number,
    required: true,
    default: 1
  },
  scanDuration: {
    type: String,
    required: true
  },
  totalElementsAnalyzed: {
    type: Number
  },
  categorizedIssues: {
    critical: { type: Number, default: 0 },
    serious: { type: Number, default: 0 },
    moderate: { type: Number, default: 0 },
    minor: { type: Number, default: 0 }
  },
  categoryScores: {
    type: Map,
    of: Number
  },
  insights: [{
    type: { type: String }, // 'danger', 'warning', 'success'
    text: String
  }],
  issues: [{
    id: String,
    impact: String,
    category: String,
    description: String,
    help: String,
    helpUrl: String,
    tags: [String],
    affectedElements: [{
      page: String,
      html: String,
      target: [String]
    }]
  }],
  remediation: [{
    issueTitle: String,
    severity: String,
    selector: String,
    currentCode: String,
    fixedCode: String,
    explanation: String,
    affectedUsers: String,
    implementation: String,
    scoreImpact: String,
    domContext: {
      parentHTML: String,
      siblingHTML: String,
      computedStyles: mongoose.Schema.Types.Mixed
    }
  }],
  journeyGraph: {
    nodes: [{
      id: String,
      url: String,
      title: String,
      issuesCount: Number
    }],
    edges: [{
      source: String,
      target: String
    }]
  },
  lighthouse: {
    performance: Number,
    seo: Number,
    bestPractices: Number,
    accessibility: Number,
    metrics: {
      lcp: Number,
      fcp: Number,
      speedIndex: Number,
      tti: Number,
      tbt: Number,
      cls: Number
    },
    audits: {
      seo: [mongoose.Schema.Types.Mixed],
      bestPractices: [mongoose.Schema.Types.Mixed]
    }
  },
  lighthouseRemediation: [{
    title: String,
    description: String,
    category: String,
    scoreImpact: String,
    priority: String
  }]
}, {
  timestamps: true
});

const ScanReport = mongoose.model('ScanReport', scanReportSchema);

export default ScanReport;
