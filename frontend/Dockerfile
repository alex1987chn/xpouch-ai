# 阶段 1: 构建
FROM node:22-alpine as builder

# 安装 pnpm
RUN npm install -g pnpm

WORKDIR /app

# 复制前端源码（使用根目录的 monorepo lock 文件）
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY frontend/package.json ./
COPY frontend/ ./

# 验证文件复制成功
RUN ls -la /app/package.json || (echo "package.json 未复制成功" && exit 1)
RUN ls -la /app/pnpm-lock.yaml || (echo "pnpm-lock.yaml 未复制成功" && exit 1)
RUN ls -la /app/pnpm-workspace.yaml || (echo "pnpm-workspace.yaml 未复制成功" && exit 1)
RUN ls -la /app/vite.config.ts || (echo "vite.config.ts 未复制成功" && exit 1)

# 安装依赖
RUN pnpm install

# 构建前端
RUN pnpm run build

# 验证构建产物
RUN ls -la /app/dist || (echo "dist 目录未生成，构建失败" && exit 1)
RUN ls -la /app/dist/index.html || (echo "index.html 未生成，构建失败" && exit 1)

# 阶段 2: 运行 (Nginx)
FROM nginx:alpine
# 从构建阶段复制打包好的文件到 Nginx 目录
COPY --from=builder /app/dist /usr/share/nginx/html
# 复制自定义的 nginx 配置
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

# 验证 Nginx 文件复制成功
RUN ls -la /usr/share/nginx/html || (echo "Nginx 静态文件未复制成功" && exit 1)
RUN ls -la /usr/share/nginx/html/index.html || (echo "index.html 未复制到 Nginx 目录" && exit 1)

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
