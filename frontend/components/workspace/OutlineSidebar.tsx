import type { OutlineNode, Reference } from '@/types/document'

interface Props {
  outline: OutlineNode[]
  references: Reference[]
}

function OutlineItem({ node, depth = 0 }: { node: OutlineNode; depth?: number }) {
  return (
    <li>
      <button
        className={`w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-white/10
          ${depth === 0 ? 'font-medium text-white/80' : 'text-white/50'}`}
        style={{ paddingLeft: `${(depth + 1) * 12}px` }}
        title={node.title}
      >
        {node.title}
      </button>
      {node.children?.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <OutlineItem key={child.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}

export default function OutlineSidebar({ outline, references }: Props) {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-white/10 bg-gray-900 overflow-y-auto">
      <div className="p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/30">
          文档大纲
        </p>
        {outline.length === 0 ? (
          <p className="text-xs text-white/20">暂无大纲</p>
        ) : (
          <ul className="space-y-0.5">
            {outline.map((node) => (
              <OutlineItem key={node.id} node={node} />
            ))}
          </ul>
        )}
      </div>

      {references.length > 0 && (
        <div className="border-t border-white/10 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/30">
            参考文档
          </p>
          <ul className="space-y-1">
            {references.map((ref) => (
              <li key={ref.doc_id} className="truncate text-xs text-white/40" title={ref.filename}>
                {ref.filename}
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  )
}
