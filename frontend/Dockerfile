# 阶段 1: 构建
FROM node:22-alpine as builder

# 安装 pnpm
RUN npm install -g pnpm

WORKDIR /app

# 复制依赖文件并安装（利用 Docker 缓存）
# 注意：生产环境使用 --frozen-lockfile 确保依赖版本一致性
# 部署前需要确保 pnpm-lock.yaml 与 package.json 同步（运行 pnpm install）
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

# 复制源码并构建
COPY . .
RUN pnpm run build

# 阶段 2: 运行 (Nginx)
FROM nginx:alpine
# 从构建阶段复制打包好的文件到 Nginx 目录
COPY --from=builder /app/dist /usr/share/nginx/html
# 复制自定义的 nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
