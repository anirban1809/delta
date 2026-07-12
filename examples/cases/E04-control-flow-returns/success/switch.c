/* Generated C (illustrative; #line omitted) — multi-label -> stacked C cases, no fall-through */
#include <stdint.h>

int32_t dayKind(int32_t day) {
    switch (day) {
        case 0: case 6: { return 1; }
        case 1: case 2: case 3: case 4: case 5: { return 0; }
        default: { return (int32_t)0 - 1; }
    }
}

int32_t main(void) {
    return dayKind(3);
}
