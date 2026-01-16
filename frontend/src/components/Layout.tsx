import { Outlet, useNavigate } from 'react-router-dom'
import MainChatLayout from '@/components/MainChatLayout'
import { SettingsDialog } from '@/components/SettingsDialog'
import { PersonalSettingsDialog } from '@/components/PersonalSettingsDialog'
import { useState, useEffect } from 'react'
import { useChatStore } from '@/store/chatStore'
import { useUserStore } from '@/store/userStore'

export default function Layout() {
  const navigate = useNavigate()
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isPersonalSettingsOpen, setIsPersonalSettingsOpen] = useState(false)
  const { messages } = useChatStore()
  const { fetchUser } = useUserStore()

  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  return (
    <MainChatLayout
      hasMessages={messages.length > 0}
      onCreateAgent={() => navigate('/create-agent')}
      onSettingsClick={() => setIsSettingsOpen(true)}
      onPersonalSettingsClick={() => setIsPersonalSettingsOpen(true)}
    >
      <Outlet />
      
      <SettingsDialog
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      <PersonalSettingsDialog
        isOpen={isPersonalSettingsOpen}
        onClose={() => setIsPersonalSettingsOpen(false)}
      />
    </MainChatLayout>
  )
}
