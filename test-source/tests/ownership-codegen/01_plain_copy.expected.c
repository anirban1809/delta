#include <stdint.h>
#include <stdbool.h>

typedef struct delta__Point {
	int32_t x;
	int32_t y;
} delta__Point;

int32_t delta_main();

int32_t delta_main() {
	const delta__Point a = (delta__Point){ .x = 1, .y = 2 };
	const delta__Point b = a;
	return b.x;
}

int main() {
	return (int)delta_main();
}
