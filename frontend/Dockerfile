# 阶段 1: 构建
FROM node:22-alpine as builder

# 安装 pnpm
RUN npm install -g pnpm

WORKDIR /app

# 复制前端源码
COPY frontend/package.json ./
COPY frontend/pnpm-lock.yaml ./
COPY frontend/ ./

# 安装依赖
RUN pnpm install

# 构建前端
RUN pnpm run build

# 验证构建产物
RUN ls -la /app/dist || (echo "dist 目录未生成，构建失败" && exit 1)

# 阶段 2: 运行 (Nginx)
FROM nginx:alpine
# 从构建阶段复制打包好的文件到 Nginx 目录
COPY --from=builder /app/dist /usr/share/nginx/html
# 复制自定义的 nginx 配置
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
