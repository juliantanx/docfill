import { render, screen, fireEvent } from '@testing-library/react'
import AiPanel from '@/components/workspace/AiPanel'
import type { DocField } from '@/types/document'

jest.mock('@/components/workspace/AiProgressStream', () => () => null)

const fields: DocField[] = [
  { id: 'f1', label: '姓名', value: '', status: 'empty', field_type: 'blank', requires_input: false },
  { id: 'f2', label: '日期', value: '2026-01-01', status: 'filled', field_type: 'blank', requires_input: false },
]

test('shows field count', () => {
  render(
    <AiPanel
      fields={fields}
      aiFillState="idle"
      progress={0}
      onStartFill={jest.fn()}
      onStopFill={jest.fn()}
      onResumeFill={jest.fn()}
      onFieldChange={jest.fn()}
    />,
  )
  expect(screen.getByText('1/2')).toBeInTheDocument()
})

test('calls onStartFill when AI button clicked', () => {
  const onStart = jest.fn()
  render(
    <AiPanel
      fields={fields}
      aiFillState="idle"
      progress={0}
      onStartFill={onStart}
      onStopFill={jest.fn()}
      onResumeFill={jest.fn()}
      onFieldChange={jest.fn()}
    />,
  )
  fireEvent.click(screen.getByText('AI 自动填写'))
  expect(onStart).toHaveBeenCalled()
})

test('shows stop button when filling', () => {
  render(
    <AiPanel
      fields={fields}
      aiFillState="filling"
      progress={50}
      onStartFill={jest.fn()}
      onStopFill={jest.fn()}
      onResumeFill={jest.fn()}
      onFieldChange={jest.fn()}
    />,
  )
  expect(screen.getByText('取消填写')).toBeInTheDocument()
})

test('shows resume button when paused', () => {
  const onResume = jest.fn()
  render(
    <AiPanel
      fields={fields}
      aiFillState="paused"
      progress={30}
      onStartFill={jest.fn()}
      onStopFill={jest.fn()}
      onResumeFill={onResume}
      onFieldChange={jest.fn()}
    />,
  )
  const btn = screen.getByText('继续填写')
  expect(btn).toBeInTheDocument()
  fireEvent.click(btn)
  expect(onResume).toHaveBeenCalled()
})
