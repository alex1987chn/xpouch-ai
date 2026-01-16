export interface Plan {
  tier: string
  description: string
}

export const planLevels: Plan[] = [
  { tier: 'Free', description: '基础试用，探索所有智能体能力' },
  { tier: 'Pilot', description: '起步型订阅，带来更快的上下文反应与自定义提示' },
  { tier: 'Maestro', description: '旗舰级体验，解锁更强大模型与多模态创作' }
]
