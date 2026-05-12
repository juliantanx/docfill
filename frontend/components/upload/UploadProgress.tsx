'use client'
import { motion } from 'framer-motion'

interface UploadProgressProps {
  filename: string
  state: 'uploading' | 'parsing' | 'ready' | 'error'
  message?: string
}

const STATE_LABELS: Record<UploadProgressProps['state'], string> = {
  uploading: '正在上传...',
  parsing: '正在解析字段...',
  ready: '解析完成',
  error: '解析失败',
}

export default function UploadProgress({ filename, state, message }: UploadProgressProps) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-6">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{state === 'error' ? '❌' : '📄'}</span>
        <span className="truncate text-sm font-medium text-white/80">{filename}</span>
      </div>

      {state !== 'ready' && state !== 'error' && (
        <div className="h-1 overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-blue-500"
            initial={{ width: '0%' }}
            animate={{ width: state === 'parsing' ? '70%' : '30%' }}
            transition={{ duration: 1, ease: 'easeInOut' }}
          />
        </div>
      )}

      <p className={`text-xs ${state === 'error' ? 'text-red-400' : 'text-white/50'}`}>
        {message ?? STATE_LABELS[state]}
      </p>
    </div>
  )
}
