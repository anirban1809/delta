/* Generated C: build/<mode>/c/main.c (illustrative; #line omitted) */
/* Imported symbols are referenced via extern; definitions live in geometry.c.
   `main` is the one unmangled symbol so it is the process entry point. */
#include <stdint.h>

typedef struct { double x; double y; double z; } delta__geometry__Vec3;

extern double delta__geometry__Vec3__lengthSquared(const delta__geometry__Vec3*);
extern delta__geometry__Vec3 delta__geometry__add(
        const delta__geometry__Vec3*, const delta__geometry__Vec3*);

int32_t main(void) {
    const delta__geometry__Vec3 a = { .x = 1.0, .y = 2.0, .z = 3.0 };
    const delta__geometry__Vec3 b = { .x = 4.0, .y = 5.0, .z = 6.0 };
    const delta__geometry__Vec3 sum = delta__geometry__add(&a, &b);
    const double lenSq = delta__geometry__Vec3__lengthSquared(&sum);
    return (int32_t)lenSq;
}
