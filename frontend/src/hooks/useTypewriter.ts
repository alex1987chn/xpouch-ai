import { useState, useEffect, useRef } from 'react'

interface UseTypewriterProps {
  text: string
  speed?: number
  enabled?: boolean
}

export function useTypewriter({ text, speed = 20, enabled = true }: UseTypewriterProps) {
  const [displayText, setDisplayText] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const indexRef = useRef(0)
  const intervalRef = useRef<NodeJS.Timeout>()

  useEffect(() => {
    if (!enabled) {
      setDisplayText(text)
      setIsTyping(false)
      return
    }

    if (!text) {
      setDisplayText('')
      setIsTyping(false)
      indexRef.current = 0
      return
    }

    setIsTyping(true)
    indexRef.current = 0
    setDisplayText('')

    intervalRef.current = setInterval(() => {
      indexRef.current++
      const newIndex = indexRef.current
      if (newIndex <= text.length) {
        setDisplayText(text.slice(0, newIndex))
      } else {
        setIsTyping(false)
        clearInterval(intervalRef.current)
      }
    }, speed)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [text, speed, enabled])

  return { displayText, isTyping }
}
