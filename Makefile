.PHONY: install test run docker-build docker-run up down smoke load chaos

install:
	npm ci

test:
	npm run check && npm test

run:
	npm start

docker-build:
	docker build -t sre-reliability-platform:local .

docker-run: docker-build
	docker run --rm -p 3000:3000 sre-reliability-platform:local

up:
	docker compose up -d --build

down:
	docker compose down -v

smoke:
	sh scripts/smoke.sh

load:
	k6 run loadtest/k6.js

# Generates 5xx traffic (requires CHAOS_ENABLED=true, which docker compose sets)
# to trigger the error-budget burn alerts in Prometheus.
chaos:
	@for i in $$(seq 1 300); do curl -s -o /dev/null http://localhost:3000/api/chaos/error; done; echo "sent 300 failing requests"
