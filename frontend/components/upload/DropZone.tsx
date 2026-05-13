'use client'
import { useCallback, useState } from 'react'

interface DropZoneProps {
  onFileSelect: (file: File) => void
  label?: string
  accept?: string
  className?: string
}

export default function DropZone({
  onFileSelect,
  label = '拖拽或点击上传 Word 文档',
  accept = '.docx,.doc',
  className = '',
}: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false)

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) onFileSelect(file)
    },
    [onFileSelect],
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) onFileSelect(file)
    },
    [onFileSelect],
  )

  return (
    <label
      className={`relative flex flex-col items-center justify-center
        cursor-pointer rounded-2xl border-2 border-dashed transition-all duration-200
        ${isDragging
          ? 'border-violet-400 bg-violet-500/10 shadow-[0_0_40px_rgba(139,92,246,0.3)]'
          : 'border-white/20 bg-white/5 hover:border-white/40 hover:bg-white/10'
        } ${className}`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <input type="file" accept={accept} className="sr-only" onChange={handleChange} />

      <div className="flex flex-col items-center gap-4 p-12 text-center">
        <div
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl
                     border border-white/10 bg-white/5 text-white/30
                     transition-transform duration-200"
          style={{ transform: isDragging ? 'scale(1.15) rotate(5deg)' : 'scale(1) rotate(0deg)' }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
        </div>
        <p className="text-lg font-medium text-white/80">{label}</p>
        <p className="text-sm text-white/40">支持 .docx、.doc 格式</p>
      </div>

      {isDragging && (
        <div className="absolute inset-0 rounded-2xl bg-violet-500/5 transition-opacity duration-200" />
      )}
    </label>
  )
}
