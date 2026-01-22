import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AgentCard from './AgentCard'
import type { Agent } from '@/types'

const mockAgent: Agent = {
  id: 'assistant',
  name: 'Test Agent',
  description: 'Test description',
  icon: <span>Icon</span>,
  color: 'from-blue-500 to-purple-500',
  category: 'Test',
  modelId: 'deepseek-chat'
}

describe('AgentCard', () => {
  it('should render agent information', () => {
    render(<AgentCard agent={mockAgent} isSelected={false} onClick={vi.fn()} />)

    expect(screen.getByText('Test Agent')).toBeInTheDocument()
    expect(screen.getByText('Test description')).toBeInTheDocument()
    expect(screen.getByText('Test')).toBeInTheDocument()
  })

  it('should call onClick when clicked', () => {
    const handleClick = vi.fn()
    const { container } = render(
      <AgentCard agent={mockAgent} isSelected={false} onClick={handleClick} />
    )

    const card = container.querySelector('.cursor-pointer') as HTMLElement
    fireEvent.click(card)

    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('should apply selected styles when isSelected is true', () => {
    const { container } = render(
      <AgentCard agent={mockAgent} isSelected={true} onClick={vi.fn()} />
    )

    const card = container.querySelector('.cursor-pointer')
    expect(card).toHaveClass('bg-white/80')
  })

  it('should apply unselected styles when isSelected is false', () => {
    const { container } = render(
      <AgentCard agent={mockAgent} isSelected={false} onClick={vi.fn()} />
    )

    const card = container.querySelector('.cursor-pointer')
    expect(card).toHaveClass('bg-white/60')
  })
})
