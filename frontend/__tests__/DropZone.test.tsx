import { render, screen, fireEvent } from '@testing-library/react'
import DropZone from '@/components/upload/DropZone'

test('calls onFileSelect with .docx file', () => {
  const onSelect = jest.fn()
  render(<DropZone onFileSelect={onSelect} />)

  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  const file = new File(['content'], 'test.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
  fireEvent.change(input, { target: { files: [file] } })

  expect(onSelect).toHaveBeenCalledWith(file)
})

test('shows default label text', () => {
  render(<DropZone onFileSelect={jest.fn()} />)
  expect(screen.getByText('拖拽或点击上传 Word 文档')).toBeInTheDocument()
})

test('shows custom label', () => {
  render(<DropZone onFileSelect={jest.fn()} label="自定义标签" />)
  expect(screen.getByText('自定义标签')).toBeInTheDocument()
})
