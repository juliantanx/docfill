'use client'

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
      <div className="flex items-center gap-3 overflow-hidden">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg
                         border border-white/10 bg-white/5">
          {state === 'error' ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-red-400">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/40">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          )}
        </span>
        <span className="truncate text-sm font-medium text-white/80">{filename}</span>
      </div>

      {state !== 'ready' && state !== 'error' && (
        <div className="h-1 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-blue-500 transition-all duration-1000 ease-in-out"
            style={{ width: state === 'parsing' ? '70%' : '30%' }}
          />
        </div>
      )}

      <p className={`text-xs ${state === 'error' ? 'text-red-400' : 'text-white/50'}`}>
        {message ?? STATE_LABELS[state]}
      </p>
    </div>
  )
}
