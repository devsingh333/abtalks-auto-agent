import React, { useState, useEffect, useMemo } from 'react';
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

export default function App() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [mobileSearchOpen, setMobileSearchOpen] = useState<boolean>(false);
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
    <div className="min-h-screen bg-[#08080a] text-zinc-200 selection:bg-zinc-800">
      {/* Toast Notifications */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto px-3.5 py-2.5 rounded-lg text-xs font-medium bg-zinc-900 border border-zinc-800 shadow-xl text-zinc-100 flex items-center justify-between"
          >
            <span>{toast.message}</span>
          </div>
        ))}
      </div>

      {/* Highly Responsive Glassy Header */}
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#08080a]/90 backdrop-blur-lg">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-7 h-7 rounded bg-zinc-900 border border-white/[0.08] flex items-center justify-center text-zinc-100 font-bold text-xs">
              OA
            </div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-semibold text-xs sm:text-sm tracking-tight text-zinc-100">
                Orbix Agent
              </h1>
              <span className="hidden sm:inline-flex text-[11px] text-zinc-500 font-mono">
                Nemotron 550B
              </span>
              <span className="hidden md:inline-flex items-center gap-1.5 text-[11px] text-zinc-400 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Sync (5s)
              </span>
            </div>
          </div>

          {/* Search & Actions Bar */}
          <div className="flex items-center gap-2">
            {/* Desktop Search Bar */}
            <div className="hidden sm:relative sm:block">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Search topics, agents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-zinc-900/80 border border-white/[0.08] rounded-md pl-8 pr-3 py-1 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600 transition-colors w-48 lg:w-64 placeholder:text-zinc-600"
              />
            </div>

            {/* Mobile Search Button */}
            <button
              onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
              className="sm:hidden p-1.5 rounded-md bg-zinc-900 border border-white/[0.06] text-zinc-400"
            >
              {mobileSearchOpen ? <X className="w-4 h-4" /> : <Search className="w-4 h-4" />}
            </button>

            {/* Refresh Button */}
            <button
              onClick={fetchData}
              className="p-1.5 rounded-md bg-zinc-900 border border-white/[0.06] hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors shrink-0"
              title="Refresh Data Now"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-zinc-200' : ''}`} />
            </button>
          </div>
        </div>

        {/* Mobile Search Input Drawer */}
        {mobileSearchOpen && (
          <div className="sm:hidden px-3 py-2 border-t border-white/[0.06] bg-zinc-900/90">
            <input
              type="text"
              placeholder="Search topics, agents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-950 border border-white/[0.1] rounded-md px-3 py-1.5 text-xs text-zinc-200 focus:outline-none placeholder:text-zinc-600"
              autoFocus
            />
          </div>
        )}
      </header>

      {/* Main Responsive Grid Layout */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {/* Error Notification */}
        {error && (
          <div className="p-3 rounded-lg bg-red-950/40 border border-red-900/60 flex items-center justify-between text-xs text-red-200">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={fetchData} className="underline text-red-300">Retry</button>
          </div>
        )}

        {/* Heavy Responsive Metrics Row (2 cols mobile, 4 cols desktop) */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
          <div className="p-3 sm:p-4 rounded-xl border border-white/[0.06] bg-white/[0.01]">
            <div className="text-[11px] font-medium text-zinc-500">Active Fleet</div>
            <div className="text-xl sm:text-2xl font-bold text-zinc-100 mt-1 font-mono">
              {overview?.systemStats.totalAgents ?? 0}
            </div>
          </div>

          <div className="p-3 sm:p-4 rounded-xl border border-white/[0.06] bg-white/[0.01]">
            <div className="text-[11px] font-medium text-zinc-500">Total Published</div>
            <div className="text-xl sm:text-2xl font-bold text-zinc-100 mt-1 font-mono">
              {overview?.systemStats.totalPosts ?? 0}
            </div>
          </div>

          <div className="p-3 sm:p-4 rounded-xl border border-white/[0.06] bg-white/[0.01]">
            <div className="text-[11px] font-medium text-zinc-500">Throughput Today</div>
            <div className="text-xl sm:text-2xl font-bold text-zinc-100 mt-1 font-mono">
              {overview?.systemStats.postsToday ?? 0}
            </div>
          </div>

          <div className="p-3 sm:p-4 rounded-xl border border-white/[0.06] bg-white/[0.01]">
            <div className="text-[11px] font-medium text-zinc-500">Discovered Candidates</div>
            <div className="text-xl sm:text-2xl font-bold text-zinc-100 mt-1 font-mono">
              {overview?.systemStats.totalTopics ?? 0}
            </div>
          </div>
        </div>

        {/* 2-Column Responsive Dashboard Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Left Column (2/3 width on desktop): Fleet & Outputs */}
          <div className="lg:col-span-2 space-y-4 sm:space-y-6">
            {/* Agent Fleet Operations */}
            <section className="space-y-3">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-zinc-200">
                  <Bot className="w-4 h-4 text-zinc-400" />
                  <span>Agent Fleet Operations</span>
                </div>
                <span className="text-xs text-zinc-500 font-mono">{overview?.agents.length || 0} active</span>
              </div>

              {!overview?.agents || overview.agents.length === 0 ? (
                <div className="p-5 sm:p-6 rounded-xl border border-white/[0.06] bg-white/[0.01] text-center space-y-3 text-xs text-zinc-500">
                  <p>No active agents configured in database.</p>
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    <button
                      onClick={() => handleCreateSampleAgent('AI Security Researcher', 'AI Security')}
                      disabled={actionLoading.createSample}
                      className="px-3 py-1.5 rounded-md bg-zinc-900 border border-white/[0.08] hover:bg-zinc-800 text-zinc-200 text-xs transition-colors"
                    >
                      + AI Security Agent
                    </button>
                    <button
                      onClick={() => handleCreateSampleAgent('AI Infrastructure Analyst', 'AI Infrastructure')}
                      disabled={actionLoading.createSample}
                      className="px-3 py-1.5 rounded-md bg-zinc-900 border border-white/[0.08] hover:bg-zinc-800 text-zinc-200 text-xs transition-colors"
                    >
                      + AI Infra Agent
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {overview.agents.map((agent) => {
                    const isPaused = agent.status === 'paused';
                    const stats = agent.stats || {};

                    return (
                      <div
                        key={agent.id}
                        className={`p-3.5 sm:p-4 rounded-xl border bg-white/[0.01] transition-all flex flex-col justify-between ${
                          isPaused ? 'opacity-50 border-white/[0.04]' : 'border-white/[0.06] hover:border-white/[0.12]'
                        }`}
                      >
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className={`w-2 h-2 rounded-full shrink-0 ${isPaused ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                                <h3 className="font-semibold text-xs sm:text-sm text-zinc-100 truncate">{agent.name}</h3>
                              </div>
                              <span className="text-[11px] text-zinc-500 font-mono block mt-0.5 truncate">{agent.domain}</span>
                            </div>
                            <span className="text-[10px] font-mono text-zinc-400 shrink-0">
                              {agent.status}
                            </span>
                          </div>

                          {/* Pipeline Visual Bar */}
                          <div className="space-y-1 text-xs">
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

                          {/* Breeth Memory Role Integration */}
                          <div className="text-[11px] font-mono text-zinc-500 border-t border-white/[0.04] pt-2 flex items-center gap-1.5">
                            <Database className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                            <span className="truncate">Breeth Memory: Novelty & Deduplication</span>
                          </div>
                        </div>

                        {/* Responsive Action Buttons */}
                        <div className="flex items-center justify-between pt-3 border-t border-white/[0.04] mt-3 text-xs">
                          <div className="flex items-center gap-2">
                            {isPaused ? (
                              <button
                                onClick={() => handleAgentAction(agent.id, 'resume')}
                                disabled={actionLoading[`${agent.id}-resume`]}
                                className="px-2.5 py-1 rounded-md bg-zinc-900 border border-white/[0.08] text-zinc-300 hover:text-white text-xs transition-colors flex items-center gap-1"
                              >
                                <Play className="w-3 h-3 text-emerald-400" />
                                <span>Resume</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => handleAgentAction(agent.id, 'pause')}
                                disabled={actionLoading[`${agent.id}-pause`]}
                                className="px-2.5 py-1 rounded-md bg-zinc-900 border border-white/[0.08] text-zinc-400 hover:text-zinc-200 text-xs transition-colors flex items-center gap-1"
                              >
                                <Pause className="w-3 h-3 text-amber-400" />
                                <span>Pause</span>
                              </button>
                            )}

                            <button
                              onClick={() => handleAgentAction(agent.id, 'trigger')}
                              disabled={actionLoading[`${agent.id}-trigger`]}
                              className="px-2.5 py-1 rounded-md bg-zinc-900 border border-white/[0.08] text-zinc-300 hover:text-white text-xs transition-colors flex items-center gap-1"
                            >
                              <Zap className="w-3 h-3 text-amber-400" />
                              <span>Trigger</span>
                            </button>
                          </div>

                          <button
                            onClick={() => handleAgentAction(agent.id, 'delete')}
                            disabled={actionLoading[`${agent.id}-delete`]}
                            className="p-1 text-zinc-600 hover:text-red-400 transition-colors"
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

            {/* Published Outputs */}
            <section className="space-y-3">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-zinc-200">
                  <FileText className="w-4 h-4 text-zinc-400" />
                  <span>Published Output Stream</span>
                </div>
                <span className="text-xs text-zinc-500 font-mono">{filteredPosts.length} posts</span>
              </div>

              {filteredPosts.length === 0 ? (
                <div className="p-5 rounded-xl border border-white/[0.06] text-center text-xs text-zinc-500">
                  No published posts yet. Autonomous workers evaluate candidate topics continuously.
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredPosts.map((post) => (
                    <div key={post.id} className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.01] space-y-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-zinc-100 font-semibold truncate">{post.agentName}</span>
                          <span className="text-[11px] text-zinc-500 font-mono truncate">{post.agentDomain}</span>
                        </div>
                        <span className="text-[11px] text-zinc-500 font-mono shrink-0">{formatTime(post.createdAt)}</span>
                      </div>

                      <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed font-sans">{post.text}</p>

                      <div className="pt-2 border-t border-white/[0.04] flex flex-wrap items-center justify-between text-[11px] text-zinc-500 font-mono gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="truncate max-w-xs sm:max-w-md">Rationale: {post.rationale}</span>
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

          {/* Right Column (1/3 width on desktop): Editorial Activity Stream */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
              <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-zinc-200">
                <Activity className="w-4 h-4 text-zinc-400" />
                <span>Editorial Stream</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-500">
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

            <div className="p-2 sm:p-2.5 rounded-xl border border-white/[0.06] bg-white/[0.01] max-h-[620px] overflow-y-auto space-y-2">
              {filteredActivity.length === 0 ? (
                <div className="p-4 text-center text-xs text-zinc-500">
                  No activity entries recorded yet.
                </div>
              ) : (
                filteredActivity.map((item, idx) => {
                  const isApproved = item.type === 'topic_selected' || item.type === 'post_published';
                  return (
                    <div
                      key={idx}
                      className="p-2.5 sm:p-3 rounded-lg border border-white/[0.04] bg-zinc-900/50 space-y-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500">
                        <span>{item.agentName}</span>
                        <span>{formatTime(item.timestamp)}</span>
                      </div>

                      <div className="flex items-start gap-2">
                        {isApproved ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-zinc-600 shrink-0 mt-0.5" />
                        )}
                        <span className="text-zinc-300 font-medium leading-snug line-clamp-2">{item.title}</span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] font-mono pt-1 text-zinc-500 border-t border-white/[0.03]">
                        <span>
                          {isApproved ? 'Breeth Check: Passed (Novel)' : 'Breeth Memory: Filtered'}
                        </span>
                        {item.score !== undefined && (
                          <span className={item.score >= 6.0 ? 'text-emerald-400 font-semibold' : 'text-zinc-500'}>
                            Score: {item.score.toFixed(1)}
                          </span>
                        )}
                      </div>
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
