import React, { useState, useEffect, useMemo } from 'react';
import {
  Bot,
  Activity,
  FileText,
  Compass,
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
  Sliders,
  ChevronRight,
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

interface Agent {
  id: string;
  name: string;
  domain: string;
  status: 'active' | 'paused';
  createdAt: string;
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

const AGENT_BADGE_COLORS = [
  { bg: 'bg-indigo-500/10', border: 'border-indigo-500/20', text: 'text-indigo-400', dot: 'bg-indigo-400' },
  { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400', dot: 'bg-amber-400' },
  { bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', text: 'text-cyan-400', dot: 'bg-cyan-400' },
];

export default function App() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activityFilter, setActivityFilter] = useState<'all' | 'post_published' | 'topic_selected' | 'topic_rejected'>('all');
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

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

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
        pause: 'Agent paused',
        resume: 'Agent resumed',
        trigger: 'Manual cycle triggered',
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

  const handleCreateSampleAgent = async (name: string, domain: string) => {
    setActionLoading((prev) => ({ ...prev, createSample: true }));
    try {
      const res = await fetch('/api/agent/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          persona: {
            name,
            domain,
            identity: `Autonomous Technical Researcher for ${domain}`,
            interests: [domain, 'Security Research', 'System Vulnerabilities', 'Emerging Tech'],
            avoid: ['Off-topic marketing', 'Generic hype'],
            editorialPrinciples: ['Technical depth', 'Fact-based evidence', 'Timely disclosures'],
            voice: { tone: 'analytical', length: 'concise', style: 'expert' },
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to initialize agent');
      }

      addToast(`Created agent: ${name}`, 'success');
      await fetchData();
    } catch (err: any) {
      addToast(`Error: ${err.message}`, 'error');
    } finally {
      setActionLoading((prev) => ({ ...prev, createSample: false }));
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
    <div className="min-h-screen bg-[#09090b] text-zinc-100 font-sans selection:bg-zinc-800">
      {/* Toast Notifications */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto px-4 py-2.5 rounded-lg text-xs font-medium border shadow-lg transition-all animate-fade-in ${
              toast.type === 'error'
                ? 'bg-red-950/90 border-red-800 text-red-200'
                : toast.type === 'success'
                ? 'bg-zinc-900 border-zinc-700 text-emerald-400'
                : 'bg-zinc-900 border-zinc-700 text-zinc-200'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>

      {/* Clean Developer Header */}
      <header className="sticky top-0 z-40 border-b border-zinc-800 bg-[#09090b]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-100 font-semibold text-sm">
              AB
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-semibold text-sm tracking-tight text-zinc-100">
                  ABTalks Agent Operations
                </h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-800 border border-zinc-700 text-zinc-300">
                  Nemotron 550B
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-zinc-400 mt-0.5">
                <span className="flex items-center gap-1.5 font-medium text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live (5s)
                </span>
                <span>•</span>
                <span className="font-mono text-zinc-500">Updated {lastUpdated.toLocaleTimeString()}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Search topics, agents, posts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600 transition-colors w-48 sm:w-64 placeholder:text-zinc-600"
              />
            </div>

            <button
              onClick={fetchData}
              className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
              title="Refresh Data Now"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-zinc-200' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Error Alert */}
        {error && (
          <div className="p-4 rounded-lg bg-red-950/40 border border-red-900/60 flex items-center justify-between gap-3 text-red-200">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span className="text-xs font-medium">{error}</span>
            </div>
            <button
              onClick={fetchData}
              className="px-3 py-1 bg-red-900/50 hover:bg-red-800/60 text-red-200 rounded text-xs font-medium transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Clean System Metrics Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="dev-panel rounded-xl p-4 border border-zinc-800/80">
            <div className="text-[11px] font-medium text-zinc-400 tracking-wide uppercase">
              Active Fleet
            </div>
            <div className="text-2xl font-bold text-zinc-100 mt-1 font-mono">
              {overview?.systemStats.totalAgents ?? 0}
            </div>
            <div className="mt-1 flex items-center gap-1 text-[11px] text-zinc-500 font-medium">
              <Cpu className="w-3 h-3 text-zinc-400" />
              <span>Autonomous Workers</span>
            </div>
          </div>

          <div className="dev-panel rounded-xl p-4 border border-zinc-800/80">
            <div className="text-[11px] font-medium text-zinc-400 tracking-wide uppercase">
              Total Published
            </div>
            <div className="text-2xl font-bold text-zinc-100 mt-1 font-mono">
              {overview?.systemStats.totalPosts ?? 0}
            </div>
            <div className="mt-1 flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
              <CheckCircle2 className="w-3 h-3" />
              <span>Editorial Approved</span>
            </div>
          </div>

          <div className="dev-panel rounded-xl p-4 border border-zinc-800/80">
            <div className="text-[11px] font-medium text-zinc-400 tracking-wide uppercase">
              Throughput Today
            </div>
            <div className="text-2xl font-bold text-zinc-100 mt-1 font-mono">
              {overview?.systemStats.postsToday ?? 0}
            </div>
            <div className="mt-1 flex items-center gap-1 text-[11px] text-zinc-500 font-medium">
              <Clock className="w-3 h-3 text-zinc-400" />
              <span>24h Publication Rate</span>
            </div>
          </div>

          <div className="dev-panel rounded-xl p-4 border border-zinc-800/80">
            <div className="text-[11px] font-medium text-zinc-400 tracking-wide uppercase">
              Discovered Topics
            </div>
            <div className="text-2xl font-bold text-zinc-100 mt-1 font-mono">
              {overview?.systemStats.totalTopics ?? 0}
            </div>
            <div className="mt-1 flex items-center gap-1 text-[11px] text-zinc-500 font-medium">
              <Layers className="w-3 h-3 text-zinc-400" />
              <span>Ingested Candidates</span>
            </div>
          </div>
        </div>

        {/* Breeth Memory & System Architecture Strip */}
        <div className="dev-panel rounded-xl p-3.5 border border-zinc-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <Database className="w-4 h-4 text-zinc-400 shrink-0" />
            <div>
              <span className="font-semibold text-zinc-200">Breeth Memory Engine</span>
              <span className="text-zinc-500 ml-2">
                Semantic Novelty & Duplicate Prevention
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-zinc-400 font-mono text-[11px]">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>api.thebreeth.com Active</span>
          </div>
        </div>

        {/* Two Column Main Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column (2/3 width): Fleet & Posts */}
          <div className="lg:col-span-2 space-y-6">
            {/* Agent Fleet */}
            <section className="space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-zinc-400" />
                  <h2 className="text-sm font-semibold text-zinc-200">Agent Fleet Operations</h2>
                </div>
                <span className="text-xs text-zinc-500 font-mono">{overview?.agents.length || 0} active</span>
              </div>

              {!overview?.agents || overview.agents.length === 0 ? (
                <div className="dev-panel rounded-xl p-6 text-center space-y-3 border border-zinc-800">
                  <p className="text-xs text-zinc-400">No active agents configured in database.</p>
                  <div className="flex items-center justify-center gap-2 pt-1">
                    <button
                      onClick={() => handleCreateSampleAgent('AI Security Researcher', 'AI Security')}
                      disabled={actionLoading.createSample}
                      className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-medium transition-colors"
                    >
                      + Add AI Security Agent
                    </button>
                    <button
                      onClick={() => handleCreateSampleAgent('AI Infrastructure Analyst', 'AI Infrastructure')}
                      disabled={actionLoading.createSample}
                      className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-medium transition-colors"
                    >
                      + Add AI Infra Agent
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {overview.agents.map((agent, index) => {
                    const badgeTheme = AGENT_BADGE_COLORS[index % AGENT_BADGE_COLORS.length];
                    const isPaused = agent.status === 'paused';
                    const stats = agent.stats || {};

                    return (
                      <div
                        key={agent.id}
                        className={`dev-panel rounded-xl p-4 border transition-colors flex flex-col justify-between ${
                          isPaused ? 'opacity-60 border-zinc-800' : 'border-zinc-800 hover:border-zinc-700'
                        }`}
                      >
                        <div className="space-y-3">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${isPaused ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                                <h3 className="font-semibold text-sm text-zinc-100">{agent.name}</h3>
                              </div>
                              <span className="text-xs text-zinc-500 font-mono mt-0.5 block">{agent.domain}</span>
                            </div>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium ${badgeTheme.bg} ${badgeTheme.border} ${badgeTheme.text}`}>
                              {agent.status.toUpperCase()}
                            </span>
                          </div>

                          {/* Pipeline Progress */}
                          <div className="space-y-1.5 text-[11px]">
                            <div className="flex justify-between text-zinc-400 font-mono">
                              <span>Pipeline</span>
                              <span>{stats.topicsPublished || 0} Published</span>
                            </div>
                            <div className="w-full bg-zinc-900 rounded-full h-1.5 overflow-hidden flex border border-zinc-800">
                              <div
                                style={{ width: `${Math.min(100, ((stats.topicsPending || 0) / 10) * 100)}%` }}
                                className="bg-zinc-600 h-full"
                                title="Pending"
                              />
                              <div
                                style={{ width: `${Math.min(100, ((stats.topicsSelected || 0) / 10) * 100)}%` }}
                                className="bg-amber-500 h-full"
                                title="Selected"
                              />
                              <div
                                style={{ width: `${Math.min(100, ((stats.topicsPublished || 0) / 10) * 100)}%` }}
                                className="bg-emerald-500 h-full"
                                title="Published"
                              />
                            </div>
                            <div className="grid grid-cols-4 gap-1 text-[10px] text-zinc-500 font-mono pt-1 text-center">
                              <div>Disc: {stats.totalTopicsDiscovered || 0}</div>
                              <div>Pend: {stats.topicsPending || 0}</div>
                              <div>Rej: {stats.topicsRejected || 0}</div>
                              <div>Pub: {stats.topicsPublished || 0}</div>
                            </div>
                          </div>
                        </div>

                        {/* Controls */}
                        <div className="flex items-center justify-between pt-3 border-t border-zinc-800/80 mt-3 text-xs">
                          <div className="flex items-center gap-1.5">
                            {isPaused ? (
                              <button
                                onClick={() => handleAgentAction(agent.id, 'resume')}
                                disabled={actionLoading[`${agent.id}-resume`]}
                                className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 transition-colors flex items-center gap-1 text-[11px]"
                              >
                                <Play className="w-3 h-3 text-emerald-400" />
                                <span>Resume</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => handleAgentAction(agent.id, 'pause')}
                                disabled={actionLoading[`${agent.id}-pause`]}
                                className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 transition-colors flex items-center gap-1 text-[11px]"
                              >
                                <Pause className="w-3 h-3 text-amber-400" />
                                <span>Pause</span>
                              </button>
                            )}

                            <button
                              onClick={() => handleAgentAction(agent.id, 'trigger')}
                              disabled={actionLoading[`${agent.id}-trigger`]}
                              className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 transition-colors flex items-center gap-1 text-[11px]"
                              title="Run Discovery & Editorial Cycle Now"
                            >
                              <Zap className="w-3 h-3 text-indigo-400" />
                              <span>Trigger Cycle</span>
                            </button>
                          </div>

                          <button
                            onClick={() => handleAgentAction(agent.id, 'delete')}
                            disabled={actionLoading[`${agent.id}-delete`]}
                            className="p-1 rounded text-zinc-500 hover:text-red-400 transition-colors"
                            title="Delete Agent"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Published Posts */}
            <section className="space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-zinc-400" />
                  <h2 className="text-sm font-semibold text-zinc-200">Recent Published Posts</h2>
                </div>
                <span className="text-xs text-zinc-500 font-mono">{filteredPosts.length} posts</span>
              </div>

              {filteredPosts.length === 0 ? (
                <div className="dev-panel rounded-xl p-6 text-center text-xs text-zinc-500 border border-zinc-800">
                  No published posts found. Autonomous workers evaluate candidate topics continuously.
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredPosts.map((post) => (
                    <div key={post.id} className="dev-panel rounded-xl p-4 border border-zinc-800 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-800 border border-zinc-700 text-zinc-300">
                            {post.agentName}
                          </span>
                          <span className="text-xs text-zinc-500 font-mono">{post.agentDomain}</span>
                        </div>
                        <span className="text-xs text-zinc-500 font-mono">{formatTime(post.createdAt)}</span>
                      </div>

                      <p className="text-xs text-zinc-200 leading-relaxed font-sans">{post.text}</p>

                      <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[11px] text-zinc-500 font-mono">
                        <span className="truncate max-w-md">Rationale: {post.rationale}</span>
                        {post.sources && post.sources.length > 0 && (
                          <a
                            href={post.sources[0]}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-1 shrink-0"
                          >
                            <span>Source</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Right Column (1/3 width): Live Editorial Stream */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-zinc-400" />
                <h2 className="text-sm font-semibold text-zinc-200">Editorial Activity Stream</h2>
              </div>
              <div className="flex items-center gap-1 text-[10px] font-mono">
                <button
                  onClick={() => setActivityFilter('all')}
                  className={`px-2 py-0.5 rounded ${activityFilter === 'all' ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-500'}`}
                >
                  All
                </button>
                <button
                  onClick={() => setActivityFilter('topic_selected')}
                  className={`px-2 py-0.5 rounded ${activityFilter === 'topic_selected' ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-500'}`}
                >
                  Approved
                </button>
              </div>
            </div>

            <div className="dev-panel rounded-xl p-3 border border-zinc-800 max-h-[600px] overflow-y-auto space-y-2">
              {filteredActivity.length === 0 ? (
                <div className="p-4 text-center text-xs text-zinc-500">
                  No activity entries matching filter.
                </div>
              ) : (
                filteredActivity.map((item, idx) => {
                  const isApproved = item.type === 'topic_selected' || item.type === 'post_published';
                  return (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800/80 space-y-1 text-xs"
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-mono text-zinc-400">{item.agentName}</span>
                        <span className="font-mono text-zinc-500">{formatTime(item.timestamp)}</span>
                      </div>

                      <div className="flex items-start gap-2">
                        {isApproved ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-zinc-600 shrink-0 mt-0.5" />
                        )}
                        <span className="text-zinc-300 font-medium leading-snug line-clamp-2">{item.title}</span>
                      </div>

                      {item.score !== undefined && (
                        <div className="flex justify-between items-center text-[10px] font-mono pt-1 text-zinc-500">
                          <span>Decision: {isApproved ? 'Approved' : 'Rejected'}</span>
                          <span className={`font-bold ${item.score >= 6.0 ? 'text-emerald-400' : 'text-zinc-500'}`}>
                            Score: {item.score.toFixed(1)}
                          </span>
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
    </div>
  );
}
