# Hono API Docker 镜像
# 多阶段构建优化镜像大小

# ===============================
# 构建阶段
# ===============================
FROM node:20-alpine AS builder

# 设置工作目录
WORKDIR /app

# 安装系统依赖（音频处理可能需要）
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    pkgconfig \
    pixman-dev \
    cairo-dev \
    pango-dev \
    libjpeg-turbo-dev \
    giflib-dev

# 复制 package 文件
COPY package*.json ./
COPY bun.lock* ./

# 安装依赖（包括开发依赖，用于构建）
RUN npm ci --include=dev

# 复制源代码
COPY . .

# 类型检查
RUN npm run check-types

# 构建项目
RUN npm run build

# ===============================
# 生产阶段
# ===============================
FROM node:20-alpine AS production

# 设置工作目录
WORKDIR /app

# 创建非 root 用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S hono -u 1001

# 安装生产环境需要的系统依赖
RUN apk add --no-cache \
    dumb-init \
    tini

# 复制 package 文件
COPY package*.json ./

# 只安装生产依赖
RUN npm ci --only=production && \
    npm cache clean --force

# 从构建阶段复制构建产物
COPY --from=builder /app/dist ./dist

# 复制必要的配置文件
COPY --chown=hono:nodejs tsconfig.json ./

# 设置正确的权限
RUN chown -R hono:nodejs /app
USER hono

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT:-3000}/health || exit 1

# 暴露端口
EXPOSE 3000

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3000

# 使用 tini 作为 init 进程，处理信号
ENTRYPOINT ["tini", "--"]

# 启动应用
CMD ["node", "dist/index.js"]