import { useMemo } from 'react'
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type Connection, type Edge, type Node, type NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { ExperienceDefinitionV1 } from '../experienceSchema'
import { storyDepths, storyRoutes } from '../storyGraph'

type StoryNodeData = { title: string; id: string; mode: string; initial: boolean; handles: Array<{ id: string; label: string }> }
type StoryNode = Node<StoryNodeData, 'story'>

function StoryNodeCard({ data, selected }: NodeProps<StoryNode>) {
  return <div className={`min-w-48 rounded-xl border-2 bg-white px-4 py-3 shadow-sm ${selected ? 'border-amber-600' : data.mode === 'ending' ? 'border-emerald-600' : 'border-slate-300'}`}>
    <Handle type="target" position={Position.Top} className="!h-3 !w-3 !bg-slate-500" />
    <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-gray-500"><span>{data.mode === 'ending' ? '终幕' : data.mode}</span>{data.initial && <b className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">起点</b>}</div>
    <p className="mt-1 max-w-44 truncate text-sm font-medium" title={data.title}>{data.title}</p>
    <p className="mt-1 max-w-44 truncate font-mono text-[10px] text-gray-400">{data.id}</p>
    {data.handles.map((handle, index) => <div key={handle.id} className="relative mt-2 border-t border-dashed border-gray-200 pt-1 pr-3 text-[10px] text-gray-500">
      <span className="block max-w-36 truncate" title={handle.label}>{handle.label}</span>
      <Handle type="source" id={handle.id} position={Position.Right} style={{ top: 70 + index * 24 }} className="!h-3 !w-3 !bg-amber-600" />
    </div>)}
  </div>
}

const nodeTypes = { story: StoryNodeCard }

export function StoryGraph({ definition, selectedId, onSelect, onConnect }: {
  definition: ExperienceDefinitionV1
  selectedId: string
  onSelect: (sceneId: string) => void
  onConnect: (sourceId: string, handle: string, targetId: string) => void
}) {
  const { nodes, edges } = useMemo(() => {
    const routes = storyRoutes(definition)
    const depths = storyDepths(definition)
    const rows = new Map<number, string[]>()
    for (const scene of definition.scenes) {
      const depth = depths.get(scene.id) ?? 0
      rows.set(depth, [...(rows.get(depth) ?? []), scene.id])
    }
    const graphNodes: StoryNode[] = definition.scenes.map(scene => {
      const depth = depths.get(scene.id) ?? 0
      const row = rows.get(depth) ?? []
      const column = row.indexOf(scene.id)
      return {
        id: scene.id,
        type: 'story',
        position: { x: column * 260, y: depth * 210 },
        selected: scene.id === selectedId,
        draggable: false,
        data: {
          title: scene.title,
          id: scene.id,
          mode: scene.mode,
          initial: scene.id === definition.initialSceneId,
          handles: routes.filter(route => route.source === scene.id).map(route => ({ id: route.handle, label: route.label })),
        },
      }
    })
    const graphEdges: Edge[] = routes.map(route => ({
      id: route.id,
      source: route.source,
      sourceHandle: route.handle,
      target: route.target,
      label: route.label,
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { stroke: '#a16207' },
      labelStyle: { fill: '#6b7280', fontSize: 10 },
    }))
    return { nodes: graphNodes, edges: graphEdges }
  }, [definition, selectedId])
  const connect = (connection: Connection) => {
    if (connection.source && connection.sourceHandle && connection.target) onConnect(connection.source, connection.sourceHandle, connection.target)
  }
  return <div className="h-[430px] min-h-[360px] w-full overflow-hidden rounded-xl border border-black/10 bg-slate-50" aria-label="故事关系图">
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodeClick={(_, node) => onSelect(node.id)} onConnect={connect} fitView fitViewOptions={{ padding: 0.25 }} minZoom={0.35} maxZoom={1.5} nodesConnectable>
      <Background gap={18} size={1} color="#d1d5db" />
      <Controls showInteractive={false} />
    </ReactFlow>
  </div>
}
