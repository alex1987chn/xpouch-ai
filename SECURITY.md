# 安全策略

## 支持的版本

我们目前为以下版本提供安全更新：

| 版本 | 支持状态 |
|------|----------|
| 3.0.x | ✅ 主动支持 |
| < 3.0 | ❌ 不再支持 |

## 报告安全漏洞

我们非常重视安全问题。如果您发现了安全漏洞，请通过以下方式报告：

### 报告方式

**请勿**在公开的 GitHub Issue 中报告安全漏洞。

请发送邮件至项目维护者（通过 GitHub 个人主页获取联系方式），邮件主题请包含 `[SECURITY]` 前缀。

### 报告内容

请尽可能提供以下信息：

1. **漏洞描述**：清晰描述漏洞类型和影响
2. **复现步骤**：详细的复现步骤
3. **影响范围**：哪些版本受影响
4. **潜在影响**：漏洞可能造成的危害
5. **修复建议**（可选）：如果您有修复建议

### 响应流程

1. **确认收到**：我们会在 48 小时内确认收到报告
2. **评估阶段**：我们会在 7 天内完成初步评估
3. **修复阶段**：根据严重程度，我们会在合理时间内修复
4. **披露阶段**：修复后会发布安全公告

## 安全最佳实践

### 部署安全

- **JWT 密钥**：生产环境请使用强随机密钥
- **数据库密码**：使用复杂密码，定期更换
- **API 密钥**：妥善保管，不要在代码中硬编码
- **HTTPS**：生产环境强制使用 HTTPS

### 环境变量

确保正确配置以下安全相关环境变量：

```env
# 使用强随机密钥（生成命令：python -c "import secrets; print(secrets.token_urlsafe(32))")
JWT_SECRET_KEY=your-secure-random-key

# 生产环境
ENVIRONMENT=production

# CORS 白名单
CORS_ORIGINS=https://your-domain.com
```

### 依赖安全

定期检查依赖项安全更新：

```bash
# 前端
pnpm audit

# 后端
pip list --outdated
```

## 已知安全问题

我们会在这里列出已知的安全问题和修复状态：

| 问题 | 严重程度 | 影响版本 | 修复版本 | 状态 |
|------|----------|----------|----------|------|
| 暂无 | - | - | - | - |

## 安全相关配置

### CORS 配置

生产环境请限制允许的域名：

```env
CORS_ORIGINS=https://your-domain.com,https://app.your-domain.com
```

### 认证配置

```env
# Access token 有效期（天）
ACCESS_TOKEN_EXPIRE_DAYS=30

# Refresh token 有效期（天）
REFRESH_TOKEN_EXPIRE_DAYS=60
```

## 安全更新通知

建议订阅以下方式获取安全更新通知：

1. **Watch 本仓库**：在 GitHub 上 Watch 本仓库，选择 "Releases only"
2. **GitHub Security Advisories**：我们会通过 GitHub Security Advisories 发布安全公告

## 致谢

感谢所有负责任地报告安全问题的研究人员和用户！
