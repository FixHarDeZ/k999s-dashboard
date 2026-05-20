.PHONY: dev build test

dev:
	@echo "Starting dev mode..."
	@(cd web && npm run dev) &
	@go run ./cmd/k999s --port 8080

build:
	@echo "Building frontend..."
	cd web && npm run build
	@echo "Building Go binary..."
	go build -o k999s ./cmd/k999s

test:
	go test ./... -v
	cd web && npx vitest run

lint:
	golangci-lint run
