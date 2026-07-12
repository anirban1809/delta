/* Generated C (illustrative; #line omitted) */
#include <stdbool.h>
#include <stdint.h>

typedef struct { int32_t legs; int32_t sound; } delta__Animal;
typedef struct { int32_t legs; int32_t sound; bool indoor; } delta__Cat;

int32_t main(void) {
    const delta__Cat felix = (delta__Cat){ .legs = 4, .sound = 2, .indoor = true };
    return felix.legs;
}
