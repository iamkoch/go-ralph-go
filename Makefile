.PHONY: build clean

build:
	go build -o ralph ./cmd/ralph

clean:
	rm -f ralph
