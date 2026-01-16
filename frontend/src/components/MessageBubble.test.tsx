import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import MessageBubble from './MessageBubble'

describe('MessageBubble', () => {
  it('should render user message correctly', () => {
    render(<MessageBubble content="Hello world" role="user" />)
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })

  it('should render assistant message correctly', () => {
    render(<MessageBubble content="AI response" role="assistant" />)
    expect(screen.getByText('AI response')).toBeInTheDocument()
  })

  it('should apply correct classes for user role', () => {
    const { container } = render(<MessageBubble content="Test" role="user" />)
    const bubble = container.querySelector('div')
    expect(bubble).toHaveClass('bg-gradient-to-r')
  })

  it('should apply correct classes for assistant role', () => {
    const { container } = render(<MessageBubble content="Test" role="assistant" />)
    const bubble = container.querySelector('div')
    expect(bubble).toHaveClass('bg-white/60')
  })

  it('should sanitize HTML content', () => {
    render(<MessageBubble content="<script>alert('xss')</script>Safe" role="assistant" />)
    const bubble = screen.getByText('Safe')
    expect(bubble).toBeInTheDocument()
    // Script tag should not be rendered
    expect(screen.queryByText(/alert/)).not.toBeInTheDocument()
  })
})
