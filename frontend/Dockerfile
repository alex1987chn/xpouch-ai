# 阶段 1: 构建
FROM node:22-alpine AS builder

# 安装 pnpm
RUN npm install -g pnpm

WORKDIR /app

# 复制 monorepo 配置文件（根目录）
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY package.json ./

# 复制前端项目文件
COPY frontend/package.json ./frontend/
COPY frontend/vite.config.ts ./frontend/
COPY frontend/tsconfig.json ./frontend/
COPY frontend/tsconfig.app.json ./frontend/
COPY frontend/tsconfig.node.json ./frontend/
COPY frontend/tailwind.config.js ./frontend/ 2>/dev/null || true
COPY frontend/postcss.config.js ./frontend/ 2>/dev/null || true
COPY frontend/index.html ./frontend/
COPY frontend/.env.production ./frontend/ 2>/dev/null || true
COPY frontend/src ./frontend/src/
COPY frontend/public ./frontend/public/

# 验证文件复制成功
RUN ls -la /app/package.json || (echo "package.json 未复制成功" && exit 1)
RUN ls -la /app/pnpm-lock.yaml || (echo "pnpm-lock.yaml 未复制成功" && exit 1)
RUN ls -la /app/pnpm-workspace.yaml || (echo "pnpm-workspace.yaml 未复制成功" && exit 1)
RUN ls -la /app/frontend/vite.config.ts || (echo "vite.config.ts 未复制成功" && exit 1)
RUN ls -la /app/frontend/package.json || (echo "frontend/package.json 未复制成功" && exit 1)

# 安装依赖（在根目录，会根据 pnpm-workspace.yaml 安装所有 workspaces）
RUN pnpm install --frozen-lockfile

# 构建前端（进入 frontend 目录）
WORKDIR /app/frontend
RUN pnpm run build

# 验证构建产物
RUN ls -la /app/frontend/dist || (echo "dist 目录未生成，构建失败" && exit 1)
RUN ls -la /app/frontend/dist/index.html || (echo "index.html 未生成，构建失败" && exit 1)

# 阶段 2: 运行 (Nginx)
FROM nginx:alpine

# 从构建阶段复制打包好的文件到 Nginx 目录
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

# 复制自定义的 nginx 配置
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

# 验证 Nginx 文件复制成功
RUN ls -la /usr/share/nginx/html || (echo "Nginx 静态文件未复制成功" && exit 1)
RUN ls -la /usr/share/nginx/html/index.html || (echo "index.html 未复制到 Nginx 目录" && exit 1)

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
