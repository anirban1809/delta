#include <stdint.h>
#include <stdbool.h>

typedef struct delta__Vec3 {
    double x;
    double y;
    double z;
} delta__Vec3;

static inline bool delta__Vec3_eq(delta__Vec3 a, delta__Vec3 b) {
    return a.x == b.x && a.y == b.y && a.z == b.z;
}

int32_t delta_main();

int32_t delta_main() {
    const delta__Vec3 a = (delta__Vec3){ .x = 1.0, .y = 2.0, .z = 3.0 };
    const delta__Vec3 b = (delta__Vec3){ .x = 1.0, .y = 2.0, .z = 3.0 };
    if (delta__Vec3_eq(a, b)) {
        return 0;
    }
    return 1;
}

int main() {
    return (int)delta_main();
}
