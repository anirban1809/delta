#include <stdint.h>
#include <stdbool.h>

bool should_run();
int32_t clamp(int32_t x);
int32_t delta_main();

static const int32_t max_iter = 100;
static const int32_t threshold = 42;
static const bool enabled = true;

bool should_run() {
    return enabled;
}

int32_t clamp(int32_t x) {
    if (x > max_iter) {
        return max_iter;
    } else {
        if (x < 0) {
            return 0;
        } else {
            return x;
        }
    }
}

int32_t delta_main() {
    if (should_run()) {
        return clamp(threshold);
    } else {
        return 0;
    }
}

int main() {
    return (int)delta_main();
}
