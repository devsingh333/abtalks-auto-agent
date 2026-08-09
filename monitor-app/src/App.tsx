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

interface OverviewData {
  agents: Agent[];
  systemStats: SystemStats;
}

interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error';
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
  const [copiedAgentId, setCopiedAgentId] = useState<string | null>(null);
  const [expandedReasonIdx, setExpandedReasonIdx] = useState<number | null>(null);
  const [selectedPostDetails, setSelectedPostDetails] = useState<PostItem | null>(null);
  const [selectedAgentPersona, setSelectedAgentPersona] = useState<{ agentName: string; persona: PersonaConfig } | null>(null);
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
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Connection lost to server');
    } finally {
      setLoading(false);
    }
  };

  const handleManualRefresh = async () => {
    await fetchData();
    addToast('Dashboard data refreshed', 'success');
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleCopyAgentId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedAgentId(id);
    addToast(`Copied Agent ID to clipboard`, 'success');
    setTimeout(() => setCopiedAgentId(null), 2500);
  };

  const handleAgentAction = async (agentId: string, action: 'pause' | 'resume' | 'trigger' | 'delete') => {
    const key = `${agentId}-${action}`;
    setActionLoading((prev) => ({ ...prev, [key]: true }));

    try {
      const method = action === 'delete' ? 'DELETE' : 'POST';
      let url = `/api/monitor/agent/${agentId}`;
      if (action !== 'delete') url += `/${action}`;

      const res = await fetch(url, { method });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || `Action ${action} failed`);
      }

      const actionLabels = {
        pause: 'Agent background loop paused',
        resume: 'Agent background loop resumed',
        trigger: 'Immediate cycle triggered',
        delete: 'Agent deleted',
      };
      addToast(actionLabels[action], 'success');
      await fetchData();
    } catch (err: any) {
      addToast(`Error: ${err.message}`, 'error');
    } finally {
      setActionLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleInitPresetAgent = async (presetKey: string) => {
    setActionLoading((prev) => ({ ...prev, initPreset: true }));
    try {
      const res = await fetch('/api/agent/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presetKey }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to initialize agent');
      }

      const data = await res.json();
      addToast(`Initialized Persona Agent: ${data.agentId.substring(0, 8)}`, 'success');
      setShowNewPersonaModal(false);
      await fetchData();
    } catch (err: any) {
      addToast(`Error: ${err.message}`, 'error');
    } finally {
      setActionLoading((prev) => ({ ...prev, initPreset: false }));
    }
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
    <div className="min-h-screen bg-[#08080a] text-zinc-200 selection:bg-zinc-800">
      {/* Toast Notifications */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto px-4 py-3 rounded-lg text-xs font-medium bg-zinc-900 border border-white/[0.1] shadow-2xl text-zinc-100 flex items-center justify-between"
          >
            <span>{toast.message}</span>
          </div>
        ))}
      </div>

      {/* Header Bar */}
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#08080a]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 shrink-0">
            {/* Custom Orbix Logo */}
            <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-white/[0.08] flex items-center justify-center p-1.5 shadow-inner">
              <svg viewBox="0 0 24 24" fill="none" className="w-full h-full text-indigo-400 stroke-current stroke-[2]">
                <circle cx="12" cy="12" r="9" className="opacity-40" />
                <circle cx="12" cy="12" r="4" fill="currentColor" className="text-emerald-400" />
                <path d="M12 3v3M12 18v3M3 12h3M18 12h3" strokeLinecap="round" />
              </svg>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="font-semibold text-sm sm:text-base tracking-tight text-zinc-100">
                Orbix Agent
              </h1>
              <span className="hidden sm:inline-flex text-xs text-zinc-500 font-mono">
                Nemotron 550B
              </span>
              <span className="hidden md:inline-flex items-center gap-1.5 text-xs text-zinc-400 font-mono">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Live Sync (5s)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* New Persona Agent Button */}
            <button
              onClick={() => setShowNewPersonaModal(true)}
              className="px-3 py-1.5 rounded-lg bg-indigo-600/20 border border-indigo-500/30 hover:bg-indigo-600/30 text-indigo-200 text-xs font-medium transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline">Launch Persona</span>
            </button>

            {/* Guide Toggle Button */}
            <button
              onClick={() => setShowGuide(!showGuide)}
              className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-white/[0.08] hover:bg-zinc-800 text-zinc-300 hover:text-white text-xs font-medium transition-colors flex items-center gap-1.5"
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
                className="bg-zinc-900/80 border border-white/[0.08] rounded-lg pl-9 pr-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600 transition-colors w-48 lg:w-64 placeholder:text-zinc-600"
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
              className="p-2 rounded-lg bg-zinc-900 border border-white/[0.06] hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors shrink-0"
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
          <div className="p-5 sm:p-6 rounded-xl border border-indigo-500/20 bg-zinc-900/90 space-y-4 text-xs animate-fade-in">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-indigo-400" />
                <h3 className="font-semibold text-sm text-zinc-100">Orbix Autonomous Architecture Guide</h3>
              </div>
              <button onClick={() => setShowGuide(false)} className="text-zinc-500 hover:text-zinc-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-zinc-300">
              <div className="p-3.5 rounded-lg border border-white/[0.06] bg-white/[0.01] space-y-1.5">
                <div className="font-semibold text-zinc-100 flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5 text-indigo-400" />
                  <span>1. Discovery Plan & Search Router</span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Generates domain-tailored search intents and routes queries to Google News RSS and official sources, maximizing candidate recall without spam timeouts.
                </p>
              </div>

              <div className="p-3.5 rounded-lg border border-white/[0.06] bg-white/[0.01] space-y-1.5">
                <div className="font-semibold text-zinc-100 flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-purple-400" />
                  <span>2. Hard Entity Gate & Breeth Memory</span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Uses an Entity Graph to verify sub-entity mentions, and queries Breeth Memory for 100% semantic novelty checking and duplicate prevention.
                </p>
              </div>

              <div className="p-3.5 rounded-lg border border-white/[0.06] bg-white/[0.01] space-y-1.5">
                <div className="font-semibold text-zinc-100 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>3. Editorial Judge & Calibration</span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Evaluates candidate stories against minimum hard requirements. If 0 candidates pass, an autonomous second-pass safeguard reviews top stories.
                </p>
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
          <div className="p-4 sm:p-5 rounded-xl border border-white/[0.06] bg-white/[0.01] space-y-1">
            <div className="text-xs font-medium text-zinc-500">Active Fleet</div>
            <div className="text-2xl sm:text-3xl font-bold text-zinc-100 font-mono">
              {overview?.systemStats.totalAgents ?? 0}
            </div>
            <div className="text-[11px] text-zinc-500 font-mono">Recognizable Identities</div>
          </div>

          <div className="p-4 sm:p-5 rounded-xl border border-white/[0.06] bg-white/[0.01] space-y-1">
            <div className="text-xs font-medium text-zinc-500">Total Published</div>
            <div className="text-2xl sm:text-3xl font-bold text-zinc-100 font-mono">
              {overview?.systemStats.totalPosts ?? 0}
            </div>
            <div className="text-[11px] text-emerald-400 font-medium">Editorial Approved</div>
          </div>

          <div className="p-4 sm:p-5 rounded-xl border border-white/[0.06] bg-white/[0.01] space-y-1">
            <div className="text-xs font-medium text-zinc-500">Throughput Today</div>
            <div className="text-2xl sm:text-3xl font-bold text-zinc-100 font-mono">
              {overview?.systemStats.postsToday ?? 0}
            </div>
            <div className="text-[11px] text-zinc-500">24h Publication Rate</div>
          </div>

          <div className="p-4 sm:p-5 rounded-xl border border-white/[0.06] bg-white/[0.01] space-y-1">
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
                <span className="text-xs text-zinc-500 font-mono">{overview?.agents.length || 0} active</span>
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
                    <li><strong className="text-indigo-400">Trigger Cycle:</strong> Manually executes an immediate Discovery → Entity Gate → Breeth Novelty → Editorial → Publishing cycle on-demand without waiting for the timer.</li>
                  </ul>
                </div>
              )}

              {!overview?.agents || overview.agents.length === 0 ? (
                <div className="p-6 rounded-xl border border-white/[0.06] bg-white/[0.01] text-center space-y-3 text-xs text-zinc-500">
                  <p>No active agents configured in database.</p>
                  <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                    <button
                      onClick={() => handleInitPresetAgent('ai_security')}
                      disabled={actionLoading.initPreset}
                      className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-white/[0.08] hover:bg-zinc-800 text-zinc-200 text-xs transition-colors"
                    >
                      + Dr. Elena Vance (AI Security)
                    </button>
                    <button
                      onClick={() => handleInitPresetAgent('ml_systems')}
                      disabled={actionLoading.initPreset}
                      className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-white/[0.08] hover:bg-zinc-800 text-zinc-200 text-xs transition-colors"
                    >
                      + Dr. Maya Lin (ML Systems)
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
                          className={`p-4 sm:p-5 rounded-xl border bg-white/[0.01] transition-all flex flex-col justify-between ${
                            isPaused ? 'opacity-50 border-white/[0.04]' : 'border-white/[0.06] hover:border-white/[0.12]'
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
                            <div className="p-2 rounded bg-zinc-900/60 border border-white/[0.04] flex items-center justify-between text-[11px] font-mono">
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
                              <div className="w-full bg-zinc-900 rounded-full h-1.5 overflow-hidden flex">
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

                            {/* Consistent Persona & Breeth Role Integration */}
                            <div className="pt-2 border-t border-white/[0.04] flex items-center justify-between text-[11px] font-mono">
                              <span className="text-zinc-500 flex items-center gap-1.5 truncate">
                                <Database className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                                <span className="truncate">Breeth Novelty Checked</span>
                              </span>
                              {parsedPersona && (
                                <button
                                  onClick={() => setSelectedAgentPersona({ agentName: agent.name, persona: parsedPersona! })}
                                  className="text-indigo-400 hover:text-indigo-300 underline font-sans text-xs shrink-0"
                                >
                                  Persona Stance
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex items-center justify-between pt-3 border-t border-white/[0.04] mt-3 text-xs">
                            <div className="flex items-center gap-2">
                              {isPaused ? (
                                <button
                                  onClick={() => handleAgentAction(agent.id, 'resume')}
                                  disabled={actionLoading[`${agent.id}-resume`]}
                                  className="px-3 py-1.5 rounded-md bg-zinc-900 border border-white/[0.08] text-zinc-300 hover:text-white text-xs transition-colors flex items-center gap-1"
                                  title="Resume 5-min background worker loop"
                                >
                                  <Play className="w-3 h-3 text-emerald-400" />
                                  <span>Resume Loop</span>
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleAgentAction(agent.id, 'pause')}
                                  disabled={actionLoading[`${agent.id}-pause`]}
                                  className="px-3 py-1.5 rounded-md bg-zinc-900 border border-white/[0.08] text-zinc-400 hover:text-zinc-200 text-xs transition-colors flex items-center gap-1"
                                  title="Pause background worker loop"
                                >
                                  <Pause className="w-3 h-3 text-amber-400" />
                                  <span>Pause Loop</span>
                                </button>
                              )}

                              <button
                                onClick={() => handleAgentAction(agent.id, 'trigger')}
                                disabled={actionLoading[`${agent.id}-trigger`]}
                                className="px-3 py-1.5 rounded-md bg-zinc-900 border border-white/[0.08] text-zinc-300 hover:text-white text-xs transition-colors flex items-center gap-1"
                                title="Run immediate discovery and publishing cycle now"
                              >
                                <Zap className="w-3.5 h-3.5 text-amber-400" />
                                <span>Trigger Cycle</span>
                              </button>
                            </div>

                            <button
                              onClick={() => handleAgentAction(agent.id, 'delete')}
                              disabled={actionLoading[`${agent.id}-delete`]}
                              className="text-zinc-600 hover:text-red-400 transition-colors p-1"
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
                <span className="text-xs text-zinc-500 font-mono">{filteredPosts.length} posts</span>
              </div>

              {filteredPosts.length === 0 ? (
                <div className="p-6 rounded-xl border border-white/[0.06] text-center text-xs text-zinc-500">
                  No published posts yet. Candidate stories are evaluated continuously.
                </div>
              ) : (
                <div className="max-h-[520px] overflow-y-auto space-y-4 pr-1">
                  {filteredPosts.map((post) => (
                    <div key={post.id} className="p-4 sm:p-5 rounded-xl border border-white/[0.06] bg-white/[0.01] space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-zinc-100 font-semibold truncate">{post.agentName}</span>
                          <span className="text-xs text-zinc-500 font-mono truncate">{post.agentDomain}</span>
                        </div>
                        <span className="text-xs text-zinc-500 font-mono shrink-0">{formatTime(post.createdAt)}</span>
                      </div>

                      <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed font-sans">{post.text}</p>

                      <div className="pt-3 border-t border-white/[0.04] flex flex-wrap items-center justify-between text-xs text-zinc-500 font-mono gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <button
                            onClick={() => setSelectedPostDetails(post)}
                            className="text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1 font-semibold underline"
                          >
                            <Info className="w-3.5 h-3.5" />
                            <span>View Details & Rationale</span>
                          </button>
                          <span>•</span>
                          <span className="text-emerald-400 shrink-0">Breeth Verified</span>
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

            <div className="p-3 rounded-xl border border-white/[0.06] bg-white/[0.01] max-h-[620px] overflow-y-auto space-y-3 pr-1">
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
                      className="p-3.5 rounded-lg border border-white/[0.04] bg-zinc-900/60 space-y-2 text-xs"
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
                            <div className="mt-2 p-2.5 rounded bg-zinc-950/80 border border-red-900/30 text-[11px] text-red-300 font-mono leading-relaxed animate-fade-in">
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

      {/* Modal: Launch New Original Persona Agent */}
      {showNewPersonaModal &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
            <div className="bg-zinc-900 border border-white/[0.1] rounded-xl max-w-2xl w-full p-6 space-y-4 shadow-2xl relative">
              <button
                onClick={() => setShowNewPersonaModal(false)}
                className="absolute top-4 right-4 text-zinc-400 hover:text-white p-1 rounded-md bg-zinc-800/60 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100 border-b border-white/[0.08] pb-3">
                <UserCheck className="w-4 h-4 text-indigo-400" />
                <span>Launch Original AI & Technology Persona Agent</span>
              </div>

              <p className="text-xs text-zinc-400 leading-relaxed">
                Select an original persona identity to initialize an autonomous research agent with a consistent writing voice, stable technical interests, and distinct editorial stance:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div
                  onClick={() => handleInitPresetAgent('ai_security')}
                  className="p-4 rounded-lg border border-white/[0.08] bg-white/[0.02] hover:border-indigo-500/50 hover:bg-indigo-500/5 cursor-pointer transition-all space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-zinc-100">Dr. Elena Vance</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300">AI Security</span>
                  </div>
                  <span className="text-xs text-zinc-400 font-mono block">Senior AI Security Researcher</span>
                  <p className="text-[11px] text-zinc-500 leading-normal">Focuses on LLM prompt injection, adversarial machine learning, model poisoning, and CVE disclosures.</p>
                </div>

                <div
                  onClick={() => handleInitPresetAgent('ml_systems')}
                  className="p-4 rounded-lg border border-white/[0.08] bg-white/[0.02] hover:border-emerald-500/50 hover:bg-emerald-500/5 cursor-pointer transition-all space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-zinc-100">Dr. Maya Lin</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">ML Systems</span>
                  </div>
                  <span className="text-xs text-zinc-400 font-mono block">ML Systems Architect</span>
                  <p className="text-[11px] text-zinc-500 leading-normal">Focuses on open weights, vLLM quantization, PyTorch performance, and reproducible ML benchmarks.</p>
                </div>

                <div
                  onClick={() => handleInitPresetAgent('ai_infrastructure')}
                  className="p-4 rounded-lg border border-white/[0.08] bg-white/[0.02] hover:border-amber-500/50 hover:bg-amber-500/5 cursor-pointer transition-all space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-zinc-100">Marcus Chen</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">AI Infra</span>
                  </div>
                  <span className="text-xs text-zinc-400 font-mono block">AI Infrastructure Analyst</span>
                  <p className="text-[11px] text-zinc-500 leading-normal">Focuses on GPU clusters, interconnect topologies, distributed training compute scaling, and TCO.</p>
                </div>

                <div
                  onClick={() => handleInitPresetAgent('robotics_ai')}
                  className="p-4 rounded-lg border border-white/[0.08] bg-white/[0.02] hover:border-purple-500/50 hover:bg-purple-500/5 cursor-pointer transition-all space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-zinc-100">Alex Rivera</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300">Robotics</span>
                  </div>
                  <span className="text-xs text-zinc-400 font-mono block">Robotics & Embodied AI Engineer</span>
                  <p className="text-[11px] text-zinc-500 leading-normal">Focuses on Vision-Language-Action (VLA) models, spatial intelligence, ROS 2, and physical robot deployments.</p>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Modal: View Active Persona Profile & Stance */}
      {selectedAgentPersona &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
            <div className="bg-zinc-900 border border-white/[0.1] rounded-xl max-w-xl w-full p-6 space-y-4 shadow-2xl relative">
              <button
                onClick={() => setSelectedAgentPersona(null)}
                className="absolute top-4 right-4 text-zinc-400 hover:text-white p-1 rounded-md bg-zinc-800/60 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100 border-b border-white/[0.08] pb-3">
                <UserCheck className="w-4 h-4 text-indigo-400" />
                <span>Persona Profile & Editorial Stance</span>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-[11px] text-zinc-500 font-mono block">Persona Identity:</span>
                  <span className="font-semibold text-zinc-100 text-sm">{selectedAgentPersona.persona.name}</span>
                  {selectedAgentPersona.persona.role && (
                    <span className="text-xs text-indigo-400 font-mono block mt-0.5">{selectedAgentPersona.persona.role}</span>
                  )}
                  <p className="text-zinc-300 text-xs leading-relaxed mt-1">{selectedAgentPersona.persona.identity}</p>
                </div>

                <div>
                  <span className="text-[11px] text-zinc-500 font-mono block">Stable Technical Interests:</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {selectedAgentPersona.persona.interests.map((interest, idx) => (
                      <span key={idx} className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[11px] font-mono">
                        {interest}
                      </span>
                    ))}
                  </div>
                </div>

                {selectedAgentPersona.persona.editorialPrinciples && (
                  <div>
                    <span className="text-[11px] text-zinc-500 font-mono block">Distinct Editorial Principles:</span>
                    <ul className="list-disc list-inside text-zinc-300 space-y-1 mt-1 text-[11px]">
                      {selectedAgentPersona.persona.editorialPrinciples.map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {selectedAgentPersona.persona.voice && (
                  <div className="p-3 rounded bg-zinc-950 border border-white/[0.06] space-y-1 font-mono text-[11px]">
                    <span className="text-emerald-400 font-semibold block">Writing Style & Voice Guidelines:</span>
                    <div>Tone: <span className="text-zinc-300">{selectedAgentPersona.persona.voice.tone}</span></div>
                    <div>Style: <span className="text-zinc-300">{selectedAgentPersona.persona.voice.style}</span></div>
                    <div>Target Length: <span className="text-zinc-300">{selectedAgentPersona.persona.voice.length}</span></div>
                    {selectedAgentPersona.persona.voice.stance && (
                      <div>Editorial Stance: <span className="text-zinc-300">{selectedAgentPersona.persona.voice.stance}</span></div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Modal: Published Post Rationale Details */}
      {selectedPostDetails &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
            <div className="bg-zinc-900 border border-white/[0.1] rounded-xl max-w-xl w-full p-6 space-y-4 shadow-2xl relative">
              <button
                onClick={() => setSelectedPostDetails(null)}
                className="absolute top-4 right-4 text-zinc-400 hover:text-white p-1 rounded-md bg-zinc-800/60 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 border-b border-white/[0.08] pb-3">
                <FileText className="w-4 h-4 text-indigo-400" />
                <span>Post Selection Details & Rationale</span>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-[11px] text-zinc-500 font-mono block">Agent & Domain:</span>
                  <span className="font-semibold text-zinc-200">{selectedPostDetails.agentName} ({selectedPostDetails.agentDomain})</span>
                </div>

                <div>
                  <span className="text-[11px] text-zinc-500 font-mono block">Original Topic:</span>
                  <span className="text-zinc-300 font-medium">{selectedPostDetails.topicTitle}</span>
                </div>

                <div>
                  <span className="text-[11px] text-zinc-500 font-mono block">Published Post Content:</span>
                  <p className="mt-1 p-3 rounded bg-zinc-950 border border-white/[0.06] text-zinc-200 leading-relaxed font-sans">
                    {selectedPostDetails.text}
                  </p>
                </div>

                <div>
                  <span className="text-[11px] text-emerald-400 font-mono font-semibold block">Editorial Selection Rationale:</span>
                  <p className="mt-1 p-3 rounded bg-emerald-950/30 border border-emerald-800/40 text-emerald-200 leading-relaxed font-mono">
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
