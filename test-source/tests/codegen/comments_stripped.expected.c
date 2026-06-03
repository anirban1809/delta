#include <stdint.h>
#include <stdbool.h>

int32_t dbl(int32_t x);
int32_t delta_main();

static const int32_t limit = 100;

int32_t dbl(int32_t x) {
    return x * 2;
}

int32_t delta_main() {
    return dbl(limit);
}

int main() {
    return (int)delta_main();
}
