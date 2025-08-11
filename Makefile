# Hono API Docker 管理 Makefile

.PHONY: help build up down restart logs status clean dev prod

# 默认目标
.DEFAULT_GOAL := help

# 项目配置
PROJECT_NAME := hono-api
COMPOSE_FILE := docker-compose.yml

help: ## 显示帮助信息
	@echo "Hono API Docker 管理命令:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'
	@echo ""

# 环境准备
setup: ## 初始化环境配置
	@echo "设置环境配置..."
	@if [ \! -f .env ]; then cp .env.example .env && echo "已创建 .env 文件，请编辑配置"; else echo ".env 文件已存在"; fi
	@echo "请确保设置了 OPENAI_API_KEY"

# 构建相关
build: ## 构建 Docker 镜像
	@echo "构建 Docker 镜像..."
	docker-compose build

rebuild: ## 强制重新构建镜像（无缓存）
	@echo "强制重新构建 Docker 镜像..."
	docker-compose build --no-cache

# 服务管理
up: ## 启动服务
	@echo "启动服务..."
	docker-compose up -d

down: ## 停止服务
	@echo "停止服务..."
	docker-compose down

restart: ## 重启服务
	@echo "重启服务..."
	docker-compose restart

stop: ## 停止服务（不删除容器）
	@echo "停止服务..."
	docker-compose stop

start: ## 启动已存在的服务
	@echo "启动服务..."
	docker-compose start

# 开发环境
dev: ## 启动开发环境（带日志输出）
	@echo "启动开发环境..."
	docker-compose up

dev-build: ## 构建并启动开发环境
	@echo "构建并启动开发环境..."
	docker-compose up --build

# 生产环境
prod: setup build ## 生产环境部署（完整流程）
	@echo "生产环境部署..."
	docker-compose up -d
	@echo "等待服务启动..."
	@sleep 10
	@make health

prod-nginx: setup build ## 带 Nginx 的生产环境部署
	@echo "带 Nginx 的生产环境部署..."
	docker-compose --profile with-nginx up -d
	@echo "等待服务启动..."
	@sleep 15
	@make health

# 监控和调试
logs: ## 查看服务日志
	docker-compose logs -f

logs-api: ## 查看 API 服务日志
	docker-compose logs -f hono-api

status: ## 查看服务状态
	@echo "服务状态:"
	docker-compose ps
	@echo ""
	@echo "资源使用:"
	@docker stats --no-stream $$(docker-compose ps -q) 2>/dev/null || echo "无运行中的容器"

health: ## 健康检查
	@echo "执行健康检查..."
	@curl -f http://localhost:3000/api/v1/speech-to-text/status 2>/dev/null && echo "✅ 服务健康" || echo "❌ 服务异常"

shell: ## 进入容器 shell
	docker-compose exec hono-api sh

# 维护清理
clean: ## 清理未使用的 Docker 资源
	@echo "清理 Docker 资源..."
	docker system prune -f
	docker image prune -f

clean-all: down ## 停止服务并清理所有相关资源
	@echo "清理所有相关资源..."
	docker-compose down -v --rmi all
	docker system prune -f

update: ## 更新并重新部署
	@echo "更新服务..."
	git pull
	docker-compose down
	docker-compose up -d --build
	@echo "等待服务启动..."
	@sleep 10
	@make health

# 备份和恢复
backup: ## 备份配置文件
	@echo "备份配置文件..."
	@mkdir -p backups
	@tar -czf backups/config-$$(date +%Y%m%d-%H%M%S).tar.gz .env docker-compose.yml nginx.conf Dockerfile
	@echo "配置文件已备份到 backups/ 目录"

backup-image: ## 备份 Docker 镜像
	@echo "备份 Docker 镜像..."
	@mkdir -p backups
	docker save $(PROJECT_NAME) | gzip > backups/$(PROJECT_NAME)-$$(date +%Y%m%d-%H%M%S).tar.gz
	@echo "镜像已备份到 backups/ 目录"

# 测试
test: ## 运行 API 测试
	@echo "运行 API 测试..."
	@echo "测试服务状态..."
	@curl -s http://localhost:3000/api/v1/speech-to-text/status | jq . || echo "JSON 解析失败，请检查 jq 是否安装"

# 快捷操作
quick-start: setup build up health ## 快速启动（完整流程）
	@echo "🚀 Hono API 已启动！"
	@echo "📚 API 文档: http://localhost:3000/api/v1/doc"
	@echo "🔍 健康检查: http://localhost:3000/api/v1/speech-to-text/status"
EOF < /dev/null