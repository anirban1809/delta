/* Generated C (illustrative; #line omitted) — `&T` -> `const T*` */
#include <stdint.h>

typedef struct { double x; double y; double z; } delta__Vec3;

double lengthSquared(const delta__Vec3* v) {
    return v->x * v->x + v->y * v->y + v->z * v->z;
}

int32_t main(void) {
    delta__Vec3 p = (delta__Vec3){ .x = 1.0, .y = 2.0, .z = 2.0 };
    const double n = lengthSquared(&p);
    return (int32_t)n;
}
