import { useEffect, useRef, useState, useCallback } from 'react';
import { Character, CharacterRelation } from '../api/characters';

interface Node {
  id: string;
  name: string;
  role_type: string | null;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Edge {
  from: string;
  to: string;
  type: string;
}

const ROLE_COLORS: Record<string, string> = {
  '主角': '#c9a96e',
  '女主': '#e8a0bf',
  '反派': '#e06060',
  '导师': '#60c0e0',
  '配角': '#80c080',
  '路人': '#a0a0a0',
};

const DEFAULT_COLOR = '#c9a96e';

interface Props {
  characters: Character[];
  relations: CharacterRelation[];
  width?: number;
  height?: number;
}

export default function CharacterGraph({ characters, relations, width = 700, height = 500 }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [dragging, setDragging] = useState<string | null>(null);
  const draggingRef = useRef<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const animRef = useRef<number>(0);

  // Initialize nodes and edges
  useEffect(() => {
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.3;

    const initNodes: Node[] = characters.map((c, i) => {
      const angle = (2 * Math.PI * i) / characters.length;
      return {
        id: c.id,
        name: c.name,
        role_type: c.role_type,
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
        vx: 0,
        vy: 0,
      };
    });

    const initEdges: Edge[] = relations.map((r) => ({
      from: r.from_character_id,
      to: r.to_character_id,
      type: r.relation_type,
    }));

    setNodes(initNodes);
    setEdges(initEdges);
  }, [characters, relations, width, height]);

  // Force simulation
  useEffect(() => {
    if (nodes.length === 0) return;

    let iteration = 0;
    const maxIterations = 200;
    const damping = 0.9;

    const simulate = () => {
      if (iteration >= maxIterations) return;

      setNodes((prev) => {
        const next = prev.map((n) => ({ ...n }));
        const n = next.length;

        // Repulsion between all pairs
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            const dx = next[j].x - next[i].x;
            const dy = next[j].y - next[i].y;
            const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
            const force = 5000 / (dist * dist);
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            next[i].vx -= fx;
            next[i].vy -= fy;
            next[j].vx += fx;
            next[j].vy += fy;
          }
        }

        // Attraction along edges
        const nodeMap = new Map(next.map((n) => [n.id, n]));
        for (const edge of edges) {
          const from = nodeMap.get(edge.from);
          const to = nodeMap.get(edge.to);
          if (!from || !to) continue;
          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const force = (dist - 120) * 0.01;
          const fx = (dx / Math.max(dist, 1)) * force;
          const fy = (dy / Math.max(dist, 1)) * force;
          from.vx += fx;
          from.vy += fy;
          to.vx -= fx;
          to.vy -= fy;
        }

        // Centering force
        const cx = width / 2;
        const cy = height / 2;
        for (const node of next) {
          node.vx += (cx - node.x) * 0.001;
          node.vy += (cy - node.y) * 0.001;
        }

        // Apply velocity with damping
        for (const node of next) {
          if (draggingRef.current === node.id) continue;
          node.vx *= damping;
          node.vy *= damping;
          node.x += node.vx;
          node.y += node.vy;
          // Boundary clamping
          node.x = Math.max(40, Math.min(width - 40, node.x));
          node.y = Math.max(40, Math.min(height - 40, node.y));
        }

        return next;
      });

      iteration++;
      animRef.current = requestAnimationFrame(simulate);
    };

    animRef.current = requestAnimationFrame(simulate);
    return () => cancelAnimationFrame(animRef.current);
  }, [nodes.length, edges, width, height]);

  const handleMouseDown = useCallback((id: string) => {
    draggingRef.current = id;
    setDragging(id);
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!dragging || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setNodes((prev) =>
        prev.map((n) => (n.id === dragging ? { ...n, x, y, vx: 0, vy: 0 } : n))
      );
    },
    [dragging]
  );

  const handleMouseUp = useCallback(() => {
    draggingRef.current = null;
    setDragging(null);
  }, []);

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  if (characters.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-parchment-dim/40 text-sm">
        暂无角色数据
      </div>
    );
  }

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      className="bg-study-deep rounded-lg cursor-default"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <defs>
        <marker
          id="arrowhead"
          markerWidth="8"
          markerHeight="6"
          refX="8"
          refY="3"
          orient="auto"
        >
          <polygon points="0 0, 8 3, 0 6" fill="#c9a96e" fillOpacity="0.5" />
        </marker>
      </defs>

      {/* Edges */}
      {edges.map((edge, i) => {
        const from = nodeMap.get(edge.from);
        const to = nodeMap.get(edge.to);
        if (!from || !to) return null;

        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = dx / dist;
        const ny = dy / dist;

        // Offset by node radius (24)
        const x1 = from.x + nx * 24;
        const y1 = from.y + ny * 24;
        const x2 = to.x - nx * 24;
        const y2 = to.y - ny * 24;

        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;

        // Slight curve
        const cx = mx - ny * 15;
        const cy = my + nx * 15;

        return (
          <g key={i}>
            <path
              d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`}
              fill="none"
              stroke="#c9a96e"
              strokeOpacity={0.25}
              strokeWidth={1.5}
              markerEnd="url(#arrowhead)"
            />
            <text
              x={cx}
              y={cy - 6}
              textAnchor="middle"
              className="text-[10px] fill-parchment-dim/40 select-none"
            >
              {edge.type}
            </text>
          </g>
        );
      })}

      {/* Nodes */}
      {nodes.map((node) => {
        const color = ROLE_COLORS[node.role_type || ''] || DEFAULT_COLOR;
        const isHovered = hoveredNode === node.id;
        return (
          <g
            key={node.id}
            onMouseDown={() => handleMouseDown(node.id)}
            onMouseEnter={() => setHoveredNode(node.id)}
            onMouseLeave={() => setHoveredNode(null)}
            className="cursor-grab active:cursor-grabbing"
          >
            <circle
              cx={node.x}
              cy={node.y}
              r={isHovered ? 26 : 22}
              fill={color}
              fillOpacity={isHovered ? 0.3 : 0.15}
              stroke={color}
              strokeWidth={isHovered ? 2.5 : 1.5}
              className="transition-all duration-200"
            />
            <text
              x={node.x}
              y={node.y + 1}
              textAnchor="middle"
              dominantBaseline="middle"
              className="text-[11px] fill-parchment font-medium select-none pointer-events-none"
            >
              {node.name.length > 4 ? node.name.slice(0, 4) + '..' : node.name}
            </text>
            {node.role_type && (
              <text
                x={node.x}
                y={node.y + 16}
                textAnchor="middle"
                dominantBaseline="middle"
                className="text-[9px] select-none pointer-events-none"
                fill={color}
                fillOpacity={0.7}
              >
                {node.role_type}
              </text>
            )}
            {isHovered && node.name.length > 4 && (
              <title>{node.name}</title>
            )}
          </g>
        );
      })}
    </svg>
  );
}
