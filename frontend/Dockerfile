# 阶段 1: 构建
FROM node:24-alpine AS builder

# 安装 pnpm（钉住大版本 12，与根 package.json 的 packageManager 大版本一致；
# pnpm 12 = Rust 重写版，命令/flag/设置/lockfile 格式沿用 11；
# allowBuilds / minimumReleaseAge 策略读取根 pnpm-workspace.yaml）
RUN npm install -g pnpm@12

WORKDIR /app

# 复制 monorepo 配置文件（根目录）
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY package.json ./

# 版本号的唯一真相源：vite.config.ts 构建时读它注入 __APP_VERSION__（前端不自己存版本）。
# 必须保持 ./backend/ 这一层目录结构——vite.config.ts 按 <cwd>/backend/pyproject.toml 查找；
# 缺了它构建会直接失败并提示找不到真相源（不会静默注入 undefined）。
COPY backend/pyproject.toml ./backend/

# 复制前端项目文件
# 注：Tailwind 4 迁移后 postcss.config.js 已删除（改用 @tailwindcss/vite 插件），勿再复制
COPY frontend/package.json ./frontend/
COPY frontend/vite.config.ts ./frontend/
COPY frontend/tsconfig.json ./frontend/
COPY frontend/tsconfig.node.json ./frontend/
COPY frontend/tailwind.config.ts ./frontend/
COPY frontend/index.html ./frontend/
# P0 修复: 不复制 .env 文件，避免敏感信息泄露到镜像中
# 环境变量通过构建参数或运行时注入
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

# 随镜像分发 NOTICE（Apache-2.0 §4d：二进制分发须随附声明文件；置于 Web 根，/NOTICE 可公开访问）
COPY NOTICE /usr/share/nginx/html/NOTICE

# 验证 Nginx 文件复制成功
RUN ls -la /usr/share/nginx/html || (echo "Nginx 静态文件未复制成功" && exit 1)
RUN ls -la /usr/share/nginx/html/index.html || (echo "index.html 未复制到 Nginx 目录" && exit 1)

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
