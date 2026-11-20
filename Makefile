.PHONY: up down build logs ps migrate seed test reset-code

up:
	docker compose up -d

down:
	docker compose down

build:
	docker compose build

logs:
	docker compose logs -f

ps:
	docker compose ps

migrate:
	pnpm --filter @ai-content-os/database db:migrate

seed:
	pnpm --filter @ai-content-os/database db:seed

test:
	pnpm run test

# Safe reset: restarts containers without deleting persistent volumes
reset-code:
	docker compose down
	docker compose build --no-cache
	docker compose up -d
