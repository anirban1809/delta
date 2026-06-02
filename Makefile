BINARY := delta
CMD := ./cmd/delta
BIN_DIR := bin
BIN := $(BIN_DIR)/$(BINARY)

# Allow `make test <suite>` — the second word becomes the suite name and we
# stub it as a no-op target so make doesn't try to build it.
SUITE := $(or $(word 2,$(MAKECMDGOALS)),all)
ifneq ($(word 2,$(MAKECMDGOALS)),)
$(eval $(word 2,$(MAKECMDGOALS)):;@:)
endif

.PHONY: all build run test gotest fmt clean

all: build

build:
	@mkdir -p $(BIN_DIR)
	go build -o $(BIN) $(CMD)

run:
	go run $(CMD)

test: build
	$(BIN) test $(SUITE)

gotest:
	go test ./...

fmt:
	go fmt ./...

clean:
	rm -rf $(BIN_DIR)
