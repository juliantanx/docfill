'use client'
import { useCallback, useState } from 'react'

interface DropZoneProps {
  onFileSelect: (file: File) => void
  label?: string
  accept?: string
  className?: string
  multiple?: boolean
  onFilesSelect?: (files: File[]) => void
}

export default function DropZone({
  onFileSelect,
  label = '拖拽或点击上传 Word 文档',
  accept = '.docx,.doc',
  className = '',
  multiple = false,
  onFilesSelect,
}: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false)

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const files = Array.from(e.dataTransfer.files)
      if (multiple && onFilesSelect && files.length > 1) {
        onFilesSelect(files)
      } else if (files[0]) {
        onFileSelect(files[0])
      }
    },
    [onFileSelect, multiple, onFilesSelect],
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? [])
      if (multiple && onFilesSelect && files.length > 1) {
        onFilesSelect(files)
      } else if (files[0]) {
        onFileSelect(files[0])
      }
    },
    [onFileSelect, multiple, onFilesSelect],
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
      <input type="file" accept={accept} multiple={multiple} className="sr-only" onChange={handleChange} />

      <div className="flex flex-col items-center gap-4 p-12 text-center">
        <div
          className="text-5xl transition-transform duration-200"
          style={{ transform: isDragging ? 'scale(1.2) rotate(5deg)' : 'scale(1) rotate(0deg)' }}
        >
          📄
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
