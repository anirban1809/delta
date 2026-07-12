/* Generated C (illustrative; #line omitted) — `==` -> generated per-type equality fn */
#include <stdbool.h>
#include <stdint.h>

typedef struct { int32_t x; int32_t y; } delta__Point;

static bool delta__Point__eq(delta__Point a, delta__Point b) {
    return a.x == b.x && a.y == b.y;
}

int32_t main(void) {
    const delta__Point a = (delta__Point){ .x = 1, .y = 2 };
    const delta__Point b = (delta__Point){ .x = 1, .y = 2 };
    const bool same = delta__Point__eq(a, b);
    (void)same;
    return 0;
}
