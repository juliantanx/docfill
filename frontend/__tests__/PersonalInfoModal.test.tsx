import { render, screen, fireEvent } from '@testing-library/react'
import PersonalInfoModal from '@/components/workspace/PersonalInfoModal'
import type { DocField } from '@/types/document'

const mockField: DocField = {
  id: 'f1',
  label: '姓名',
  value: '',
  status: 'empty',
  field_type: 'blank',
  requires_input: true,
}

test('shows field label in modal', () => {
  render(
    <PersonalInfoModal field={mockField} onSubmit={jest.fn()} onSkip={jest.fn()} />,
  )
  expect(screen.getAllByText('姓名').length).toBeGreaterThan(0)
})

test('calls onSubmit with entered value on button click', () => {
  const onSubmit = jest.fn()
  render(<PersonalInfoModal field={mockField} onSubmit={onSubmit} onSkip={jest.fn()} />)

  const input = screen.getByPlaceholderText('请输入姓名')
  fireEvent.change(input, { target: { value: '张三' } })
  fireEvent.click(screen.getByText('确认'))

  expect(onSubmit).toHaveBeenCalledWith('f1', '张三')
})

test('calls onSkip when skip button clicked', () => {
  const onSkip = jest.fn()
  render(<PersonalInfoModal field={mockField} onSubmit={jest.fn()} onSkip={onSkip} />)
  fireEvent.click(screen.getByText('跳过'))
  expect(onSkip).toHaveBeenCalled()
})

test('confirm button disabled when input empty', () => {
  render(<PersonalInfoModal field={mockField} onSubmit={jest.fn()} onSkip={jest.fn()} />)
  expect(screen.getByText('确认')).toBeDisabled()
})
