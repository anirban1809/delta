#include <stdint.h>
#include <stdbool.h>

int32_t compute(int32_t x);
int32_t delta_main();

int32_t compute(int32_t x) {
    const int32_t offset = 10;
    const int32_t scale = 3;
    return (x + offset) * scale;
}

int32_t delta_main() {
    return compute(4);
}

int main() {
    return (int)delta_main();
}
