'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Hash,
  Trash2,
  Clock,
  AlertCircle,
  CheckCircle2,
  Loader2,
  X,
  Filter,
  Maximize2,
  Copy,
  Check,
} from 'lucide-react';
import { Memory } from '@/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface MemoriesResponse {
  memories: Memory[];
  total: number;
  hasMore: boolean;
}

const MemorySkeleton = () => (
  <div className="animate-pulse w-full">
    {[1, 2, 3].map((i) => (
      <div key={i} className="border-b border-white/5 p-6">
        <div className="flex gap-6">
          <div className="w-24 shrink-0 flex flex-col gap-2 pt-1">
            <div className="h-3 w-12 bg-zinc-900 rounded" />
            <div className="h-3 w-8 bg-zinc-900 rounded" />
          </div>
          <div className="flex-1 space-y-3">
            <div className="space-y-2">
              <div className="h-4 w-3/4 bg-zinc-900 rounded" />
              <div className="h-4 w-1/2 bg-zinc-900 rounded" />
            </div>
            <div className="flex gap-2 pt-1">
              <div className="h-3 w-16 bg-zinc-900 rounded" />
              <div className="h-3 w-12 bg-zinc-900 rounded" />
            </div>
          </div>
        </div>
      </div>
    ))}
  </div>
);

export function MemoryStream() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [forgetFilter, setForgetFilter] = useState<
    'all' | 'last-hour' | 'last-day'
  >('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const MAX_CONTENT_LENGTH = 300;
  const MAX_LINES = 6;

  const shouldTruncate = (content: string) => {
    const lines = content.split('\n');
    return content.length > MAX_CONTENT_LENGTH || lines.length > MAX_LINES;
  };

  const truncateContent = (content: string) => {
    const lines = content.split('\n');
    if (lines.length > MAX_LINES) {
      return lines.slice(0, MAX_LINES).join('\n') + '...';
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      return content.slice(0, MAX_CONTENT_LENGTH) + '...';
    }
    return content;
  };

  const fetchMemories = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      let url = '/api/memories?limit=100';

      if (forgetFilter === 'last-hour') {
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        url += `&since=${oneHourAgo}`;
      } else if (forgetFilter === 'last-day') {
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        url += `&since=${oneDayAgo}`;
      }

      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch: ${res.statusText}`);

      const data: MemoriesResponse = await res.json();
      setMemories(data.memories);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load memories');
    } finally {
      setLoading(false);
    }
  }, [forgetFilter]);

  useEffect(() => {
    fetchMemories();
  }, [fetchMemories]);

  const handleDelete = async (id: string) => {
    try {
      setDeletingId(id);
      const res = await fetch(`/api/memories?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete memory');
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeletingId(null);
    }
  };

  const handleForgetLastHour = async () => {
    if (
      !confirm('Delete all memories from the last hour? This cannot be undone.')
    )
      return;

    try {
      setLoading(true);
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      const res = await fetch(`/api/memories?olderThan=${oneHourAgo}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete memories');
      await fetchMemories();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
      setLoading(false);
    }
  };

  const filteredMemories = memories.filter((memory) => {
    const matchesSearch = memory.content
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesTag = selectedTag ? memory.tags.includes(selectedTag) : true;
    return matchesSearch && matchesTag;
  });

  const formatTimestamp = (timestamp: number) => {
    if (!mounted) return '--:--';
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleCopy = async (content: string) => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border border-white/10 rounded-lg overflow-hidden flex flex-col w-full bg-zinc-950/50">
      <div className="flex items-center border-b border-white/10 bg-zinc-900/30">
        <div className="flex-1 relative border-r border-white/10">
          <Input
            placeholder="grep memories..."
            className="w-full bg-transparent border-0 text-sm font-mono text-zinc-200 placeholder:text-zinc-500 pl-4 pr-4 py-3 h-auto focus-visible:ring-0 focus-visible:ring-offset-0"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 px-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setForgetFilter(
                forgetFilter === 'last-hour' ? 'all' : 'last-hour'
              )
            }
            className={cn(
              'h-7 text-[10px] font-mono uppercase tracking-wider rounded-md px-3 transition-all duration-300',
              forgetFilter === 'last-hour'
                ? 'bg-white/10 text-white shadow-sm ring-1 ring-white/20'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
            )}
          >
            <Clock className="w-3 h-3 mr-2 opacity-70" />
            Last Hour
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleForgetLastHour}
            className="h-7 text-[10px] font-mono uppercase tracking-wider text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-md px-3 transition-all duration-300"
          >
            <Trash2 className="w-3 h-3 mr-2 opacity-70" />
            Purge Recent
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-950/20 border-b border-white/10 text-red-500 text-sm font-mono animate-in slide-in-from-top-2">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {selectedTag && (
        <div className="flex items-center gap-2 p-3 border-b border-white/10 bg-zinc-900/20 animate-in fade-in slide-in-from-left-2">
          <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
            Active Filter
          </span>
          <button
            onClick={() => setSelectedTag(null)}
            className="flex items-center gap-1.5 px-2 py-1 bg-white/10 text-zinc-200 ring-1 ring-white/10 text-[10px] font-mono hover:bg-white/20 transition-colors rounded-md"
          >
            #{selectedTag}
            <X className="w-3 h-3 opacity-70" />
          </button>
        </div>
      )}

      <div className="overflow-y-auto max-h-[60vh] min-h-[200px] scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        {loading && memories.length === 0 ? (
          <MemorySkeleton />
        ) : filteredMemories.length > 0 ? (
          <div className="flex flex-col">
            {filteredMemories.map((memory) => (
              <div
                key={memory.id}
                className="group relative p-6 border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors duration-200"
              >
                <div className="flex gap-6">
                  <div className="w-24 shrink-0 flex flex-col gap-2 pt-1 relative">
                    <span
                      className="font-mono text-[10px] text-zinc-400 group-hover:text-zinc-300 transition-colors uppercase tracking-wider"
                      suppressHydrationWarning
                    >
                      {formatTimestamp(memory.createdAt)}
                    </span>
                    <div className="flex items-center gap-2">
                      {memory.isVerified ? (
                        <CheckCircle2 className="w-3 h-3 text-emerald-500/70 group-hover:text-emerald-500 transition-colors" />
                      ) : (
                        <div className="w-3 h-3 rounded-full border border-zinc-700 group-hover:border-zinc-600 transition-colors" />
                      )}
                      <span
                        className={cn(
                          'text-[10px] font-mono tabular-nums transition-colors',
                          memory.confidence > 0.8
                            ? 'text-zinc-400 group-hover:text-zinc-300'
                            : 'text-zinc-600 group-hover:text-zinc-500'
                        )}
                      >
                        {Math.round(memory.confidence * 100)}%
                      </span>
                    </div>
                  </div>

                  <div className="flex-1 space-y-4 min-w-0">
                    <div className="relative">
                      <p className="text-sm leading-7 text-zinc-300 font-light selection:bg-white/10 selection:text-white break-words whitespace-pre-wrap group-hover:text-zinc-200 transition-colors">
                        {truncateContent(memory.content)}
                      </p>
                      {shouldTruncate(memory.content) && (
                        <button
                          onClick={() => setSelectedMemory(memory)}
                          className="mt-3 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-600 hover:text-zinc-300 transition-colors"
                        >
                          <Maximize2 className="w-3 h-3" />
                          VIEW FULL CONTENT
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {memory.tags.map((tag) => (
                        <button
                          key={tag}
                          className={cn(
                            'px-2.5 py-1 rounded-md text-[10px] font-medium transition-all duration-200 flex items-center gap-1.5 border',
                            selectedTag === tag
                              ? 'bg-white/10 text-zinc-200 border-white/20'
                              : 'bg-transparent border-white/5 text-zinc-600 hover:border-white/10 hover:text-zinc-400 hover:bg-white/[0.02]'
                          )}
                          onClick={() =>
                            setSelectedTag(tag === selectedTag ? null : tag)
                          }
                        >
                          <Hash
                            className={cn(
                              'w-2.5 h-2.5',
                              selectedTag === tag
                                ? 'opacity-70'
                                : 'opacity-30 group-hover:opacity-50 transition-opacity'
                            )}
                          />
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="w-8 flex items-start justify-end opacity-0 group-hover:opacity-100 transition-all duration-200 pt-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(memory.id)}
                      disabled={deletingId === memory.id}
                      className="h-7 w-7 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-all duration-200"
                    >
                      {deletingId === memory.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          !loading && (
            <div className="py-16 px-8 text-center animate-in fade-in zoom-in-95 duration-500">
              <Filter className="w-8 h-8 text-zinc-600 mx-auto mb-4" />
              <p className="text-zinc-400 font-mono text-sm mb-2">
                {memories.length === 0 ? 'No memories yet' : 'No matches found'}
              </p>
              <p className="text-zinc-600 text-xs max-w-sm mx-auto">
                {memories.length === 0
                  ? 'Connect your AI assistant via MCP to start capturing memories'
                  : 'Try adjusting your search or filters'}
              </p>
            </div>
          )
        )}
      </div>

      {selectedMemory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="absolute inset-0"
            onClick={() => setSelectedMemory(null)}
          />
          <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-black border border-zinc-800 shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col">
            <div className="sticky top-0 bg-black/95 backdrop-blur z-10 border-b border-zinc-900 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span
                    className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider"
                    suppressHydrationWarning
                  >
                    {formatTimestamp(selectedMemory.createdAt)}
                  </span>
                  {selectedMemory.isVerified && (
                    <div className="flex items-center gap-1.5 text-emerald-500">
                      <CheckCircle2 className="w-3 h-3" />
                      <span className="text-[10px] font-mono uppercase tracking-wider">
                        Verified
                      </span>
                    </div>
                  )}
                  <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-600">
                    {Math.round(selectedMemory.confidence * 100)}%
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCopy(selectedMemory.content)}
                    className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3 h-3" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        Copy
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setSelectedMemory(null)}
                    className="p-1.5 text-zinc-500 hover:text-white transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedMemory.tags.map((tag) => (
                  <div
                    key={tag}
                    className="flex items-center gap-1 text-[10px] font-mono text-zinc-500 uppercase tracking-wider border border-zinc-900 px-2 py-1 bg-zinc-900/50"
                  >
                    <Hash className="w-2.5 h-2.5 opacity-50" />
                    {tag}
                  </div>
                ))}
              </div>
            </div>

            <div className="p-6">
              <p className="text-sm leading-relaxed text-zinc-300 font-mono whitespace-pre-wrap selection:bg-white/20 selection:text-white">
                {selectedMemory.content}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
