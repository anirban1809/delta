#include <stdint.h>
#include <stdbool.h>

typedef enum delta__Facing {
    delta__Facing_North = 0,
    delta__Facing_East = 90,
    delta__Facing_South = 180,
    delta__Facing_West = 270
} delta__Facing;

int32_t delta_main();

int32_t delta_main() {
    return delta__Facing_East;
}

int main() {
    return (int)delta_main();
}
