/* Generated C (illustrative; #line omitted) */
#include <stdbool.h>
#include <stdint.h>

typedef struct { int32_t legs; int32_t sound; } delta__Animal;
typedef struct { int32_t legs; int32_t sound; bool goodBoy; } delta__Dog;

int32_t main(void) {
    const delta__Dog rex = (delta__Dog){ .legs = 4, .sound = 1, .goodBoy = true };
    return rex.legs;
}
