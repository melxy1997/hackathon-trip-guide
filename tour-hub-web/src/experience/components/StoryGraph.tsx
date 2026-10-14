import { useMemo } from 'react'
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type Connection, type Edge, type Node, type NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { ExperienceDefinitionV1, ExperienceDiagnostic } from '../experienceSchema'
import { storyDepths, storyRoutes } from '../storyGraph'

type StoryNodeData = { title: string; id: string; mode: string; initial: boolean; diagnostics: string[]; handles: Array<{ id: string; label: string; diagnostics: string[] }> }
type StoryNode = Node<StoryNodeData, 'story'>

function StoryNodeCard({ data, selected }: NodeProps<StoryNode>) {
  const hasDiagnostics = data.diagnostics.length > 0
  return <div data-diagnostic-count={hasDiagnostics ? data.diagnostics.length : undefined} className={`min-w-48 rounded-xl border-2 px-4 py-3 shadow-sm transition-colors ${hasDiagnostics ? 'border-red-600 bg-red-50' : selected ? 'border-amber-600 bg-amber-50 ring-2 ring-amber-200 ring-offset-2' : data.mode === 'ending' ? 'border-emerald-600 bg-white' : 'border-slate-300 bg-white'}`} aria-current={selected ? 'true' : undefined}>
    <Handle type="target" position={Position.Top} className="!h-3 !w-3 !bg-slate-500" />
    <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-gray-500"><span>{data.mode === 'ending' ? '终幕' : data.mode}</span>{data.initial && <b className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">起点</b>}{selected && <b className="rounded bg-amber-700 px-1.5 py-0.5 text-white">✓ 编辑中</b>}{hasDiagnostics && <b className="rounded bg-red-700 px-1.5 py-0.5 text-white">! {data.diagnostics.length} 个问题</b>}</div>
    <p className="mt-1 max-w-44 truncate text-sm font-medium" title={data.title}>{data.title}</p>
    <p className="mt-1 max-w-44 truncate font-mono text-[10px] text-gray-400">{data.id}</p>
    {data.handles.map(handle => <div key={handle.id} className={`relative mt-2 border-t border-dashed pt-1 pr-3 text-[10px] ${handle.diagnostics.length ? 'border-red-300 text-red-800' : 'border-gray-200 text-gray-500'}`}>
      <span className="block max-w-36 truncate" title={handle.diagnostics.join('\n') || handle.label}>{handle.label}{handle.diagnostics.length ? ` · ! ${handle.diagnostics.length}` : ''}</span>
      <Handle type="source" id={handle.id} position={Position.Right} style={{ top: '50%', transform: 'translateY(-50%)' }} className={handle.diagnostics.length ? '!h-3 !w-3 !bg-red-600' : '!h-3 !w-3 !bg-amber-600'} />
    </div>)}
  </div>
}

const nodeTypes = { story: StoryNodeCard }

export function StoryGraph({ definition, selectedId, diagnostics = [], onSelect, onConnect }: {
  definition: ExperienceDefinitionV1
  selectedId: string
  diagnostics?: ExperienceDiagnostic[]
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
    const sceneDiagnostics = (sceneId: string) => diagnostics.filter(diagnostic => diagnostic.sceneId === sceneId || diagnostic.route?.source === sceneId)
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
        ariaLabel: `章节：${scene.title}${scene.id === selectedId ? '，编辑中' : ''}${sceneDiagnostics(scene.id).length ? `；${sceneDiagnostics(scene.id).length} 个问题` : ''}`,
        data: {
          title: scene.title,
          id: scene.id,
          mode: scene.mode,
          initial: scene.id === definition.initialSceneId,
          diagnostics: sceneDiagnostics(scene.id).map(diagnostic => diagnostic.message),
          handles: routes.filter(route => route.source === scene.id).map(route => ({ id: route.handle, label: route.label, diagnostics: diagnostics.filter(diagnostic => diagnostic.route?.source === scene.id && diagnostic.route.handle === route.handle).map(diagnostic => diagnostic.message) })),
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
      style: { stroke: diagnostics.some(diagnostic => diagnostic.route?.source === route.source && diagnostic.route.handle === route.handle) ? '#dc2626' : '#a16207', strokeWidth: diagnostics.some(diagnostic => diagnostic.route?.source === route.source && diagnostic.route.handle === route.handle) ? 2.5 : undefined },
      labelStyle: { fill: '#6b7280', fontSize: 10 },
    }))
    return { nodes: graphNodes, edges: graphEdges }
  }, [definition, diagnostics, selectedId])
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
