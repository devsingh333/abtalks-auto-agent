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
  ArrowRight,
  ExternalLink,
  Search,
  Filter,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  Cpu,
  Layers,
  BarChart3,
  AlertTriangle
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
  status: string;
  createdAt: string;
  stats: AgentStats;
}

interface SystemStats {
  totalAgents: number;
  totalPosts: number;
  totalTopics: number;
  postsToday: number;
}

interface OverviewData {
  agents: Agent[];
  systemStats: SystemStats;
}

interface ActivityItem {
  type: 'post_published' | 'topic_selected' | 'topic_rejected';
  agentId: string;
  agentName: string;
  title: string;
  score: number | null;
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

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

const AGENT_COLORS = [
  { border: 'border-cyan-500/40', bg: 'bg-cyan-500/10', text: 'text-cyan-400', badge: 'bg-cyan-500' },
  { border: 'border-emerald-500/40', bg: 'bg-emerald-500/10', text: 'text-emerald-400', badge: 'bg-emerald-500' },
  { border: 'border-purple-500/40', bg: 'bg-purple-500/10', text: 'text-purple-400', badge: 'bg-purple-500' },
  { border: 'border-amber-500/40', bg: 'bg-amber-500/10', text: 'text-amber-400', badge: 'bg-amber-500' },
  { border: 'border-rose-500/40', bg: 'bg-rose-500/10', text: 'text-rose-400', badge: 'bg-rose-500' },
];

export default function App() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  
  // UI Filters
  const [activityFilter, setActivityFilter] = useState<'all' | 'post_published' | 'topic_selected' | 'topic_rejected'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  
  // Modal & Toast
  const [deleteModalAgent, setDeleteModalAgent] = useState<Agent | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  };

  const fetchData = async () => {
    try {
      const [overviewRes, activityRes, postsRes] = await Promise.all([
        fetch('/api/monitor/overview'),
        fetch('/api/monitor/activity?limit=50'),
        fetch('/api/monitor/posts?limit=20'),
      ]);

      if (!overviewRes.ok) throw new Error('Failed to connect to monitor backend');

      const overviewData: OverviewData = await overviewRes.json();
      const activityData = activityRes.ok ? await activityRes.json() : { activity: [] };
      const postsData = postsRes.ok ? await postsRes.json() : { posts: [] };

      setOverview(overviewData);
      setActivity(activityData.activity || []);
      setPosts(postsData.posts || []);
      setError(null);
      setLastUpdated(new Date());
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Connection lost');
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
      if (action === 'delete') setDeleteModalAgent(null);
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
    <div className="min-h-screen flex flex-col bg-[#07070a] text-slate-100 selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Toast Notifications */}
      <div className="fixed top-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto px-4 py-3 rounded-xl border text-sm font-medium backdrop-blur-md shadow-2xl transition-all duration-300 animate-in fade-in slide-in-from-top-2 ${
              toast.type === 'success'
                ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-200'
                : toast.type === 'error'
                ? 'bg-rose-950/80 border-rose-500/40 text-rose-200'
                : 'bg-indigo-950/80 border-indigo-500/40 text-indigo-200'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#07070a]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 p-0.5 shadow-lg shadow-indigo-500/20">
              <div className="w-full h-full bg-[#090912] rounded-[10px] flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-indigo-400" />
              </div>
            </div>
            <div>
              <h1 className="font-extrabold text-base tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                ABTalks Autonomous Agent Command Center
              </h1>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  Live Sync (5s)
                </span>
                <span>•</span>
                <span>Updated {lastUpdated.toLocaleTimeString()}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative hidden sm:block">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search topics, agents, posts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-white/[0.04] border border-white/10 rounded-lg pl-9 pr-4 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-colors w-64 placeholder:text-slate-500"
              />
            </div>
            
            <button
              onClick={fetchData}
              className="p-2 rounded-lg bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] text-slate-300 hover:text-white transition-colors"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {error && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
              <span className="text-sm font-medium">{error}</span>
            </div>
            <button
              onClick={fetchData}
              className="px-3 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 rounded-lg text-xs font-semibold transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* System Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass-panel glass-panel-hover rounded-2xl p-5 relative overflow-hidden group">
            <div className="absolute right-3 top-3 w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
              <Bot className="w-5 h-5" />
            </div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Active Agents
            </div>
            <div className="text-3xl font-extrabold text-white tracking-tight">
              {overview?.systemStats.totalAgents ?? 0}
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-indigo-400 font-medium">
              <Cpu className="w-3.5 h-3.5" />
              <span>Autonomous personas</span>
            </div>
          </div>

          <div className="glass-panel glass-panel-hover rounded-2xl p-5 relative overflow-hidden group">
            <div className="absolute right-3 top-3 w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
              <FileText className="w-5 h-5" />
            </div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Total Published
            </div>
            <div className="text-3xl font-extrabold text-white tracking-tight">
              {overview?.systemStats.totalPosts ?? 0}
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Editorial approved</span>
            </div>
          </div>

          <div className="glass-panel glass-panel-hover rounded-2xl p-5 relative overflow-hidden group">
            <div className="absolute right-3 top-3 w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Posts Today
            </div>
            <div className="text-3xl font-extrabold text-white tracking-tight">
              {overview?.systemStats.postsToday ?? 0}
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-purple-400 font-medium">
              <Clock className="w-3.5 h-3.5" />
              <span>Current cycle throughput</span>
            </div>
          </div>

          <div className="glass-panel glass-panel-hover rounded-2xl p-5 relative overflow-hidden group">
            <div className="absolute right-3 top-3 w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 group-hover:scale-110 transition-transform">
              <Compass className="w-5 h-5" />
            </div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Discovered Topics
            </div>
            <div className="text-3xl font-extrabold text-white tracking-tight">
              {overview?.systemStats.totalTopics ?? 0}
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-cyan-400 font-medium">
              <Layers className="w-3.5 h-3.5" />
              <span>RSS feed ingestion</span>
            </div>
          </div>
        </div>

        {/* Fleet Grid */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-indigo-400" />
              <h2 className="text-lg font-bold text-white tracking-tight">Agent Fleet Overview</h2>
            </div>
            <span className="text-xs text-slate-400">{overview?.agents.length || 0} active workers</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {overview?.agents.map((agent, index) => {
              const theme = AGENT_COLORS[index % AGENT_COLORS.length];
              const isPaused = agent.status === 'paused';
              const stats = agent.stats || {};

              return (
                <div
                  key={agent.id}
                  className={`glass-panel rounded-2xl p-6 relative flex flex-col justify-between transition-all duration-300 ${
                    isPaused ? 'opacity-60 border-amber-500/30' : theme.border
                  }`}
                >
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${theme.badge} shadow-lg shadow-current`} />
                        <div>
                          <h3 className="font-bold text-base text-white tracking-tight leading-tight">
                            {agent.name}
                          </h3>
                          <p className="text-xs text-slate-400 font-medium">{agent.domain}</p>
                        </div>
                      </div>

                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${
                          isPaused
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        }`}
                      >
                        {agent.status}
                      </span>
                    </div>

                    {/* Pipeline Stage Bar */}
                    <div className="space-y-2 bg-black/20 p-3.5 rounded-xl border border-white/5">
                      <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex justify-between">
                        <span>Topic Pipeline</span>
                        <span className="text-slate-300 font-bold">{stats.totalTopicsDiscovered || 0} total</span>
                      </div>

                      <div className="grid grid-cols-4 gap-2 text-center text-xs">
                        <div className="p-2 rounded-lg bg-white/[0.03]">
                          <div className="font-bold text-slate-200">{stats.totalTopicsDiscovered || 0}</div>
                          <div className="text-[10px] text-slate-400 font-medium">Found</div>
                        </div>
                        <div className="p-2 rounded-lg bg-white/[0.03]">
                          <div className="font-bold text-amber-400">{stats.topicsPending || 0}</div>
                          <div className="text-[10px] text-slate-400 font-medium">Pending</div>
                        </div>
                        <div className="p-2 rounded-lg bg-white/[0.03]">
                          <div className="font-bold text-indigo-400">{stats.topicsSelected || 0}</div>
                          <div className="text-[10px] text-slate-400 font-medium">Selected</div>
                        </div>
                        <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                          <div className="font-bold text-emerald-400">{stats.topicsPublished || 0}</div>
                          <div className="text-[10px] text-emerald-300 font-semibold">Published</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions & Footer */}
                  <div className="mt-6 pt-4 border-t border-white/10 flex items-center gap-2">
                    {isPaused ? (
                      <button
                        onClick={() => handleAgentAction(agent.id, 'resume')}
                        disabled={actionLoading[`${agent.id}-resume`]}
                        className="flex-1 py-2 px-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>Resume</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleAgentAction(agent.id, 'pause')}
                        disabled={actionLoading[`${agent.id}-pause`]}
                        className="flex-1 py-2 px-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                      >
                        <Pause className="w-3.5 h-3.5" />
                        <span>Pause</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleAgentAction(agent.id, 'trigger')}
                      disabled={isPaused || actionLoading[`${agent.id}-trigger`]}
                      className="flex-1 py-2 px-3 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-30"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>Cycle</span>
                    </button>

                    <button
                      onClick={() => setDeleteModalAgent(agent)}
                      className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 transition-colors"
                      title="Delete Agent"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Main Grid: Published Posts & Activity Log */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Published Posts Feed */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-400" />
                <h2 className="text-lg font-bold text-white tracking-tight">Recent Published Posts</h2>
              </div>
              <span className="text-xs text-slate-400">{filteredPosts.length} posts</span>
            </div>

            <div className="space-y-4">
              {filteredPosts.length === 0 ? (
                <div className="glass-panel rounded-2xl p-8 text-center text-slate-400 text-sm">
                  No published posts found matching criteria.
                </div>
              ) : (
                filteredPosts.map((post) => {
                  const isExpanded = expandedPostId === post.id;
                  return (
                    <div
                      key={post.id}
                      onClick={() => setExpandedPostId(isExpanded ? null : post.id)}
                      className="glass-panel glass-panel-hover rounded-2xl p-5 cursor-pointer space-y-3 relative group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-semibold">
                          {post.agentName} ({post.agentDomain})
                        </span>
                        <span className="text-xs text-slate-400 font-mono">{formatTime(post.createdAt)}</span>
                      </div>

                      <p className="text-sm text-slate-200 leading-relaxed font-normal">
                        {post.text}
                      </p>

                      {/* Expandable Meta Section */}
                      {isExpanded && (
                        <div className="pt-3 mt-3 border-t border-white/10 space-y-2 text-xs text-slate-300 animate-in fade-in duration-200">
                          <div>
                            <span className="font-semibold text-slate-400">Original Topic: </span>
                            <span>{post.topicTitle}</span>
                          </div>
                          <div>
                            <span className="font-semibold text-slate-400">Editorial Rationale: </span>
                            <span className="text-slate-300 italic">{post.rationale}</span>
                          </div>

                          {post.sources && post.sources.length > 0 && (
                            <div className="flex items-center gap-2 pt-1 flex-wrap">
                              <span className="font-semibold text-slate-400">Sources:</span>
                              {post.sources.map((url, idx) => (
                                <a
                                  key={idx}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 underline text-xs"
                                >
                                  <span>{new URL(url).hostname}</span>
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              ))}
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

          {/* Activity Log Feed */}
          <div className="lg:col-span-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-indigo-400" />
                <h2 className="text-lg font-bold text-white tracking-tight">Live Activity Feed</h2>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10 text-xs">
              <button
                onClick={() => setActivityFilter('all')}
                className={`flex-1 py-1.5 rounded-lg font-medium transition-all ${
                  activityFilter === 'all'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setActivityFilter('post_published')}
                className={`flex-1 py-1.5 rounded-lg font-medium transition-all ${
                  activityFilter === 'post_published'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Published
              </button>
              <button
                onClick={() => setActivityFilter('topic_selected')}
                className={`flex-1 py-1.5 rounded-lg font-medium transition-all ${
                  activityFilter === 'topic_selected'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Selected
              </button>
              <button
                onClick={() => setActivityFilter('topic_rejected')}
                className={`flex-1 py-1.5 rounded-lg font-medium transition-all ${
                  activityFilter === 'topic_rejected'
                    ? 'bg-rose-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Rejected
              </button>
            </div>

            {/* Scrollable Feed */}
            <div className="glass-panel rounded-2xl p-4 max-h-[600px] overflow-y-auto space-y-3">
              {filteredActivity.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-xs">
                  No activity events found.
                </div>
              ) : (
                filteredActivity.map((item, index) => {
                  const isPublish = item.type === 'post_published';
                  const isSelect = item.type === 'topic_selected';

                  return (
                    <div
                      key={index}
                      className={`p-3.5 rounded-xl border text-xs space-y-1.5 transition-all ${
                        isPublish
                          ? 'bg-emerald-500/5 border-emerald-500/20'
                          : isSelect
                          ? 'bg-indigo-500/5 border-indigo-500/20'
                          : 'bg-white/[0.02] border-white/5'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-300">{item.agentName}</span>
                        <span className="text-[10px] text-slate-500">{formatTime(item.timestamp)}</span>
                      </div>

                      <p className="text-slate-200 font-medium leading-snug">{item.title}</p>

                      <div className="flex items-center justify-between pt-1">
                        <span
                          className={`font-bold uppercase tracking-wider text-[10px] ${
                            isPublish
                              ? 'text-emerald-400'
                              : isSelect
                              ? 'text-indigo-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {isPublish ? 'Published Post' : isSelect ? 'Selected Topic' : 'Rejected'}
                        </span>

                        {item.score !== null && (
                          <span
                            className={`px-1.5 py-0.5 rounded font-mono font-semibold text-[10px] ${
                              item.score >= 7
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                : item.score >= 5
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                                : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                            }`}
                          >
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

      {/* Delete Agent Modal */}
      {deleteModalAgent && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel max-w-md w-full rounded-2xl p-6 space-y-4 border border-rose-500/30 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-lg font-bold text-white">Delete Agent Persona</h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to permanently delete <strong className="text-white">{deleteModalAgent.name}</strong> ({deleteModalAgent.domain})? This will stop its worker loop and remove all associated topics and posts.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setDeleteModalAgent(null)}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleAgentAction(deleteModalAgent.id, 'delete')}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-lg shadow-rose-600/30 transition-colors"
              >
                Delete Agent
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
