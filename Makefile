BINARY := delta
CMD := ./cmd/delta
BIN_DIR := bin
BIN := $(BIN_DIR)/$(BINARY)
PATH_BIN_DIR ?= $(HOME)/.local/bin
PATH_BIN := $(PATH_BIN_DIR)/$(BINARY)

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
	@mkdir -p "$(PATH_BIN_DIR)"
	@ln -sf "$(abspath $(BIN))" "$(PATH_BIN)"
	@case ":$$PATH:" in \
		*:"$(PATH_BIN_DIR)":*) echo "Linked $(PATH_BIN) -> $(abspath $(BIN))";; \
		*) echo "Linked $(PATH_BIN) -> $(abspath $(BIN))"; \
		   echo "Add $(PATH_BIN_DIR) to PATH to run '$(BINARY)' from anywhere.";; \
	esac

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
