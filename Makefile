.PHONY: build test bench clean run

build:
	bun build src/index.tsx --compile --outfile bin/pull-all-tui

test:
	bun test

bench:
	time bin/pull-all-tui --no-tui

run:
	bin/pull-all-tui

clean:
	rm -f bin/pull-all-tui
