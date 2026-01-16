# 阶段 1: 构建
FROM node:18-alpine as builder
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
# 安装 pnpm
RUN npm install -g pnpm
RUN pnpm install
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
