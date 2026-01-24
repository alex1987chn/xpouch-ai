# 阶段 1: 构建
FROM node:22-alpine as builder

# 安装 pnpm
RUN npm install -g pnpm

WORKDIR /app

# 复制 workspace 配置
COPY pnpm-workspace.yaml ./

# 复制根目录的 package.json 和 lockfile
COPY package.json ./
COPY pnpm-lock.yaml ./

# 复制 frontend 源码到子目录
COPY frontend/ ./frontend/

# 在 frontend 目录下安装依赖（符合 workspace 结构）
WORKDIR /app/frontend
RUN pnpm install --frozen-lockfile

# 构建前端
RUN pnpm run build

# 验证构建产物
RUN ls -la /app/frontend/dist || (echo "dist 目录未生成，构建失败" && exit 1)

# 阶段 2: 运行 (Nginx)
FROM nginx:alpine
# 从构建阶段复制打包好的文件到 Nginx 目录（注意路径：/app/frontend/dist）
COPY --from=builder /app/frontend/dist /usr/share/nginx/html
# 复制自定义的 nginx 配置（从根目录的 frontend 目录）
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
