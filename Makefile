BINARY := delta
CMD := ./cmd/delta
BIN_DIR := bin
BIN := $(BIN_DIR)/$(BINARY)

.PHONY: all build run test gotest fmt clean

all: build

build:
	@mkdir -p $(BIN_DIR)
	go build -o $(BIN) $(CMD)

run:
	go run $(CMD)

test: build
	$(BIN) test test-source/tests/tests.json

gotest:
	go test ./...

fmt:
	go fmt ./...

clean:
	rm -rf $(BIN_DIR)
