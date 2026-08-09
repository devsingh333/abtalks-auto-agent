import React, { useState, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import {
  Bot,
  Activity,
  FileText,
  Play,
  Pause,
  Zap,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Search,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  Cpu,
  Layers,
  AlertTriangle,
  Database,
  X,
  ChevronDown,
  ChevronUp,
  Info,
  HelpCircle,
  BookOpen,
  Compass,
  Copy,
  Check,
  UserCheck,
  Plus,
  ListOrdered,
  Calendar,
  Code,
  Terminal,
} from 'lucide-react';

interface AgentStats {
  totalTopicsDiscovered: number;
  topicsPending: number;
  topicsSelected: number;
  topicsRejected: number;
  topicsPublished: number;
  totalPosts: number;
  postsToday: number;
}

interface PersonaConfig {
  name: string;
  role?: string;
  domain: string;
  identity: string;
  interests: string[];
  avoid?: string[];
  editorialPrinciples?: string[];
  voice?: {
    tone: string;
    length: string;
    style: string;
    stance?: string;
  };
}

interface Agent {
  id: string;
  name: string;
  domain: string;
  status: 'active' | 'paused';
  createdAt: string;
  personaConfig?: string;
  stats: AgentStats;
}

interface AgentDeepDetails {
  agent: {
    id: string;
    name: string;
    domain: string;
    status: 'active' | 'paused';
    createdAt: string;
    persona: PersonaConfig;
  };
  nextUpTopic?: {
    id: string;
    title: string;
    score: number | null;
    canonicalUrl: string;
    createdAt: string;
  } | null;
  pendingQueue: Array<{
    id: string;
    title: string;
    status: string;
    score: number | null;
    canonicalUrl: string;
    createdAt: string;
  }>;
  recentPosts: Array<{
    id: string;
    title: string;
    text: string;
    rationale: string;
    createdAt: string;
  }>;
  workerSchedule: {
    intervalMinutes: number;
    status: string;
  };
}

interface SystemStats {
  totalAgents: number;
  totalPosts: number;
  totalTopics: number;
  postsToday: number;
}

interface ActivityItem {
  type: 'post_published' | 'topic_selected' | 'topic_rejected';
  agentId: string;
  agentName: string;
  title: string;
  score?: number;
  reason?: string;
  timestamp: string;
}

interface PostItem {
  id: string;
  agentId: string;
  agentName: string;
  agentDomain: string;
  text: string;
  rationale: string;
  topicTitle: string;
  sources: string[];
  createdAt: string;
}

interface AiLogItem {
  id: string;
  timestamp: string;
  model: string;
  provider: string;
  purpose: string;
  promptTokensEst: number;
  completionTokensEst: number;
  latencyMs: number;
  status: 'success' | 'fallback' | 'error';
  agentId?: string;
  promptSnippet: string;
  responseSnippet: string;
  fullPrompt?: string;
  fullResponse?: string;
}

interface AiStats {
  totalCalls: number;
  successCalls: number;
  failedCalls: number;
  avgLatencyMs: number;
  totalTokensEst: number;
  providerBreakdown: Record<string, number>;
}

interface OverviewData {
  agents: Agent[];
  systemStats: SystemStats;
}

interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error';
}

/** Unified Brand Logo Mark Component */
function OrbixLogo({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-white/[0.1] flex items-center justify-center p-1.5 shadow-md shadow-indigo-950/50 shrink-0">
      <svg viewBox="0 0 24 24" fill="none" className={`${className} stroke-current stroke-[2]`}>
        <circle cx="12" cy="12" r="9" className="text-indigo-500 opacity-50" />
        <circle cx="12" cy="12" r="4" fill="currentColor" className="text-emerald-400" />
        <path d="M12 3v3M12 18v3M3 12h3M18 12h3" strokeLinecap="round" className="text-indigo-400" />
      </svg>
    </div>
  );
}

export default function App() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [mobileSearchOpen, setMobileSearchOpen] = useState<boolean>(false);
  const [showGuide, setShowGuide] = useState<boolean>(false);
  const [showControlsHelp, setShowControlsHelp] = useState<boolean>(false);
  const [showNewPersonaModal, setShowNewPersonaModal] = useState<boolean>(false);
  const [showAiLogsModal, setShowAiLogsModal] = useState<boolean>(false);
  const [aiLogs, setAiLogs] = useState<AiLogItem[]>([]);
  const [aiStats, setAiStats] = useState<AiStats | null>(null);
  const [expandedAiLogId, setExpandedAiLogId] = useState<string | null>(null);
  const [copiedAgentId, setCopiedAgentId] = useState<string | null>(null);
  const [expandedReasonIdx, setExpandedReasonIdx] = useState<number | null>(null);
  const [selectedPostDetails, setSelectedPostDetails] = useState<PostItem | null>(null);
  const [deepAgentDetails, setDeepAgentDetails] = useState<AgentDeepDetails | null>(null);
  const [loadingAgentDetails, setLoadingAgentDetails] = useState<boolean>(false);
  const [activityFilter, setActivityFilter] = useState<'all' | 'topic_selected' | 'topic_rejected'>('all');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  const addToast = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const fetchAiLogs = async () => {
    try {
      const res = await fetch('/api/monitor/ai-logs?limit=50');
      if (res.ok) {
        const data = await res.json();
        setAiLogs(data.logs || []);
        setAiStats(data.stats || null);
      }
    } catch (err) {
      console.error('Failed to fetch AI telemetry logs', err);
    }
  };

  const fetchData = async () => {
    try {
      setError(null);
      const [overviewRes, activityRes, postsRes] = await Promise.all([
        fetch('/api/monitor/overview'),
        fetch('/api/monitor/activity?limit=40'),
        fetch('/api/monitor/posts?limit=15'),
      ]);

      if (!overviewRes.ok || !activityRes.ok || !postsRes.ok) {
        throw new Error('Failed to fetch monitor data from backend');
      }

      const overviewData = await overviewRes.json();
      const activityData = await activityRes.json();
      const postsData = await postsRes.json();

      setOverview(overviewData);
      setActivity(activityData.activity || []);
      setPosts(postsData.posts || []);
      setLastUpdated(new Date());
      await fetchAiLogs();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Connection lost to server');
    } finally {
      setLoading(false);
    }
  };

  const fetchAgentDeepDetails = async (agentId: string) => {
    setLoadingAgentDetails(true);
    try {
      const res = await fetch(`/api/monitor/agent/${agentId}/details`);
      if (!res.ok) throw new Error('Failed to fetch agent details');
      const data = await res.json();
      setDeepAgentDetails(data);
    } catch (err: any) {
      addToast(err.message || 'Failed to load agent post queue', 'error');
    } finally {
      setLoadingAgentDetails(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleManualRefresh = () => {
    setLoading(true);
    fetchData();
    addToast('Dashboard data refreshed', 'info');
  };

  const handleAgentAction = async (agentId: string, action: 'pause' | 'resume' | 'trigger' | 'delete') => {
    const key = `${agentId}-${action}`;
    setActionLoading((prev) => ({ ...prev, [key]: true }));

    try {
      let endpoint = `/api/monitor/agent/${agentId}/${action}`;
      let method = 'POST';
      if (action === 'delete') {
        endpoint = `/api/monitor/agent/${agentId}`;
        method = 'DELETE';
      }

      const res = await fetch(endpoint, { method });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Action ${action} failed`);
      }

      if (action === 'pause') {
        addToast('Agent worker loop paused', 'info');
      } else if (action === 'resume') {
        addToast('Agent worker loop resumed', 'success');
      } else if (action === 'trigger') {
        addToast('Immediate cycle triggered for agent', 'success');
      } else if (action === 'delete') {
        addToast('Agent deleted and memory purged', 'info');
        if (deepAgentDetails?.agent.id === agentId) setDeepAgentDetails(null);
      }

      await fetchData();
      if (deepAgentDetails?.agent.id === agentId && action !== 'delete') {
        await fetchAgentDeepDetails(agentId);
      }
    } catch (err: any) {
      addToast(err.message || `Failed to execute ${action}`, 'error');
    } finally {
      setActionLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleInitPresetAgent = async (presetKey: string) => {
    const key = 'initPreset';
    setActionLoading((prev) => ({ ...prev, [key]: true }));
    try {
      const res = await fetch('/api/agent/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presetKey }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to initialize agent preset');
      }

      const data = await res.json();
      addToast('Agent initialized successfully', 'success');
      setShowNewPersonaModal(false);
      await fetchData();
      if (data.agentId) {
        await fetchAgentDeepDetails(data.agentId);
      }
    } catch (err: any) {
      addToast(err.message || 'Failed to initialize preset agent', 'error');
    } finally {
      setActionLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleCopyAgentId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedAgentId(id);
    addToast('Agent ID copied to clipboard', 'info');
    setTimeout(() => setCopiedAgentId(null), 2000);
  };

  const filteredActivity = useMemo(() => {
    return activity.filter((item) => {
      const matchesFilter = activityFilter === 'all' || item.type === activityFilter;
      const matchesSearch =
        !searchQuery ||
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.agentName.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [activity, activityFilter, searchQuery]);

  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      return (
        !searchQuery ||
        post.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.agentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.topicTitle.toLowerCase().includes(searchQuery.toLowerCase())
      );
    });
  }, [posts, searchQuery]);

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-200 selection:bg-zinc-800 font-sans antialiased">
      {/* Toast Notifications */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto px-4 py-3 rounded-lg text-xs font-medium bg-zinc-900/90 border border-white/[0.1] shadow-2xl backdrop-blur-md text-zinc-100 flex items-center justify-between"
          >
            <span>{toast.message}</span>
          </div>
        ))}
      </div>

      {/* Header Bar */}
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#09090b]/85 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <OrbixLogo />
            <div className="flex items-center gap-3">
              <h1 className="font-semibold text-sm sm:text-base tracking-tight text-zinc-100">
                Orbix Agent
              </h1>
              <span className="hidden sm:inline-flex text-xs text-zinc-500 font-mono">
                Nemotron 550B
              </span>
              <span className="hidden md:inline-flex items-center gap-1.5 text-xs text-zinc-400 font-mono">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Live Sync • 5s
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* AI Live Usage Logs Button */}
            <button
              onClick={() => {
                fetchAiLogs();
                setShowAiLogsModal(true);
              }}
              className="px-3 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 text-xs font-medium transition-all flex items-center gap-1.5"
            >
              <Cpu className="w-3.5 h-3.5 text-purple-400" />
              <span className="hidden sm:inline">AI Live Logs</span>
              {aiStats && aiStats.totalCalls > 0 && (
                <span className="px-1.5 py-0.2 rounded bg-purple-500/30 text-[10px] text-purple-200 font-mono">
                  {aiStats.totalCalls}
                </span>
              )}
            </button>

            {/* New Persona Agent Button */}
            <button
              onClick={() => setShowNewPersonaModal(true)}
              className="px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 text-xs font-medium transition-all flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline">Launch Persona</span>
            </button>

            {/* Guide Toggle Button */}
            <button
              onClick={() => setShowGuide(!showGuide)}
              className="px-3 py-1.5 rounded-lg bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 text-xs font-medium transition-all flex items-center gap-1.5"
            >
              <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline">Platform Guide</span>
            </button>

            {/* Desktop Search Bar */}
            <div className="hidden sm:relative sm:block">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Search topics, agents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-zinc-900/60 border border-white/[0.08] rounded-lg pl-9 pr-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600 transition-colors w-48 lg:w-64 placeholder:text-zinc-600"
              />
            </div>

            {/* Mobile Search Button */}
            <button
              onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
              className="sm:hidden p-2 rounded-lg bg-zinc-900 border border-white/[0.06] text-zinc-400"
            >
              {mobileSearchOpen ? <X className="w-4 h-4" /> : <Search className="w-4 h-4" />}
            </button>

            {/* Refresh Button */}
            <button
              onClick={handleManualRefresh}
              className="p-2 rounded-lg bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors shrink-0"
              title="Refresh Dashboard Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-zinc-200' : ''}`} />
            </button>
          </div>
        </div>

        {/* Mobile Search Drawer */}
        {mobileSearchOpen && (
          <div className="sm:hidden px-4 py-3 border-t border-white/[0.06] bg-zinc-900">
            <input
              type="text"
              placeholder="Search topics, agents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-950 border border-white/[0.1] rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none placeholder:text-zinc-600"
              autoFocus
            />
          </div>
        )}
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {/* Interactive Platform Guide Modal/Banner */}
        {showGuide && (
          <div className="p-5 sm:p-6 rounded-xl border border-indigo-500/20 bg-zinc-900/90 space-y-4 text-xs animate-fade-in backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-indigo-400" />
                <h3 className="font-semibold text-sm text-zinc-100">Orbix Autonomous Architecture Guide & Pipeline Labels</h3>
              </div>
              <button onClick={() => setShowGuide(false)} className="text-zinc-500 hover:text-zinc-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-zinc-300">
              <div className="p-3.5 rounded-lg bg-zinc-950/60 space-y-1.5">
                <div className="font-semibold text-zinc-100 flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5 text-indigo-400" />
                  <span>1. Discovery Plan & Search Router</span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Generates domain-tailored search intents and routes queries to Google News RSS and official sources, maximizing candidate recall without spam timeouts.
                </p>
              </div>

              <div className="p-3.5 rounded-lg bg-zinc-950/60 space-y-1.5">
                <div className="font-semibold text-zinc-100 flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-purple-400" />
                  <span>2. Hard Entity Gate & Breeth Memory</span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Uses an Entity Graph to verify sub-entity mentions, and queries Breeth Memory for 100% semantic novelty checking and duplicate prevention.
                </p>
              </div>

              <div className="p-3.5 rounded-lg bg-zinc-950/60 space-y-1.5">
                <div className="font-semibold text-zinc-100 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>3. Editorial Judge & Calibration</span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Evaluates candidate stories against minimum hard requirements. If 0 candidates pass, an autonomous second-pass safeguard reviews top stories.
                </p>
              </div>
            </div>

            {/* Detailed Definitions of Pipeline Labels */}
            <div className="p-4 rounded-lg bg-zinc-950/80 space-y-2 font-mono text-[11px]">
              <span className="font-semibold text-zinc-200 block">Pipeline Status Label Definitions:</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2 text-[10px]">
                <div className="p-2 rounded bg-zinc-900">
                  <strong className="text-zinc-300 block">Discovered:</strong>
                  Raw story candidates ingested from search feeds.
                </div>
                <div className="p-2 rounded bg-zinc-900">
                  <strong className="text-zinc-400 block">Pending:</strong>
                  Awaiting Entity Gate & Editorial Judge scoring.
                </div>
                <div className="p-2 rounded bg-amber-500/10 text-amber-300">
                  <strong className="text-amber-400 block">Selected:</strong>
                  Passed all gates & approved by Editorial Judge • Score &ge; 6.0
                </div>
                <div className="p-2 rounded bg-emerald-500/10 text-emerald-300">
                  <strong className="text-emerald-400 block">Published:</strong>
                  Post generated in persona's technical voice & committed.
                </div>
                <div className="p-2 rounded bg-red-500/10 text-red-300">
                  <strong className="text-red-400 block">Rejected:</strong>
                  Filtered due to duplicate memory or low editorial score.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="p-4 rounded-xl bg-red-950/40 border border-red-900/60 flex items-center justify-between text-xs text-red-200">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={fetchData} className="underline text-red-300 font-medium">Retry</button>
          </div>
        )}

        {/* System Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          <div className="p-4 sm:p-5 rounded-xl border border-white/[0.06] bg-zinc-900/50 backdrop-blur-sm space-y-1">
            <div className="text-xs font-medium text-zinc-500">Active Fleet</div>
            <div className="text-2xl sm:text-3xl font-bold text-zinc-100 font-mono">
              {overview?.systemStats.totalAgents ?? 0}
            </div>
            <div className="text-[11px] text-zinc-500 font-mono">Recognizable Identities</div>
          </div>

          <div className="p-4 sm:p-5 rounded-xl border border-white/[0.06] bg-zinc-900/50 backdrop-blur-sm space-y-1">
            <div className="text-xs font-medium text-zinc-500">Total Published</div>
            <div className="text-2xl sm:text-3xl font-bold text-zinc-100 font-mono">
              {overview?.systemStats.totalPosts ?? 0}
            </div>
            <div className="text-[11px] text-emerald-400 font-medium">Editorial Approved</div>
          </div>

          <div className="p-4 sm:p-5 rounded-xl border border-white/[0.06] bg-zinc-900/50 backdrop-blur-sm space-y-1">
            <div className="text-xs font-medium text-zinc-500">Throughput Today</div>
            <div className="text-2xl sm:text-3xl font-bold text-zinc-100 font-mono">
              {overview?.systemStats.postsToday ?? 0}
            </div>
            <div className="text-[11px] text-zinc-500">24h Publication Rate</div>
          </div>

          <div className="p-4 sm:p-5 rounded-xl border border-white/[0.06] bg-zinc-900/50 backdrop-blur-sm space-y-1">
            <div className="text-xs font-medium text-zinc-500">Discovered Candidates</div>
            <div className="text-2xl sm:text-3xl font-bold text-zinc-100 font-mono">
              {overview?.systemStats.totalTopics ?? 0}
            </div>
            <div className="text-[11px] text-zinc-500">Ingested Stories</div>
          </div>
        </div>

        {/* 2-Column Responsive Dashboard Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
          {/* Left Column (2/3 width): Fleet & Outputs */}
          <div className="lg:col-span-2 space-y-6 sm:space-y-8">
            {/* Agent Fleet Operations */}
            <section className="space-y-4">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-zinc-200">
                  <Bot className="w-4 h-4 text-zinc-400" />
                  <span>Agent Fleet Operations</span>
                  <button
                    onClick={() => setShowControlsHelp(!showControlsHelp)}
                    className="text-zinc-500 hover:text-zinc-300 ml-1 transition-colors"
                    title="What do Pause & Trigger controls do?"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                  </button>
                </div>
                <span className="text-xs text-zinc-500 font-mono">{overview?.agents.length || 0} Active Agents</span>
              </div>

              {/* Explanatory Banner for Agent Controls */}
              {showControlsHelp && (
                <div className="p-3.5 rounded-lg border border-white/[0.08] bg-zinc-900/90 text-xs text-zinc-300 space-y-2 animate-fade-in">
                  <div className="font-semibold text-zinc-100 flex items-center justify-between">
                    <span>Agent Control Action Definitions:</span>
                    <button onClick={() => setShowControlsHelp(false)} className="text-zinc-500 hover:text-zinc-300">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <ul className="space-y-1.5 text-[11px] text-zinc-400 font-mono">
                    <li><strong className="text-amber-400">Pause / Resume:</strong> Suspends or restarts the 5-minute background worker loop for this specific agent.</li>
                    <li><strong className="text-indigo-400">Trigger Cycle:</strong> Manually executes an immediate Discovery • Entity Gate • Breeth Novelty • Editorial • Publishing cycle on-demand without waiting for the timer.</li>
                  </ul>
                </div>
              )}

              {!overview?.agents || overview.agents.length === 0 ? (
                <div className="p-6 rounded-xl border border-white/[0.06] bg-zinc-900/40 text-center space-y-3 text-xs text-zinc-500">
                  <p>No active agents configured in database.</p>
                  <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                    <button
                      onClick={() => handleInitPresetAgent('ai_security')}
                      disabled={actionLoading.initPreset}
                      className="px-3.5 py-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-800 text-zinc-200 text-xs transition-colors"
                    >
                      + Dr. Elena Vance • AI Security
                    </button>
                    <button
                      onClick={() => handleInitPresetAgent('ml_systems')}
                      disabled={actionLoading.initPreset}
                      className="px-3.5 py-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-800 text-zinc-200 text-xs transition-colors"
                    >
                      + Dr. Maya Lin • ML Systems
                    </button>
                  </div>
                </div>
              ) : (
                <div className="max-h-[540px] overflow-y-auto pr-1">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {overview.agents.map((agent) => {
                      const isPaused = agent.status === 'paused';
                      const stats = agent.stats || {};
                      const isCopied = copiedAgentId === agent.id;
                      let parsedPersona: PersonaConfig | null = null;
                      try {
                        if (agent.personaConfig) parsedPersona = JSON.parse(agent.personaConfig);
                      } catch (e) {}

                      return (
                        <div
                          key={agent.id}
                          className={`p-4 sm:p-5 rounded-xl border bg-zinc-900/60 backdrop-blur-md transition-all flex flex-col justify-between ${
                            isPaused ? 'opacity-60 border-white/[0.04]' : 'border-white/[0.06] hover:border-white/[0.14] hover:shadow-xl hover:shadow-indigo-950/20'
                          }`}
                        >
                          <div className="space-y-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className={`w-2 h-2 rounded-full shrink-0 ${isPaused ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                                  <h3 className="font-semibold text-xs sm:text-sm text-zinc-100 truncate">{agent.name}</h3>
                                </div>
                                <span className="text-xs text-zinc-400 font-mono block mt-0.5 truncate">
                                  {parsedPersona?.role || agent.domain}
                                </span>
                              </div>
                              <span className="text-[11px] font-mono text-zinc-400 shrink-0">
                                {agent.status}
                              </span>
                            </div>

                            {/* View & Copy Agent ID */}
                            <div className="p-2 rounded-lg bg-zinc-950/60 flex items-center justify-between text-[11px] font-mono">
                              <span className="text-zinc-500 truncate" title={agent.id}>
                                ID: <span className="text-zinc-300">{agent.id.substring(0, 13)}...</span>
                              </span>
                              <button
                                onClick={() => handleCopyAgentId(agent.id)}
                                className="text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-1 shrink-0 ml-2"
                                title="Copy Full Agent ID"
                              >
                                {isCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                <span>{isCopied ? 'Copied' : 'Copy'}</span>
                              </button>
                            </div>

                            {/* Pipeline Metrics */}
                            <div className="space-y-1.5 text-xs">
                              <div className="flex justify-between text-zinc-400 font-mono text-[11px]">
                                <span>Pipeline Progress</span>
                                <span>{stats.topicsPublished || 0} Published</span>
                              </div>
                              <div className="w-full bg-zinc-950 rounded-full h-1.5 overflow-hidden flex">
                                <div style={{ width: `${Math.min(100, ((stats.topicsPending || 0) / 10) * 100)}%` }} className="bg-zinc-600 h-full" title="Pending" />
                                <div style={{ width: `${Math.min(100, ((stats.topicsSelected || 0) / 10) * 100)}%` }} className="bg-amber-500 h-full" title="Selected" />
                                <div style={{ width: `${Math.min(100, ((stats.topicsPublished || 0) / 10) * 100)}%` }} className="bg-emerald-500 h-full" title="Published" />
                              </div>
                              <div className="flex justify-between text-[11px] text-zinc-500 font-mono pt-1">
                                <span>Discovered: {stats.totalTopicsDiscovered || 0}</span>
                                <span>Pending: {stats.topicsPending || 0}</span>
                                <span>Approved: {stats.topicsSelected || 0}</span>
                              </div>
                            </div>

                            {/* Inspect Queue & Details Link */}
                            <div className="pt-2 border-t border-white/[0.04] flex items-center justify-between text-[11px] font-mono">
                              <button
                                onClick={() => fetchAgentDeepDetails(agent.id)}
                                className="text-indigo-400 hover:text-indigo-300 font-sans text-xs font-semibold flex items-center gap-1.5 transition-colors"
                              >
                                <ListOrdered className="w-3.5 h-3.5" />
                                <span>Inspect Agent & Post Queue • {stats.topicsPending || 0}</span>
                              </button>
                            </div>
                          </div>

                          {/* High Visibility Action Buttons */}
                          <div className="flex items-center justify-between pt-3 border-t border-white/[0.04] mt-3 text-xs">
                            <div className="flex items-center gap-2">
                              {isPaused ? (
                                <button
                                  onClick={() => handleAgentAction(agent.id, 'resume')}
                                  disabled={actionLoading[`${agent.id}-resume`]}
                                  className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 text-xs font-medium transition-all flex items-center gap-1.5 shadow-sm"
                                  title="Resume 5-min background worker loop"
                                >
                                  <Play className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400/20" />
                                  <span>Resume</span>
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleAgentAction(agent.id, 'pause')}
                                  disabled={actionLoading[`${agent.id}-pause`]}
                                  className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 text-xs font-medium transition-all flex items-center gap-1.5 shadow-sm"
                                  title="Pause background worker loop"
                                >
                                  <Pause className="w-3.5 h-3.5 text-amber-400 fill-amber-400/20" />
                                  <span>Pause</span>
                                </button>
                              )}

                              {/* High Visibility Yellow Trigger Button */}
                              <button
                                onClick={() => handleAgentAction(agent.id, 'trigger')}
                                disabled={actionLoading[`${agent.id}-trigger`]}
                                className="px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25 text-xs font-semibold transition-all flex items-center gap-1.5 shadow-md shadow-amber-950/40"
                                title="Run immediate discovery and publishing cycle now"
                              >
                                <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400/30" />
                                <span>Trigger Cycle</span>
                              </button>
                            </div>

                            <button
                              onClick={() => handleAgentAction(agent.id, 'delete')}
                              disabled={actionLoading[`${agent.id}-delete`]}
                              className="text-zinc-600 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-500/10"
                              title="Delete Agent permanently"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>

            {/* Published Output Stream Section */}
            <section className="space-y-4">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-zinc-200">
                  <FileText className="w-4 h-4 text-zinc-400" />
                  <span>Published Output Stream</span>
                </div>
                <span className="text-xs text-zinc-500 font-mono">{filteredPosts.length} Published Posts</span>
              </div>

              {filteredPosts.length === 0 ? (
                <div className="p-6 rounded-xl border border-white/[0.06] bg-zinc-900/40 text-center text-xs text-zinc-500">
                  No published posts yet. Candidate stories are evaluated continuously.
                </div>
              ) : (
                <div className="max-h-[520px] overflow-y-auto space-y-4 pr-1">
                  {filteredPosts.map((post) => (
                    <div key={post.id} className="p-4 sm:p-5 rounded-xl border border-white/[0.06] bg-zinc-900/60 backdrop-blur-md space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-zinc-100 font-semibold truncate">{post.agentName}</span>
                          <span className="text-xs text-zinc-500 font-mono truncate">• {post.agentDomain}</span>
                        </div>
                        <span className="text-xs text-zinc-500 font-mono shrink-0">{formatTime(post.createdAt)}</span>
                      </div>

                      <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed font-sans">{post.text}</p>

                      <div className="pt-3 border-t border-white/[0.04] flex flex-wrap items-center justify-between text-xs text-zinc-500 font-mono gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <button
                            onClick={() => setSelectedPostDetails(post)}
                            className="text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1 font-semibold"
                          >
                            <Info className="w-3.5 h-3.5" />
                            <span>View Details & Rationale</span>
                          </button>
                          <span>•</span>
                          <span className="text-emerald-400 shrink-0 font-medium">Breeth Verified</span>
                        </div>
                        {post.sources && post.sources.length > 0 && (
                          <a
                            href={post.sources[0]}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-1 shrink-0"
                          >
                            <span>Source</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Right Column (1/3 width): Editorial Stream */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
              <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-zinc-200">
                <Activity className="w-4 h-4 text-zinc-400" />
                <span>Editorial Stream</span>
              </div>
              <div className="flex items-center gap-2 text-xs font-mono text-zinc-500">
                <button
                  onClick={() => setActivityFilter('all')}
                  className={activityFilter === 'all' ? 'text-zinc-200 font-semibold' : 'hover:text-zinc-300'}
                >
                  All
                </button>
                <span>•</span>
                <button
                  onClick={() => setActivityFilter('topic_selected')}
                  className={activityFilter === 'topic_selected' ? 'text-zinc-200 font-semibold' : 'hover:text-zinc-300'}
                >
                  Approved
                </button>
              </div>
            </div>

            <div className="p-3 rounded-xl border border-white/[0.06] bg-zinc-900/40 backdrop-blur-md max-h-[620px] overflow-y-auto space-y-3 pr-1">
              {filteredActivity.length === 0 ? (
                <div className="p-6 text-center text-xs text-zinc-500">
                  No activity entries recorded yet.
                </div>
              ) : (
                filteredActivity.map((item, idx) => {
                  const isApproved = item.type === 'topic_selected' || item.type === 'post_published';
                  const isExpanded = expandedReasonIdx === idx;

                  return (
                    <div
                      key={idx}
                      className="p-3.5 rounded-lg border border-white/[0.04] bg-zinc-950/80 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500">
                        <span>{item.agentName}</span>
                        <span>{formatTime(item.timestamp)}</span>
                      </div>

                      <div className="flex items-start gap-2">
                        {isApproved ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
                        )}
                        <span className="text-zinc-200 font-medium leading-snug">{item.title}</span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] font-mono pt-2 text-zinc-500 border-t border-white/[0.03]">
                        <span>
                          {isApproved ? 'Breeth Check: Passed' : 'Breeth Check: Filtered'}
                        </span>
                        {item.score !== undefined && (
                          <span className={item.score >= 6.0 ? 'text-emerald-400 font-semibold' : 'text-zinc-500'}>
                            Score: {item.score.toFixed(1)}
                          </span>
                        )}
                      </div>

                      {/* Interactive Rejection Reason Toggle */}
                      {!isApproved && item.reason && (
                        <div className="pt-1.5 border-t border-white/[0.03]">
                          <button
                            onClick={() => setExpandedReasonIdx(isExpanded ? null : idx)}
                            className="text-[11px] text-zinc-400 hover:text-zinc-200 font-mono flex items-center gap-1 transition-colors"
                          >
                            <span>{isExpanded ? 'Hide Rejection Reason' : 'View Rejection Reason'}</span>
                            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>

                          {isExpanded && (
                            <div className="mt-2 p-2.5 rounded bg-zinc-950 border border-red-900/30 text-[11px] text-red-300 font-mono leading-relaxed animate-fade-in">
                              <span className="font-semibold text-red-400 block mb-0.5">Diagnostic Reason:</span>
                              {item.reason}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Modal: AI Live Usage Telemetry Logs */}
      {showAiLogsModal &&
        ReactDOM.createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm animate-fade-in"
            onClick={() => {}} // Backdrop clicks non-closing
          >
            <div
              className="bg-zinc-900 border border-white/[0.1] rounded-xl max-w-4xl w-full max-h-[85vh] sm:max-h-[90vh] flex flex-col overflow-hidden shadow-2xl relative"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 sm:p-5 border-b border-white/[0.08] shrink-0 bg-zinc-900/90">
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                  <Cpu className="w-4 h-4 text-purple-400" />
                  <span>AI Live Usage Stream & Telemetry Logs</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={fetchAiLogs}
                    className="px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-300 transition-colors flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Refresh Logs</span>
                  </button>
                  <button
                    onClick={() => setShowAiLogsModal(false)}
                    className="text-zinc-400 hover:text-white p-1 rounded-md bg-zinc-800/60 transition-colors"
                    title="Close Modal"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
                {/* AI Usage Statistics Bar */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                  <div className="p-3 rounded-lg bg-zinc-950 border border-white/[0.04]">
                    <span className="text-zinc-500 block text-[10px]">Total AI Calls</span>
                    <span className="text-lg font-bold text-purple-300">{aiStats?.totalCalls || 0}</span>
                  </div>
                  <div className="p-3 rounded-lg bg-zinc-950 border border-white/[0.04]">
                    <span className="text-zinc-500 block text-[10px]">Avg Latency</span>
                    <span className="text-lg font-bold text-emerald-400">{aiStats?.avgLatencyMs || 0} ms</span>
                  </div>
                  <div className="p-3 rounded-lg bg-zinc-950 border border-white/[0.04]">
                    <span className="text-zinc-500 block text-[10px]">Total Tokens Est.</span>
                    <span className="text-lg font-bold text-amber-300">~{aiStats?.totalTokensEst.toLocaleString() || 0}</span>
                  </div>
                  <div className="p-3 rounded-lg bg-zinc-950 border border-white/[0.04]">
                    <span className="text-zinc-500 block text-[10px]">Primary Model</span>
                    <span className="text-xs font-bold text-indigo-300 truncate block mt-1">Nemotron 550B</span>
                  </div>
                </div>

                {/* Live Log Stream Table / List */}
                <div className="space-y-3 text-xs">
                  {aiLogs.length === 0 ? (
                    <div className="p-8 text-center text-zinc-500 font-mono">
                      No AI telemetry logs recorded yet. Cycles will log real-time NVIDIA/Gemini API calls here.
                    </div>
                  ) : (
                    aiLogs.map((log) => {
                      const isExpanded = expandedAiLogId === log.id;
                      return (
                        <div key={log.id} className="p-3.5 rounded-lg bg-zinc-950 border border-white/[0.04] space-y-2 font-mono">
                          <div className="flex items-center justify-between text-[11px]">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-semibold text-[10px]">
                                {log.provider}
                              </span>
                              <span className="text-zinc-200 font-semibold">{log.purpose}</span>
                            </div>
                            <span className="text-zinc-500">{formatTime(log.timestamp)}</span>
                          </div>

                          <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-1 border-t border-white/[0.03]">
                            <span>Model: <strong className="text-zinc-200">{log.model}</strong></span>
                            <span>Latency: <strong className="text-emerald-400">{log.latencyMs}ms</strong></span>
                            <span>Tokens: <strong className="text-amber-400">~{log.promptTokensEst + log.completionTokensEst}</strong></span>
                            <span className={log.status === 'success' ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
                              {log.status.toUpperCase()}
                            </span>
                          </div>

                          {/* Expandable Prompt / Response Drawer */}
                          <div className="pt-1">
                            <button
                              onClick={() => setExpandedAiLogId(isExpanded ? null : log.id)}
                              className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
                            >
                              <Terminal className="w-3 h-3" />
                              <span>{isExpanded ? 'Hide Full Prompt & JSON Response' : 'Inspect Prompt & Response Payload'}</span>
                            </button>

                            {isExpanded && (
                              <div className="mt-2 space-y-3 text-[10px] animate-fade-in">
                                <div className="p-3 rounded-lg bg-zinc-900 border border-white/[0.08] text-zinc-300 space-y-1.5">
                                  <div className="flex items-center justify-between text-purple-400 font-semibold">
                                    <span>Full Prompt Payload ({ (log.fullPrompt || log.promptSnippet).length } characters):</span>
                                    <button
                                      onClick={() => {
                                        navigator.clipboard.writeText(log.fullPrompt || log.promptSnippet);
                                        addToast('Prompt copied to clipboard', 'info');
                                      }}
                                      className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors text-[10px]"
                                    >
                                      Copy Full Prompt
                                    </button>
                                  </div>
                                  <div className="max-h-72 overflow-y-auto font-mono text-[11px] leading-relaxed text-zinc-300 whitespace-pre-wrap select-all bg-zinc-950 p-3 rounded-md border border-white/[0.04]">
                                    {log.fullPrompt || log.promptSnippet}
                                  </div>
                                </div>

                                <div className="p-3 rounded-lg bg-zinc-900 border border-white/[0.08] text-zinc-300 space-y-1.5">
                                  <div className="flex items-center justify-between text-emerald-400 font-semibold">
                                    <span>AI Output Response JSON:</span>
                                    <button
                                      onClick={() => {
                                        navigator.clipboard.writeText(log.fullResponse || log.responseSnippet);
                                        addToast('Response copied to clipboard', 'info');
                                      }}
                                      className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors text-[10px]"
                                    >
                                      Copy Response JSON
                                    </button>
                                  </div>
                                  <div className="max-h-72 overflow-y-auto font-mono text-[11px] leading-relaxed text-emerald-300 whitespace-pre-wrap select-all bg-zinc-950 p-3 rounded-md border border-white/[0.04]">
                                    {log.fullResponse || log.responseSnippet}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Modal: Deep Agent Details, Post Queue & Schedule Inspector */}
      {deepAgentDetails &&
        ReactDOM.createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm animate-fade-in"
            onClick={() => {}} // Backdrop clicks non-closing
          >
            <div
              className="bg-zinc-900 border border-white/[0.1] rounded-xl max-w-3xl w-full max-h-[85vh] sm:max-h-[90vh] flex flex-col overflow-hidden shadow-2xl relative"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 sm:p-5 border-b border-white/[0.08] shrink-0 bg-zinc-900/90">
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                  <OrbixLogo className="w-4 h-4" />
                  <span>Agent Deep Inspection • {deepAgentDetails.agent.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-emerald-400 font-medium">{deepAgentDetails.workerSchedule.status}</span>
                  <button
                    onClick={() => setDeepAgentDetails(null)}
                    className="text-zinc-400 hover:text-white p-1 rounded-md bg-zinc-800/60 transition-colors"
                    title="Close Modal"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 text-xs">
                {/* Schedule & Timing Bar */}
                <div className="p-3.5 rounded-lg border border-white/[0.06] bg-zinc-950 flex flex-wrap items-center justify-between text-xs font-mono gap-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Autonomous Cycle Schedule: <strong className="text-zinc-100">Every 5 Minutes</strong></span>
                  </div>
                  {/* High Visibility Yellow Trigger Button */}
                  <button
                    onClick={() => handleAgentAction(deepAgentDetails.agent.id, 'trigger')}
                    className="px-3.5 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25 transition-all font-semibold flex items-center gap-1.5 shadow-md shadow-amber-950/40"
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400/30" />
                    <span>Run Immediate Cycle</span>
                  </button>
                </div>

                {/* Next Approved Topic to be Published Callout */}
                <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 space-y-2">
                  <div className="flex items-center justify-between font-mono text-xs text-emerald-400">
                    <span className="flex items-center gap-1.5 font-semibold">
                      <Sparkles className="w-4 h-4 text-emerald-400 animate-pulse" />
                      <span>NEXT APPROVED TOPIC TO BE PUBLISHED</span>
                    </span>
                    {deepAgentDetails.nextUpTopic?.score !== undefined && deepAgentDetails.nextUpTopic?.score !== null && (
                      <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-bold">
                        Score: {deepAgentDetails.nextUpTopic.score.toFixed(1)} of 10
                      </span>
                    )}
                  </div>

                  {deepAgentDetails.nextUpTopic ? (
                    <div className="space-y-1">
                      <h4 className="font-semibold text-xs sm:text-sm text-zinc-100">{deepAgentDetails.nextUpTopic.title}</h4>
                      <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 pt-1 border-t border-white/[0.04]">
                        <span>Status: Queued & Approved for Next Publication</span>
                        {deepAgentDetails.nextUpTopic.canonicalUrl && (
                          <a
                            href={deepAgentDetails.nextUpTopic.canonicalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                          >
                            <span>Publisher Source</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-400 font-mono">
                      No approved topics queued yet — next autonomous discovery cycle will evaluate candidate stories and select the top story for publication.
                    </p>
                  )}
                </div>

                {/* Persona Profile Summary */}
                <div className="p-3.5 rounded-lg bg-zinc-950/60 space-y-2">
                  <span className="text-[11px] font-mono text-zinc-500 block">Persona Identity & Role:</span>
                  <div className="font-semibold text-zinc-100">{deepAgentDetails.agent.persona.name} • <span className="text-indigo-400 font-mono text-xs">{deepAgentDetails.agent.persona.role || deepAgentDetails.agent.domain}</span></div>
                  <p className="text-zinc-300 leading-relaxed text-[11px]">{deepAgentDetails.agent.persona.identity}</p>
                </div>

                {/* Discovered Post Queue */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-white/[0.04] pb-2 font-semibold text-zinc-200">
                    <div className="flex items-center gap-2">
                      <ListOrdered className="w-4 h-4 text-indigo-400" />
                      <span>Discovered & Approved Topic Queue • {deepAgentDetails.pendingQueue.length} Stories</span>
                    </div>
                    <span className="text-[11px] font-mono text-zinc-500">Queued Stories</span>
                  </div>

                  {deepAgentDetails.pendingQueue.length === 0 ? (
                    <div className="p-4 rounded-lg bg-zinc-950 text-center text-[11px] text-zinc-500">
                      No pending topics currently in queue for this agent.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
                      {deepAgentDetails.pendingQueue.map((item) => (
                        <div key={item.id} className="p-3 rounded-lg bg-zinc-950 border border-white/[0.04] flex items-center justify-between gap-3 text-xs">
                          <div className="min-w-0">
                            <span className="text-zinc-200 font-medium block truncate">{item.title}</span>
                            <span className="text-[10px] text-zinc-500 font-mono">{formatTime(item.createdAt)}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 font-mono text-[11px]">
                            <span className={`px-2.5 py-0.5 rounded-md text-[10px] ${item.status === 'selected' ? 'bg-amber-500/20 text-amber-300 font-medium' : 'bg-zinc-800 text-zinc-400'}`}>
                              {item.status}
                            </span>
                            {item.score !== null && (
                              <span className="text-emerald-400 font-semibold">{item.score.toFixed(1)}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recent Published Posts by Agent */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-white/[0.04] pb-2 font-semibold text-zinc-200">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-emerald-400" />
                      <span>Published Output Stream • {deepAgentDetails.recentPosts.length} Posts</span>
                    </div>
                  </div>

                  {deepAgentDetails.recentPosts.length === 0 ? (
                    <div className="p-4 rounded-lg bg-zinc-950 text-center text-[11px] text-zinc-500">
                      No posts published by this agent yet.
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                      {deepAgentDetails.recentPosts.map((post) => (
                        <div key={post.id} className="p-3.5 rounded-lg bg-zinc-950 border border-white/[0.04] space-y-2 text-xs">
                          <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
                            <span className="truncate max-w-sm">{post.title}</span>
                            <span>{formatTime(post.createdAt)}</span>
                          </div>
                          <p className="text-zinc-300 leading-relaxed font-sans text-xs">{post.text}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Modal: Launch New Original Persona Agent */}
      {showNewPersonaModal &&
        ReactDOM.createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm animate-fade-in"
            onClick={() => {}} // Backdrop clicks non-closing
          >
            <div
              className="bg-zinc-900 border border-white/[0.1] rounded-xl max-w-2xl w-full max-h-[85vh] sm:max-h-[90vh] flex flex-col overflow-hidden shadow-2xl relative"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 sm:p-5 border-b border-white/[0.08] shrink-0 bg-zinc-900/90">
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                  <UserCheck className="w-4 h-4 text-indigo-400" />
                  <span>Launch Original AI & Technology Persona Agent</span>
                </div>
                <button
                  onClick={() => setShowNewPersonaModal(false)}
                  className="text-zinc-400 hover:text-white p-1 rounded-md bg-zinc-800/60 transition-colors"
                  title="Close Modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Select an original persona identity to initialize an autonomous research agent with a consistent writing voice, stable technical interests, and distinct editorial stance:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div
                    onClick={() => handleInitPresetAgent('ai_security')}
                    className="p-4 rounded-lg bg-zinc-950/60 hover:bg-indigo-500/10 cursor-pointer transition-all space-y-2 border border-white/[0.04]"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-zinc-100">Dr. Elena Vance</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 font-medium">AI Security</span>
                    </div>
                    <span className="text-xs text-zinc-400 font-mono block">Senior AI Security Researcher</span>
                    <p className="text-[11px] text-zinc-500 leading-normal">Focuses on LLM prompt injection, adversarial machine learning, model poisoning, and CVE disclosures.</p>
                  </div>

                  <div
                    onClick={() => handleInitPresetAgent('ml_systems')}
                    className="p-4 rounded-lg bg-zinc-950/60 hover:bg-emerald-500/10 cursor-pointer transition-all space-y-2 border border-white/[0.04]"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-zinc-100">Dr. Maya Lin</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-medium">ML Systems</span>
                    </div>
                    <span className="text-xs text-zinc-400 font-mono block">ML Systems Architect</span>
                    <p className="text-[11px] text-zinc-500 leading-normal">Focuses on open weights, vLLM quantization, PyTorch performance, and reproducible ML benchmarks.</p>
                  </div>

                  <div
                    onClick={() => handleInitPresetAgent('ai_infrastructure')}
                    className="p-4 rounded-lg bg-zinc-950/60 hover:bg-amber-500/10 cursor-pointer transition-all space-y-2 border border-white/[0.04]"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-zinc-100">Marcus Chen</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-medium">AI Infra</span>
                    </div>
                    <span className="text-xs text-zinc-400 font-mono block">AI Infrastructure Analyst</span>
                    <p className="text-[11px] text-zinc-500 leading-normal">Focuses on GPU clusters, interconnect topologies, distributed training compute scaling, and TCO.</p>
                  </div>

                  <div
                    onClick={() => handleInitPresetAgent('robotics_ai')}
                    className="p-4 rounded-lg bg-zinc-950/60 hover:bg-purple-500/10 cursor-pointer transition-all space-y-2 border border-white/[0.04]"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-zinc-100">Alex Rivera</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 font-medium">Robotics</span>
                    </div>
                    <span className="text-xs text-zinc-400 font-mono block">Robotics & Embodied AI Engineer</span>
                    <p className="text-[11px] text-zinc-500 leading-normal">Focuses on Vision-Language-Action (VLA) models, spatial intelligence, ROS 2, and physical robot deployments.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Modal: Published Post Rationale Details */}
      {selectedPostDetails &&
        ReactDOM.createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm animate-fade-in"
            onClick={() => {}} // Backdrop clicks non-closing
          >
            <div
              className="bg-zinc-900 border border-white/[0.1] rounded-xl max-w-xl w-full max-h-[85vh] sm:max-h-[90vh] flex flex-col overflow-hidden shadow-2xl relative"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 sm:p-5 border-b border-white/[0.08] shrink-0 bg-zinc-900/90">
                <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
                  <FileText className="w-4 h-4 text-indigo-400" />
                  <span>Post Selection Details & Rationale</span>
                </div>
                <button
                  onClick={() => setSelectedPostDetails(null)}
                  className="text-zinc-400 hover:text-white p-1 rounded-md bg-zinc-800/60 transition-colors"
                  title="Close Modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 text-xs">
                <div>
                  <span className="text-[11px] text-zinc-500 font-mono block">Agent & Domain:</span>
                  <span className="font-semibold text-zinc-200">{selectedPostDetails.agentName} • {selectedPostDetails.agentDomain}</span>
                </div>

                <div>
                  <span className="text-[11px] text-zinc-500 font-mono block">Original Topic:</span>
                  <span className="text-zinc-300 font-medium">{selectedPostDetails.topicTitle}</span>
                </div>

                <div>
                  <span className="text-[11px] text-zinc-500 font-mono block">Published Post Content:</span>
                  <p className="mt-1 p-3 rounded-lg bg-zinc-950 border border-white/[0.06] text-zinc-200 leading-relaxed font-sans">
                    {selectedPostDetails.text}
                  </p>
                </div>

                <div>
                  <span className="text-[11px] text-emerald-400 font-mono font-semibold block">Editorial Selection Rationale:</span>
                  <p className="mt-1 p-3 rounded-lg bg-emerald-950/30 border border-emerald-800/40 text-emerald-200 leading-relaxed font-mono">
                    {selectedPostDetails.rationale}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-white/[0.08] text-[11px] font-mono text-zinc-400">
                  <span>Breeth Memory: Novel Event Verified</span>
                  {selectedPostDetails.sources && selectedPostDetails.sources.length > 0 && (
                    <a
                      href={selectedPostDetails.sources[0]}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                    >
                      <span>Original Link</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
