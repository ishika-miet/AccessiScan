import { useState, useEffect } from 'react';
import { Key, Loader2, Activity, BrainCircuit, MonitorPlay, LogOut, ShieldAlert, CheckCircle2, Zap, Settings, Type, MousePointer2, BookOpen, Eye } from 'lucide-react';

type Engine = 'axe' | 'ai';

export default function App() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState("");
  const [loading, setLoading] = useState(true);

  // Analysis State
  const [engine, setEngine] = useState<Engine>('axe');
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Active Adaptations State
  const [activeModes, setActiveModes] = useState<string[]>([]);

  useEffect(() => {
    chrome.storage.local.get(['accessigen_api_key'], (result) => {
      if (result.accessigen_api_key) {
        setApiKey(result.accessigen_api_key as string);
      }
      setLoading(false);
    });

    // Check currently active modes on the page
    const checkActiveModes = async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          chrome.tabs.sendMessage(tab.id, { action: 'GET_ACTIVE_MODES' }, (response) => {
            if (response && response.activeModes) {
              setActiveModes(response.activeModes);
            }
          });
        }
      } catch (err) {
        console.error(err);
      }
    };
    checkActiveModes();
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputKey.startsWith('acc_')) {
      setError("Invalid API Key format. Must start with acc_");
      return;
    }
    chrome.storage.local.set({ accessigen_api_key: inputKey }, () => {
      setApiKey(inputKey);
      setError(null);
    });
  };

  const handleLogout = () => {
    chrome.storage.local.remove(['accessigen_api_key'], () => {
      setApiKey(null);
      setResults(null);
    });
  };

  const runAnalysis = async () => {
    setAnalyzing(true);
    setError(null);

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url || !tab.id) {
        throw new Error("Cannot access active tab URL.");
      }

      const isAxe = engine === 'axe';
      const endpoint = isAxe ? '/api/analyze' : '/api/analyze-ai';
      
      let payload: any = { url: tab.url, source: 'extension' };

      // For AI engine, extract DOM directly to bypass auth walls
      if (!isAxe) {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'GET_DOM' });
        if (response && response.dom) {
          payload.domContent = response.dom;
        }
      }

      const res = await fetch(`http://localhost:5000${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");

      setResults(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to run analysis. Make sure the backend is running.");
    } finally {
      setAnalyzing(false);
    }
  };

  const toggleMode = async (mode: string) => {
    const isCurrentlyEnabled = activeModes.includes(mode);
    const willBeEnabled = !isCurrentlyEnabled;

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE_MODE', mode, enabled: willBeEnabled }, (response) => {
          if (response && response.activeModes) {
            setActiveModes(response.activeModes);
          }
        });
      }
    } catch (err) {
      console.error("Failed to toggle mode", err);
    }
  };

  const getRecommendations = () => {
    if (!results) return [];
    const recs = [];
    
    if (engine === 'axe' && results.issues) {
      const hasContrast = results.issues.some((i: any) => i.id === 'color-contrast');
      const hasFocus = results.issues.some((i: any) => i.id.includes('focus') || i.id.includes('tabindex'));
      
      if (hasContrast) recs.push('high-contrast');
      if (hasFocus) recs.push('keyboard');
      if (results.score < 70) recs.push('large-text'); // General suggestion for low scores
    }
    
    if (engine === 'ai' && results.aiData) {
      if (results.aiData.cognitiveLoad === 'High') {
        recs.push('reduced-motion');
        recs.push('reading-focus');
        recs.push('large-text');
      }
      if (results.aiData.visualComplexity === 'High') {
        recs.push('high-contrast');
        recs.push('reading-focus');
      }
    }
    
    return Array.from(new Set(recs));
  };

  const recommendations = getRecommendations();

  if (loading) {
    return <div className="h-full flex items-center justify-center bg-zinc-950"><Loader2 className="animate-spin text-blue-500" /></div>;
  }

  if (!apiKey) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center bg-zinc-950">
        <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mb-6 border border-blue-500/20">
          <Key size={32} className="text-blue-500" />
        </div>
        <h1 className="text-2xl font-bold mb-2 text-white">AccessiScan AI</h1>
        <p className="text-zinc-400 text-sm mb-8">Enter your Personal Access Token from the web dashboard to connect the extension.</p>
        
        <form onSubmit={handleLogin} className="w-full space-y-4">
          <input 
            type="password" 
            placeholder="acc_..." 
            value={inputKey}
            onChange={(e) => setInputKey(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-white"
            required
          />
          {error && <p className="text-red-400 text-xs text-left">{error}</p>}
          <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors">
            Connect Extension
          </button>
        </form>
      </div>
    );
  }

  const modes = [
    { id: 'high-contrast', label: 'High Contrast', icon: Zap, color: 'text-yellow-400', bg: 'bg-yellow-400/10', activeBorder: 'border-yellow-500/50', activeBg: 'bg-yellow-900/20', toggleBg: 'bg-yellow-500' },
    { id: 'large-text', label: 'Large Text', icon: Type, color: 'text-emerald-400', bg: 'bg-emerald-400/10', activeBorder: 'border-emerald-500/50', activeBg: 'bg-emerald-900/20', toggleBg: 'bg-emerald-500' },
    { id: 'keyboard', label: 'Keyboard Navigation', icon: MousePointer2, color: 'text-orange-400', bg: 'bg-orange-400/10', activeBorder: 'border-orange-500/50', activeBg: 'bg-orange-900/20', toggleBg: 'bg-orange-500' },
    { id: 'reduced-motion', label: 'Reduced Motion', icon: MonitorPlay, color: 'text-blue-400', bg: 'bg-blue-400/10', activeBorder: 'border-blue-500/50', activeBg: 'bg-blue-900/20', toggleBg: 'bg-blue-500' },
    { id: 'dyslexia', label: 'Dyslexia Friendly', icon: BookOpen, color: 'text-indigo-400', bg: 'bg-indigo-400/10', activeBorder: 'border-indigo-500/50', activeBg: 'bg-indigo-900/20', toggleBg: 'bg-indigo-500' },
    { id: 'reading-focus', label: 'Reading Focus', icon: Eye, color: 'text-rose-400', bg: 'bg-rose-400/10', activeBorder: 'border-rose-500/50', activeBg: 'bg-rose-900/20', toggleBg: 'bg-rose-500' }
  ];

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-white">
      {/* Header */}
      <header className="px-4 py-3 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50 sticky top-0 z-10 backdrop-blur-md">
        <h1 className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500 flex items-center gap-2">
          <ShieldAlert size={18} className="text-blue-500" /> Adaptation Center
        </h1>
        <button onClick={handleLogout} className="text-zinc-400 hover:text-white p-1" title="Disconnect">
          <LogOut size={16} />
        </button>
      </header>

      <main className="flex-1 p-4 overflow-y-auto custom-scrollbar space-y-6">
        
        {/* Engine Selection & Analysis Trigger */}
        <div className="space-y-3">
          <div className="bg-zinc-900 p-1 rounded-xl flex">
            <button 
              onClick={() => setEngine('axe')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-colors ${engine === 'axe' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500'}`}
            >
              <Activity size={14} /> Axe Core
            </button>
            <button 
              onClick={() => setEngine('ai')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-colors ${engine === 'ai' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500'}`}
            >
              <BrainCircuit size={14} className={engine === 'ai' ? 'text-purple-400' : ''} /> AI Model
            </button>
          </div>
          <button 
            onClick={runAnalysis}
            disabled={analyzing}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-bold py-3 rounded-xl transition-colors shadow-lg flex items-center justify-center gap-2"
          >
            {analyzing ? <Loader2 size={18} className="animate-spin" /> : <Activity size={18} />}
            {analyzing ? "Analyzing Page..." : "Run Analysis"}
          </button>
          {error && <p className="text-red-400 text-xs text-center">{error}</p>}
        </div>

        {/* 1. Current Accessibility Status */}
        {results && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Activity size={14} /> Current Status
            </h3>
            {engine === 'axe' ? (
              <div className="flex items-center justify-between">
                <div>
                  <div className={`text-3xl font-extrabold ${results.score >= 90 ? 'text-emerald-400' : results.score >= 70 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {results.score}
                  </div>
                  <div className="text-xs text-zinc-400 mt-1">Score</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-zinc-300">{results.totalIssues}</div>
                  <div className="text-xs text-zinc-400 mt-1">Violations</div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl font-extrabold text-purple-400">
                    {results.aiData?.aiScore || 'N/A'}
                  </div>
                  <div className="text-xs text-zinc-400 mt-1">AI Score</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-zinc-300">{results.aiData?.cognitiveLoad || 'N/A'}</div>
                  <div className="text-xs text-zinc-400 mt-1">Cognitive Load</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 2. Recommended Adaptations */}
        {results && recommendations.length > 0 && (
          <div className="bg-purple-900/10 border border-purple-500/20 rounded-xl p-4 animate-in fade-in">
            <h3 className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <BrainCircuit size={14} /> AI Recommendations
            </h3>
            <div className="space-y-2">
              {recommendations.map(recId => {
                const mode = modes.find(m => m.id === recId);
                if (!mode) return null;
                const isActive = activeModes.includes(recId);
                return (
                  <div key={recId} className="flex items-center justify-between bg-zinc-950/50 p-2 rounded-lg border border-purple-500/10">
                    <div className="flex items-center gap-2 text-sm text-zinc-300">
                      <mode.icon size={14} className={mode.color} /> {mode.label}
                    </div>
                    {!isActive ? (
                      <button onClick={() => toggleMode(recId)} className="text-xs font-bold text-purple-400 hover:text-purple-300 bg-purple-500/10 px-2 py-1 rounded">Enable</button>
                    ) : (
                      <span className="text-xs font-bold text-emerald-400 flex items-center gap-1"><CheckCircle2 size={12}/> Active</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 3. Accessibility Modes */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
            <Settings size={14} /> Adaptation Modes
          </h3>
          <div className="grid grid-cols-1 gap-2">
            {modes.map((mode) => {
              const isActive = activeModes.includes(mode.id);
              return (
                <button
                  key={mode.id}
                  onClick={() => toggleMode(mode.id)}
                  className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                    isActive 
                      ? `${mode.activeBorder} ${mode.activeBg}` 
                      : 'border-zinc-800 bg-zinc-900 hover:bg-zinc-800'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isActive ? mode.bg : 'bg-zinc-800'}`}>
                      <mode.icon size={16} className={isActive ? mode.color : 'text-zinc-500'} />
                    </div>
                    <span className={`text-sm font-medium ${isActive ? 'text-white' : 'text-zinc-400'}`}>
                      {mode.label}
                    </span>
                  </div>
                  
                  {/* Toggle Switch */}
                  <div className={`w-10 h-6 rounded-full p-1 transition-colors ${isActive ? mode.toggleBg : 'bg-zinc-700'}`}>
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${isActive ? 'translate-x-4' : 'translate-x-0'}`} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

      </main>
    </div>
  );
}
