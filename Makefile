.PHONY: build run test

build:
	npm run build

run:
	npm run start -- $(ARGS)

# `make test` runs every suite; `make test <suite name>` runs just that one,
# e.g. `make test basic`. The catch-all rule below lets the suite name be
# passed as a bare word without make complaining about an unknown target.
test:
	npm run test -- $(filter-out $@,$(MAKECMDGOALS))

%:
	@:
