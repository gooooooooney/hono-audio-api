# Hono API Docker 部署指南

## 概述

本指南将帮助你使用 Docker 和 Docker Compose 在服务器上部署 Hono API 项目。该项目提供了 VAD（语音活动检测）+ Speech-to-Text（语音转文字）API 服务。

## 系统要求

### 最低配置
- **CPU**: 1 核心
- **内存**: 1GB RAM
- **存储**: 2GB 可用空间
- **网络**: 可访问 OpenAI API

### 推荐配置
- **CPU**: 2+ 核心
- **内存**: 2GB+ RAM
- **存储**: 5GB+ 可用空间
- **网络**: 稳定的互联网连接

### 软件依赖
- Docker 20.10+
- Docker Compose 2.0+
- curl（用于健康检查）

## 快速开始

### 1. 准备环境变量

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑环境变量（必须设置 OpenAI API Key）
nano .env
```

**重要**: 必须设置 `OPENAI_API_KEY`，否则语音转文字功能无法工作。

### 2. 使用 Docker Compose 部署（推荐）

```bash
# 构建并启动服务
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f hono-api
```

### 3. 验证部署

```bash
# 检查服务健康状态
curl http://localhost:3000/api/v1/speech-to-text/status

# 访问 API 文档
curl http://localhost:3000/api/v1/doc
```

## 详细部署步骤

### 步骤 1: 克隆代码

```bash
# 如果还没有代码，先克隆仓库
git clone <your-repo-url>
cd hono-api
```

### 步骤 2: 配置环境变量

编辑 `.env` 文件：

```bash
# 必需配置
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxx

# 可选配置（使用默认值即可）
PORT=3000
NODE_ENV=production
LOG_LEVEL=info
VAD_THRESHOLD=0.4
VAD_MIN_DURATION=200
```

### 步骤 3: 构建镜像

```bash
# 方式 1: 使用 Docker Compose（推荐）
docker-compose build

# 方式 2: 直接使用 Docker
docker build -t hono-api .
```

### 步骤 4: 启动服务

#### 使用 Docker Compose（推荐）

```bash
# 后台启动所有服务
docker-compose up -d

# 启动特定服务
docker-compose up -d hono-api

# 带 Nginx 反向代理启动
docker-compose --profile with-nginx up -d
```

#### 使用纯 Docker

```bash
# 创建网络
docker network create hono-network

# 启动容器
docker run -d \
  --name hono-api \
  --network hono-network \
  -p 3000:3000 \
  --env-file .env \
  --restart unless-stopped \
  hono-api
```

### 步骤 5: 验证服务

```bash
# 检查容器状态
docker-compose ps

# 查看日志
docker-compose logs -f hono-api

# 健康检查
curl -f http://localhost:3000/api/v1/speech-to-text/status

# 测试 API（如果有测试音频文件）
curl -X POST http://localhost:3000/api/v1/speech-to-text/transcribe \
  -H "Content-Type: application/json" \
  -d '{
    "audio": "base64_encoded_audio_data",
    "language": "zh",
    "minDurationMs": 200,
    "minProbability": 0.4
  }'
```

## 生产环境配置

### 1. 使用 Nginx 反向代理

启用 Nginx 配置：

```bash
# 启动带 Nginx 的完整服务
docker-compose --profile with-nginx up -d

# 访问服务（通过 Nginx）
curl http://localhost/api/v1/speech-to-text/status
```

### 2. HTTPS 配置

如需 HTTPS，请：

1. 准备 SSL 证书文件
2. 创建 `ssl` 目录并放置证书
3. 修改 `nginx.conf` 中的 HTTPS 配置
4. 重启服务

```bash
# 创建 SSL 目录
mkdir -p ssl

# 复制证书文件
cp your-cert.pem ssl/cert.pem
cp your-key.pem ssl/key.pem

# 修改 nginx.conf 启用 HTTPS 配置
# 然后重启服务
docker-compose restart nginx
```

### 3. 资源限制

在 `docker-compose.yml` 中已配置资源限制：

- **内存限制**: 512MB
- **CPU 限制**: 0.5 核心
- **内存预留**: 256MB
- **CPU 预留**: 0.25 核心

### 4. 日志管理

```bash
# 查看实时日志
docker-compose logs -f hono-api

# 限制日志输出行数
docker-compose logs --tail=100 hono-api

# 清理日志（注意：会删除容器）
docker-compose down
docker-compose up -d
```

## 常用命令

### 服务管理

```bash
# 启动服务
docker-compose up -d

# 停止服务
docker-compose down

# 重启服务
docker-compose restart hono-api

# 更新服务（重新构建）
docker-compose up -d --build

# 查看服务状态
docker-compose ps

# 查看资源使用情况
docker stats $(docker-compose ps -q)
```

### 日志和调试

```bash
# 查看日志
docker-compose logs -f hono-api

# 进入容器调试
docker-compose exec hono-api sh

# 查看容器详细信息
docker inspect $(docker-compose ps -q hono-api)
```

### 数据和备份

```bash
# 备份配置文件
tar -czf hono-api-config-$(date +%Y%m%d).tar.gz .env docker-compose.yml nginx.conf

# 导出镜像
docker save hono-api | gzip > hono-api-image.tar.gz

# 导入镜像
gunzip -c hono-api-image.tar.gz | docker load
```

## 故障排查

### 常见问题

#### 1. 服务无法启动

```bash
# 检查日志
docker-compose logs hono-api

# 常见原因：
# - OPENAI_API_KEY 未设置
# - 端口被占用
# - 内存不足
```

#### 2. API 响应错误

```bash
# 检查 OpenAI API 配置
curl http://localhost:3000/api/v1/speech-to-text/status

# 检查环境变量
docker-compose exec hono-api env | grep OPENAI
```

#### 3. 容器频繁重启

```bash
# 查看资源使用情况
docker stats $(docker-compose ps -q)

# 检查健康检查状态
docker-compose ps
```

### 性能调优

#### 1. 内存优化

```bash
# 修改 docker-compose.yml 中的内存限制
deploy:
  resources:
    limits:
      memory: 1G  # 增加到 1GB
```

#### 2. CPU 优化

```bash
# 增加 CPU 限制
deploy:
  resources:
    limits:
      cpus: '1.0'  # 增加到 1 核心
```

#### 3. 并发处理

在 `.env` 中调整：

```bash
# 增加 UV 线程池大小
UV_THREADPOOL_SIZE=8

# 调整 Node.js 内存限制
NODE_OPTIONS=--max-old-space-size=1024
```

## 监控和维护

### 1. 健康检查

```bash
# 手动健康检查
curl -f http://localhost:3000/api/v1/speech-to-text/status

# 查看 Docker 健康状态
docker-compose ps
```

### 2. 定期维护脚本

创建维护脚本 `maintenance.sh`：

```bash
#!/bin/bash
# Hono API 维护脚本

echo "开始维护 Hono API..."

# 清理未使用的镜像
docker image prune -f

# 清理未使用的容器
docker container prune -f

# 重启服务
docker-compose restart hono-api

# 健康检查
sleep 10
curl -f http://localhost:3000/api/v1/speech-to-text/status

echo "维护完成！"
```

### 3. 日志轮转

配置 Docker 日志轮转：

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

## 安全考虑

1. **API 密钥管理**: 使用 Docker secrets 或环境变量文件管理敏感信息
2. **网络隔离**: 使用自定义 Docker 网络隔离服务
3. **用户权限**: 容器内使用非 root 用户运行应用
4. **防火墙**: 只暴露必要的端口
5. **SSL/TLS**: 在生产环境中启用 HTTPS

## 扩展部署

### 多实例部署

```yaml
# docker-compose.yml 扩展配置
version: '3.8'
services:
  hono-api:
    # ... 原有配置
    deploy:
      replicas: 3
    
  nginx:
    # ... 配置负载均衡
```

### 监控集成

```bash
# 添加 Prometheus 监控
# 在 docker-compose.yml 中添加监控服务
```

## 更新和回滚

### 更新服务

```bash
# 拉取最新代码
git pull

# 重新构建并部署
docker-compose up -d --build

# 验证更新
curl http://localhost:3000/api/v1/speech-to-text/status
```

### 回滚操作

```bash
# 回到之前的版本
git checkout <previous-commit>

# 重新构建
docker-compose up -d --build
```

## 支持和反馈

如遇到问题，请：

1. 查看本文档的故障排查部分
2. 检查项目 issues
3. 提供详细的日志信息

**记住**: 始终保护好你的 OpenAI API 密钥，不要将其提交到代码仓库中！