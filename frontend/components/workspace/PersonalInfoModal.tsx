'use client'
import { useState } from 'react'
import type { DocField } from '@/types/document'

interface Props {
  field: DocField
  onSubmit: (fieldId: string, value: string) => void
  onSkip: () => void
}

export default function PersonalInfoModal({ field, onSubmit, onSkip }: Props) {
  const [value, setValue] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-gray-900 p-6 shadow-2xl">
        <h3 className="text-base font-semibold text-white">补充信息</h3>
        <p className="mt-1 text-sm text-white/50">AI 无法自动填写此字段，请手动输入</p>

        <div className="mt-4">
          <label className="mb-1.5 block text-sm font-medium text-white/70">
            {field.label}
          </label>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={`请输入${field.label}`}
            autoFocus
            className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2
                       text-sm text-white placeholder-white/30 outline-none
                       focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && value.trim()) onSubmit(field.id, value.trim())
            }}
          />
        </div>

        <div className="mt-5 flex gap-3">
          <button
            onClick={onSkip}
            className="flex-1 rounded-xl border border-white/20 py-2 text-sm text-white/60
                       hover:bg-white/5"
          >
            跳过
          </button>
          <button
            onClick={() => value.trim() && onSubmit(field.id, value.trim())}
            disabled={!value.trim()}
            className="flex-1 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600
                       py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  )
}
