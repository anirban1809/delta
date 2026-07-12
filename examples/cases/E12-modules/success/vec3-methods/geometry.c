/* Generated C: build/<mode>/c/geometry.c (illustrative; #line omitted) */
/* Exported symbols mangle to delta__<module>__<name>. */
#include <stdint.h>

typedef struct { double x; double y; double z; } delta__geometry__Vec3;

double delta__geometry__Vec3__lengthSquared(const delta__geometry__Vec3* v) {
    return v->x * v->x + v->y * v->y + v->z * v->z;
}

delta__geometry__Vec3 delta__geometry__add(
        const delta__geometry__Vec3* a, const delta__geometry__Vec3* b) {
    return (delta__geometry__Vec3){ .x = a->x + b->x, .y = a->y + b->y, .z = a->z + b->z };
}
