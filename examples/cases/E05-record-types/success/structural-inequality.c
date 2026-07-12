/* Generated C (illustrative; #line omitted) */
#include <stdbool.h>
#include <stdint.h>

typedef struct { int32_t x; int32_t y; } delta__Point;

static bool delta__Point__eq(delta__Point a, delta__Point b) {
    return a.x == b.x && a.y == b.y;
}

int32_t main(void) {
    const delta__Point a = (delta__Point){ .x = 1, .y = 2 };
    const delta__Point c = (delta__Point){ .x = 3, .y = 4 };
    const bool diff = !delta__Point__eq(a, c);
    (void)diff;
    return 0;
}
