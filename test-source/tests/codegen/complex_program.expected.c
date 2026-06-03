#include <stdint.h>
#include <stdbool.h>

int32_t abs_diff(int32_t a, int32_t b);
int32_t clamp(int32_t x, int32_t lo, int32_t hi);
int32_t step(int32_t value, int32_t target);
int32_t delta_main();

static const bool debug_mode = false;
static const int32_t max_step = 100;

int32_t abs_diff(int32_t a, int32_t b) {
    if (a > b) {
        return a - b;
    } else {
        return b - a;
    }
}

int32_t clamp(int32_t x, int32_t lo, int32_t hi) {
    if (x < lo) {
        return lo;
    } else {
        if (x > hi) {
            return hi;
        } else {
            return x;
        }
    }
}

int32_t step(int32_t value, int32_t target) {
    int32_t diff = abs_diff(value, target);
    int32_t bounded = clamp(diff, 0, max_step);
    if (debug_mode) {
        return bounded + 1;
    } else {
        return bounded;
    }
}

int32_t delta_main() {
    int32_t result = 0;
    int32_t i = 0;
    while (i < 5) {
        result = result + step(i, 3);
        i = i + 1;
    }
    return result;
}

int main() {
    return (int)delta_main();
}
