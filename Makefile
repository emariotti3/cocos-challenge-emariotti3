.DEFAULT_GOAL := help
COMPOSE ?= docker compose

help: ## Show available targets
	@grep -E '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

up: ## Build and start api + postgres
	$(COMPOSE) up --build -d

down: ## Stop and remove containers (keeps the database volume)
	$(COMPOSE) down

clean: ## Stop and remove containers AND volumes
	$(COMPOSE) down -v

logs: ## Tail api logs
	$(COMPOSE) logs -f api

db: ## Start only postgres (for local `npm run start:dev`)
	$(COMPOSE) up -d postgres

psql: ## Open a psql shell inside the postgres container
	$(COMPOSE) exec postgres psql -U cocos -d cocos

migrate: ## Apply migrations and seed against DATABASE_URL (.env)
	npm run db:migrate && npm run db:status

install: ## Install dependencies
	npm ci

lint: ## Lint, format check and typecheck
	npm run lint && npm run format:check && npm run typecheck

test: ## Unit tests with coverage
	npm run test:cov

test-e2e: ## Integration tests (Testcontainers)
	npm run test:e2e

k6-smoke: ## k6 smoke test against BASE_URL (default http://localhost:3000)
	npm run k6:smoke

k6-load: ## k6 load test
	npm run k6:load

observability: ## Start api + postgres + prometheus + grafana
	$(COMPOSE) --profile observability up --build -d

.PHONY: help up down clean logs db psql migrate install lint test test-e2e k6-smoke k6-load observability
