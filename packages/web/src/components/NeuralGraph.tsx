'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { Memory } from '@/types';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center h-full text-zinc-500 font-mono text-xs space-y-2">
      <Loader2 className="w-4 h-4 animate-spin" />
      <span>INITIALIZING NEURAL GRAPH...</span>
    </div>
  ),
});

interface MemoriesResponse {
  memories: Memory[];
  total: number;
  hasMore: boolean;
}

function getMemoryType(
  memory: Memory
): 'verified' | 'high-confidence' | 'low-confidence' {
  if (memory.isVerified) return 'verified';
  if (memory.confidence >= 0.7) return 'high-confidence';
  return 'low-confidence';
}

function buildConnections(memories: Memory[]): Map<string, string[]> {
  const tagToMemories = new Map<string, string[]>();

  memories.forEach((m) => {
    m.tags.forEach((tag) => {
      const existing = tagToMemories.get(tag) || [];
      existing.push(m.id);
      tagToMemories.set(tag, existing);
    });
  });

  const connections = new Map<string, string[]>();

  memories.forEach((m) => {
    const connected = new Set<string>();
    m.tags.forEach((tag) => {
      const sameTagMemories = tagToMemories.get(tag) || [];
      sameTagMemories.forEach((id) => {
        if (id !== m.id) connected.add(id);
      });
    });
    connections.set(m.id, Array.from(connected));
  });

  return connections;
}

export function NeuralGraph() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [highlightNodes, setHighlightNodes] = useState(new Set<string>());
  const [highlightLinks, setHighlightLinks] = useState(new Set<unknown>());
  const [hoverNode, setHoverNode] = useState<{
    id: string;
    type: string;
    fullContent: string;
    confidence: number;
    source: string | null;
  } | null>(null);

  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMemories = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/memories?limit=100');
      if (!res.ok) throw new Error('Failed to fetch memories');
      const data: MemoriesResponse = await res.json();
      setMemories(data.memories);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMemories();
  }, [fetchMemories]);

  useEffect(() => {
    function handleResize() {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        });
      }
    }

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const data = useMemo(() => {
    if (memories.length === 0) return { nodes: [], links: [] };

    const connections = buildConnections(memories);

    const nodes = memories.map((m) => {
      const type = getMemoryType(m);
      const connCount = connections.get(m.id)?.length || 0;
      return {
        id: m.id,
        group: type === 'verified' ? 1 : type === 'high-confidence' ? 2 : 3,
        val: connCount + 1,
        name: m.content.substring(0, 20) + '...',
        fullContent: m.content,
        type,
        confidence: m.confidence,
        source: m.source,
      };
    });

    const links: { source: string; target: string }[] = [];
    const addedLinks = new Set<string>();

    connections.forEach((targets, sourceId) => {
      targets.forEach((targetId) => {
        const key = [sourceId, targetId].sort().join('-');
        if (!addedLinks.has(key)) {
          addedLinks.add(key);
          links.push({ source: sourceId, target: targetId });
        }
      });
    });

    return { nodes, links };
  }, [memories]);

  const handleNodeHover = useCallback(
    (node: (typeof data.nodes)[number] | null) => {
      setHoverNode(node || null);

      const newHighlightNodes = new Set<string>();
      const newHighlightLinks = new Set<unknown>();

      if (node) {
        newHighlightNodes.add(node.id);
        data.links.forEach((link) => {
          const sourceId =
            typeof link.source === 'object'
              ? (link.source as { id: string }).id
              : link.source;
          const targetId =
            typeof link.target === 'object'
              ? (link.target as { id: string }).id
              : link.target;
          if (sourceId === node.id || targetId === node.id) {
            newHighlightLinks.add(link);
            newHighlightNodes.add(sourceId === node.id ? targetId : sourceId);
          }
        });
      }

      setHighlightNodes(newHighlightNodes);
      setHighlightLinks(newHighlightLinks);
    },
    [data.links]
  );

  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-black">
        <div className="flex flex-col items-center gap-4 text-zinc-500 font-mono text-xs">
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 bg-zinc-500 animate-pulse"></div>
            <div className="w-1.5 h-1.5 bg-zinc-500 animate-pulse delay-75"></div>
            <div className="w-1.5 h-1.5 bg-zinc-500 animate-pulse delay-150"></div>
          </div>
          <span className="tracking-widest">LOADING GRAPH DATA</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-black">
        <div className="text-red-900 font-mono text-xs uppercase tracking-widest flex items-center gap-2">
          <div className="w-2 h-2 bg-red-900 rounded-full animate-pulse"></div>
          Error: {error}
        </div>
      </div>
    );
  }

  if (memories.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-black">
        <div className="text-zinc-700 font-mono text-xs uppercase tracking-widest text-center space-y-2">
          <p>NO DATA POINTS</p>
          <p className="text-zinc-800">Initialize with CLI</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-full w-full relative overflow-hidden bg-black"
    >
      <ForceGraph2D
        width={dimensions.width}
        height={dimensions.height}
        graphData={data}
        nodeLabel={() => ''}
        nodeColor={(node) => {
          const n = node as { id: string; type: string };
          if (highlightNodes.size > 0 && !highlightNodes.has(n.id))
            return 'rgba(255, 255, 255, 0.05)';
          if (n.type === 'verified') return '#22c55e';
          if (n.type === 'high-confidence') return '#ffffff';
          return '#52525b';
        }}
        linkColor={(link) =>
          highlightLinks.has(link) ? '#ffffff' : 'rgba(255, 255, 255, 0.05)'
        }
        linkWidth={(link) => (highlightLinks.has(link) ? 1.5 : 0.5)}
        nodeRelSize={4}
        backgroundColor="#000000"
        onNodeHover={(node) => {
          if (node) {
            const n = node as (typeof data.nodes)[number];
            handleNodeHover(n);
          } else {
            handleNodeHover(null);
          }
        }}
        cooldownTicks={100}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
      />

      {hoverNode && (
        <div className="absolute top-6 right-6 w-80 p-5 bg-black/90 backdrop-blur-md border border-zinc-800 shadow-2xl animate-in fade-in slide-in-from-top-2 pointer-events-none z-50">
          <div className="flex items-center justify-between mb-4 border-b border-zinc-800 pb-2">
            <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">
              {hoverNode.type.replace('-', ' ')}
            </span>
            <span className="text-xs font-mono text-zinc-400">
              {Math.round(hoverNode.confidence * 100)}%
            </span>
          </div>
          <div className="relative max-h-48 overflow-hidden">
            <div className="text-sm text-zinc-200 font-light leading-relaxed">
              {hoverNode.fullContent}
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/90 to-transparent pointer-events-none" />
          </div>
          {hoverNode.source && (
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-600 uppercase tracking-wider">
              <span>Source:</span>
              <span className="text-zinc-500">{hoverNode.source}</span>
            </div>
          )}
        </div>
      )}

      <div className="absolute bottom-6 left-6 flex gap-6 text-xs font-mono uppercase tracking-wider text-zinc-600 pointer-events-none select-none">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-green-500"></div> Verified
        </div>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-white"></div> High Confidence
        </div>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-zinc-600"></div> Low Confidence
        </div>
      </div>
    </div>
  );
}
