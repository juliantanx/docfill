'use client'
import type { DocField } from '@/types/document'
import AiProgressStream from './AiProgressStream'

interface Props {
  fields: DocField[]
  aiFillState: 'idle' | 'filling' | 'paused' | 'done'
  progress: number
  onStartFill: () => void
  onStopFill: () => void
  onResumeFill: () => void
  onFieldChange: (fieldId: string, value: string) => void
}

export default function AiPanel({
  fields,
  aiFillState,
  progress,
  onStartFill,
  onStopFill,
  onResumeFill,
  onFieldChange,
}: Props) {
  const filledCount = fields.filter((f) => f.value).length
  const totalCount = fields.length

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-white/10 bg-gray-900/80 backdrop-blur">
      <div className="border-b border-white/10 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white/80">AI 填写面板</h2>
          <span className="text-xs text-white/40">
            {filledCount}/{totalCount}
          </span>
        </div>

        <div className="mt-3">
          {aiFillState === 'filling' ? (
            <button
              onClick={onStopFill}
              className="w-full rounded-lg border border-red-500/50 bg-red-500/10
                         py-2 text-sm font-medium text-red-400 hover:bg-red-500/20"
            >
              取消填写
            </button>
          ) : aiFillState === 'paused' ? (
            <button
              onClick={onResumeFill}
              className="w-full rounded-lg bg-gradient-to-r from-amber-600 to-orange-600
                         py-2 text-sm font-medium text-white hover:opacity-90 active:scale-95"
            >
              继续填写
            </button>
          ) : (
            <button
              onClick={onStartFill}
              className="w-full rounded-lg bg-gradient-to-r from-violet-600 to-blue-600
                         py-2 text-sm font-medium text-white hover:opacity-90 active:scale-95"
            >
              {aiFillState === 'done' ? '重新 AI 填写' : 'AI 自动填写'}
            </button>
          )}
        </div>

        <AiProgressStream progress={progress} state={aiFillState === 'paused' ? 'idle' : aiFillState} />
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {fields.length === 0 && (
          <p className="text-xs text-white/30 text-center mt-8">未识别到可填写字段</p>
        )}
        {fields.map((field) => (
          <div
            key={field.id}
            className={`rounded-xl border p-3 transition-all
              ${field.value
                ? 'border-green-500/20 bg-green-500/5'
                : 'border-white/10 bg-white/5'
              }`}
          >
            <label className="mb-1 block text-xs font-medium text-white/50">
              {field.label}
              {field.requires_input && (
                <span className="ml-1 text-violet-400">需要输入</span>
              )}
            </label>
            <input
              type="text"
              value={field.value}
              onChange={(e) => onFieldChange(field.id, e.target.value)}
              placeholder="等待填写..."
              className="w-full bg-transparent text-sm text-white/80 placeholder-white/20
                         outline-none focus:placeholder-white/30"
            />
          </div>
        ))}
      </div>
    </aside>
  )
}
