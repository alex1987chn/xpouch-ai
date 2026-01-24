# Changelog

All notable changes to XPouch AI will be documented in this file.

## [Unreleased]

## [0.2.0] - 2026-01-24

### 🎨 UI/UX Improvements

**Sidebar Optimization:**
- Fixed recent conversation icon alignment (removed top margin)
- Now properly aligned with function menu icons
- Mobile-only sidebar mode (collapse/expand buttons hidden on mobile)
- Sidebar remains in expanded mode on mobile devices

**Agent Card Design:**
- Removed gradient color from default assistant badge
- Changed to neutral color (slate-400/600)
- Cleaner, less prominent appearance

### 🧹 Code Cleanup

**Debug Log Removal:**
- Removed 10 backend test scripts
- Cleaned up 30+ backend debug log statements
- Removed 20+ frontend debug log statements
- Retained critical error and warning logs

**Modified Files:**
- `backend/*.py` (10 test scripts deleted)
- `backend/main.py` (debug logs removed)
- `backend/agents/commander.py` (debug logs removed)
- `frontend/src/store/chatStore.ts` (debug logs removed)
- `frontend/src/hooks/useChat.ts` (debug logs removed)
- `frontend/src/services/api.ts` (debug logs removed)
- `frontend/src/hooks/useArtifactListener.ts` (debug logs removed)
- `frontend/src/components/CanvasChatPage.tsx` (debug logs removed)
- `frontend/src/components/FloatingChatPanel.tsx` (debug logs removed)
- `frontend/src/components/Sidebar.tsx` (UI optimization)
- `frontend/src/components/SidebarMenu.tsx` (icon alignment)
- `frontend/src/components/AgentCard.tsx` (badge color removed)
- `frontend/src/components/ChatPage.tsx` (debug logs removed)
- `frontend/src/components/HomePage.tsx` (debug logs removed)

### 🐛 Bug Fixes

**Sidebar JSX Syntax Error:**
- Fixed unclosed `<SidebarUserSection>` component
- Changed from incorrect `>` to correct `/>` self-closing tag

### 📊 Statistics

- **Files Changed**: 17 files
- **Lines Added**: +166
- **Lines Removed**: -463
- **Test Scripts Deleted**: 2

## [0.1.0] - 2026-01-24

### 🐛 Bug Fixes

**Conversation ID Inconsistency:**
- Fixed issue where multiple conversation IDs were created for consecutive messages in simple mode
- Ensured store ID is properly set before navigation
- Added ID synchronization checks in chat page initialization

**History Page Display:**
- Removed complex agent grouping logic
- Restored simple flat list display
- All conversations shown in chronological order

### 🎨 UI/UX Improvements

**Message Bubble Spacing:**
- Reduced double padding: Card `p-3` (12px) + CardContent `p-0` = 12px
- Previous: Card `p-4` (16px) + CardContent `p-3` (12px) = 28px

**Text Line Height and Spacing:**
- Added `leading-6` to user messages
- Configured prose styles for optimal readability

**Button Layout Optimization:**
- New flex-col container wrapping Card and buttons
- Dynamic alignment based on `msg.role`

**Button Style Optimization (ChatGPT/DeepSeek inspired):**
- Removed background color, use text-only icons
- Smaller border radius: `rounded-lg` → `rounded-md`
- Dark mode support added

### 🔧 Dependency Updates

**Frontend Core Dependencies:**
- **Vite**: ^5.4.17 → ^7.3.1 (major upgrade)
- **Framer Motion**: ^11.15.0 → ^12.29.0 (major upgrade)
- **Lucide React**: ^0.462.0 → ^0.563.0

**Developer Tools:**
- **@vitejs/plugin-react**: ^4.3.4 → ^5.1.2
- **@sentry/react**: ^10.33.0 → ^10.36.0
- **@sentry/vite-plugin**: ^4.6.1 → ^4.7.0

### 📊 Project Status

- **Build Time**: 6.19s
- **Package Size**: Main chunk 1.05 MB
- **Compatibility**: Node 22 + React 18 fully supported

---

## Version Format

This project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html):

- **MAJOR**: Incompatible API changes
- **MINOR**: Backwards-compatible functionality additions
- **PATCH**: Backwards-compatible bug fixes

---

## Change Types

- `Added`: New features
- `Changed`: Changes to existing functionality
- `Deprecated`: Soon-to-be removed features
- `Removed`: Removed features
- `Fixed`: Bug fixes
- `Security`: Security vulnerability fixes
