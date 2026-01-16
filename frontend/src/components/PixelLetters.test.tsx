import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import PixelLetters from './PixelLetters'

describe('PixelLetters', () => {
  it('should render all pixel letters', () => {
    render(<PixelLetters />)
    const gridItems = document.querySelectorAll('.grid')
    expect(gridItems.length).toBeGreaterThan(0)
  })

  it('should have correct structure', () => {
    const { container } = render(<PixelLetters />)
    expect(container.querySelector('.flex')).toBeInTheDocument()
    expect(container.querySelector('.gap-1')).toBeInTheDocument()
  })
})
