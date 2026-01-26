import { describe, expect, it, beforeEach } from 'vitest'
import { act } from '@testing-library/react'
import { useLoadingStore } from './loadingStore'

describe('useLoadingStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    act(() => {
      useLoadingStore.setState({
        loadingStates: {},
      })
    })
  })

  it('initializes with empty loading states', () => {
    const state = useLoadingStore.getState()
    expect(state.loadingStates).toEqual({})
    // Manually compute derived state
    const isLoading = Object.values(state.loadingStates).some(s => s.isLoading)
    expect(isLoading).toBe(false)
    expect(state.loadingMessage).toBeUndefined()
  })

  it('sets loading state correctly', () => {
    const { setLoading } = useLoadingStore.getState()
    
    act(() => {
      setLoading('test-key', true, 'Loading data...')
    })
    
    const state = useLoadingStore.getState()
    expect(state.loadingStates['test-key']).toEqual({
      isLoading: true,
      message: 'Loading data...'
    })
    // Manually compute derived state
    const isLoading = Object.values(state.loadingStates).some(s => s.isLoading)
    expect(isLoading).toBe(true)
    const loadingMessage = Object.values(state.loadingStates).find(s => s.isLoading)?.message
    expect(loadingMessage).toBe('Loading data...')
  })

  it('clears loading state correctly', () => {
    const { setLoading, clearLoading } = useLoadingStore.getState()
    
    // Set a loading state
    act(() => {
      setLoading('test-key', true, 'Loading data...')
    })
    
    // Verify it's set
    let state = useLoadingStore.getState()
    expect(state.loadingStates['test-key']).toBeDefined()
    const isLoadingBefore = Object.values(state.loadingStates).some(s => s.isLoading)
    expect(isLoadingBefore).toBe(true)
    
    // Clear the loading state
    act(() => {
      clearLoading('test-key')
    })
    
    state = useLoadingStore.getState()
    expect(state.loadingStates['test-key']).toBeUndefined()
    const isLoadingAfter = Object.values(state.loadingStates).some(s => s.isLoading)
    expect(isLoadingAfter).toBe(false)
    const loadingMessage = Object.values(state.loadingStates).find(s => s.isLoading)?.message
    expect(loadingMessage).toBeUndefined()
  })

  it('clears all loading states', () => {
    const { setLoading, clearAllLoading } = useLoadingStore.getState()
    
    // Set multiple loading states
    act(() => {
      setLoading('key1', true, 'Loading 1...')
      setLoading('key2', true, 'Loading 2...')
    })
    
    // Verify they're set
    let state = useLoadingStore.getState()
    expect(Object.keys(state.loadingStates)).toHaveLength(2)
    const isLoadingBefore = Object.values(state.loadingStates).some(s => s.isLoading)
    expect(isLoadingBefore).toBe(true)
    
    // Clear all loading states
    act(() => {
      clearAllLoading()
    })
    
    state = useLoadingStore.getState()
    expect(state.loadingStates).toEqual({})
    const isLoadingAfter = Object.values(state.loadingStates).some(s => s.isLoading)
    expect(isLoadingAfter).toBe(false)
  })

  it('gets specific loading state', () => {
    const { setLoading, getLoadingState } = useLoadingStore.getState()
    
    act(() => {
      setLoading('test-key', true, 'Loading...', { progress: 50 })
    })
    
    const state = getLoadingState('test-key')
    expect(state).toEqual({
      isLoading: true,
      message: 'Loading...',
      metadata: { progress: 50 }
    })
  })

  it('returns undefined for non-existent loading state', () => {
    const { getLoadingState } = useLoadingStore.getState()
    
    const state = getLoadingState('non-existent-key')
    expect(state).toBeUndefined()
  })

  it('derives isLoading correctly when multiple states exist', () => {
    const { setLoading } = useLoadingStore.getState()
    
    // Set some loading states to true
    act(() => {
      setLoading('key1', true, 'Loading...')
      setLoading('key2', false, 'Not loading')
      setLoading('key3', true, 'Also loading...')
    })
    
    const state = useLoadingStore.getState()
    const isLoading = Object.values(state.loadingStates).some(s => s.isLoading)
    expect(isLoading).toBe(true)
    
    // Clear all loading states
    act(() => {
      setLoading('key1', false)
      setLoading('key3', false)
    })
    
    const newState = useLoadingStore.getState()
    const newIsLoading = Object.values(newState.loadingStates).some(s => s.isLoading)
    expect(newIsLoading).toBe(false)
  })

  it('derives loadingMessage correctly from first active state', () => {
    const { setLoading } = useLoadingStore.getState()
    
    // Set multiple loading states, with first one active
    act(() => {
      setLoading('key1', true, 'First message')
      setLoading('key2', true, 'Second message') // This should also be active, but key1 comes first
    })
    
    const state = useLoadingStore.getState()
    // Manually compute loadingMessage (first active state's message)
    const loadingMessage = Object.values(state.loadingStates).find(s => s.isLoading)?.message
    // Since key1 was set first, it should be the first active state found
    expect(loadingMessage).toBe('First message')
  })

  it('handles metadata correctly', () => {
    const { setLoading, getLoadingState } = useLoadingStore.getState()
    
    const metadata = { progress: 75, total: 100, current: 75 }
    
    act(() => {
      setLoading('upload', true, 'Uploading...', metadata)
    })
    
    const state = getLoadingState('upload')
    expect(state?.metadata).toEqual(metadata)
  })
})

// Shim for act if needed
import { act } from '@testing-library/react'