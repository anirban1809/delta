/* Generated C (illustrative; #line omitted) — `edit &T` -> `T*` */
#include <stdint.h>

typedef struct { double x; double y; double z; } delta__Vec3;

void scale(delta__Vec3* v, double factor) {
    v->x = v->x * factor;
    v->y = v->y * factor;
    v->z = v->z * factor;
}

int32_t main(void) {
    delta__Vec3 p = (delta__Vec3){ .x = 1.0, .y = 2.0, .z = 3.0 };
    scale(&p, 2.0);
    return (int32_t)(p.x + p.y + p.z);
}
