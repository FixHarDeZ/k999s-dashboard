.PHONY: dev build test release

VERSION := $(shell cat VERSION | tr -d '[:space:]')
LDFLAGS := -s -w -X main.Version=v$(VERSION)

dev:
	@echo "Starting dev mode..."
	@(cd web && npm run dev) &
	@go run ./cmd/k999s --port 8080

build:
	@echo "Building frontend..."
	cd web && npm run build
	@echo "Building Go binary..."
	go build -ldflags "$(LDFLAGS)" -o k999s ./cmd/k999s

test:
	go test ./... -v
	cd web && npx vitest run

release:
	./scripts/release.sh $(VERSION)

release-install:
	./scripts/release.sh $(VERSION) --install

lint:
	golangci-lint run
